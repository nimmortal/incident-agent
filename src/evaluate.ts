import { spawn } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";

import { parseTaggedStatus } from "./contracts.ts";
import { redactSensitiveText } from "./security.ts";

const caseSchema = z.object({
  id: z.string().min(1),
  issueKey: z.string().min(1),
  expectedIdentifiers: z.array(z.string().min(1)).default([]),
  claimPatterns: z.array(z.string().min(1)).default([]),
  minimumConfidence: z.enum(["low", "medium", "high"]).default("low"),
});
const casesSchema = z.array(caseSchema).min(1);
const confidenceRank = { low: 0, medium: 1, high: 2 } as const;

async function main(): Promise<void> {
  const casesPath = process.argv[2];
  if (!casesPath) throw new Error("Usage: npm run evaluate -- <cases.json>");
  const cases = casesSchema.parse(JSON.parse(readFileSync(resolve(casesPath), "utf8")));
  const results = [];

  for (const evaluation of cases) {
    const startedAt = Date.now();
    const run = await runInvestigation(evaluation.issueKey);
    const status = parseTaggedStatus(run.output, "phase");
    const artifact = status?.artifact?.phase === "synthesis" ? status.artifact : undefined;
    const haystack = artifact ? JSON.stringify(artifact) : "";
    const missingIdentifiers = evaluation.expectedIdentifiers.filter((identifier) => !artifact?.identifiers.includes(identifier));
    const missingClaims = evaluation.claimPatterns.filter((pattern) => !new RegExp(pattern, "i").test(haystack));
    const confidencePass = artifact ? confidenceRank[artifact.confidence] >= confidenceRank[evaluation.minimumConfidence] : false;
    const passed = run.code === 0 && status?.status === "done" && Boolean(artifact) && missingIdentifiers.length === 0 && missingClaims.length === 0 && confidencePass;
    results.push({
      id: evaluation.id,
      issueKey: evaluation.issueKey,
      passed,
      durationMs: Date.now() - startedAt,
      exitCode: run.code,
      finalStatus: status?.status ?? "missing",
      confidence: artifact?.confidence ?? "missing",
      missingIdentifiers,
      missingClaims,
    });
    console.log(`${passed ? "PASS" : "FAIL"} ${evaluation.id} (${Math.round((Date.now() - startedAt) / 1000)}s)`);
  }

  const report = { generatedAt: new Date().toISOString(), passed: results.filter((result) => result.passed).length, total: results.length, results };
  const reportPath = resolve("data", "evaluations", `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  mkdirSync(dirname(reportPath), { recursive: true, mode: 0o700 });
  writeFileSync(reportPath, `${redactSensitiveText(JSON.stringify(report, null, 2))}\n`, { mode: 0o600 });
  chmodSync(reportPath, 0o600);
  console.log(`Report: ${reportPath}`);
  if (report.passed !== report.total) process.exitCode = 1;
}

function runInvestigation(issueKey: string): Promise<{ code: number; output: string }> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/agent-cli.ts", "investigate", issueKey], {
      cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { output += chunk; process.stdout.write(chunk); });
    child.stderr.on("data", (chunk) => { output += chunk; process.stderr.write(chunk); });
    child.once("error", rejectRun);
    child.once("close", (code) => resolveRun({ code: code ?? 1, output }));
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

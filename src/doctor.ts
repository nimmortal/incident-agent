import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

import { loadSettings } from "./config.ts";
import { listFeatures } from "./features.ts";
import { hasHermesSkill, localSkillsPath, runtimeConfigPath, runtimeHome, runtimeSkillsPath, skillsSeedPath } from "./hermes-config.ts";
import { probeCopilotAuth } from "./runtime-preflight.ts";
import { managedSkills, optionalSourceSkills, wrapperSkills } from "./skill-sets.ts";

interface CheckResult {
  label: string;
  ok: boolean;
  required: boolean;
  detail: string;
}

async function main(): Promise<void> {
  const settings = loadSettings();
  const verifySources = process.argv.includes("--verify-sources");
  const strict = process.argv.includes("--strict");
  const checks: CheckResult[] = [];

  console.log("Features:");
  for (const feature of listFeatures(settings.features)) {
    const required = feature.kind === "provider";
    const state = feature.enabled ? "enabled" : `disabled (missing ${feature.missingEnv.join(", ")})`;
    console.log(`- ${feature.name} [${feature.kind}]: ${state}`);
    checks.push({ label: feature.name, ok: feature.enabled || !required, required, detail: state });
  }

  console.log("\nConfig:");
  report(checks, "Hermes config template", existsSync(settings.hermesConfigTemplatePath), true, settings.hermesConfigTemplatePath);
  report(checks, "Prompt templates", existsSync(settings.promptTemplatesDir), true, settings.promptTemplatesDir);
  console.log(`- generated runtime path: ${runtimeConfigPath(settings)}`);
  console.log(`- runtime home: ${runtimeHome(settings)}`);
  console.log(`- runtime skills path: ${runtimeSkillsPath(settings)}`);

  const seedPath = skillsSeedPath(settings);
  const localPath = localSkillsPath(settings);
  const requiredSkills = new Set(wrapperSkills(optionalSourceSkills(settings)));
  console.log(`- bundled skill seed: ${existsSync(seedPath) ? "found" : "missing"} (${seedPath})`);
  console.log(`- local skills path: ${existsSync(localPath) ? "found" : "missing"} (${localPath})`);
  for (const skill of managedSkills) {
    const found = hasHermesSkill(seedPath, skill) || hasHermesSkill(localPath, skill);
    const required = requiredSkills.has(skill);
    console.log(`  - ${skill}: ${found ? "found" : "missing"}${required ? " [required]" : " [optional]"}`);
    checks.push({ label: `skill:${skill}`, ok: found || !required, required, detail: found ? "found" : "missing" });
  }

  console.log("\nRuntime binaries:");
  reportBinary(checks, "Hermes", settings.hermesBin, true);
  reportBinary(checks, "GitHub CLI", "gh", settings.features.sources.github.enabled);
  reportBinary(checks, "Git", "git", settings.features.sources.github.enabled);
  reportBinary(checks, "Coralogix CLI", "cx", settings.features.sources.coralogix.enabled);
  reportBinary(checks, "Postgres CLI", "psql", settings.features.sources.postgres.enabled);

  if (verifySources) {
    console.log("\nLive source probes:");
    checks.push(await verifyCopilot());
    if (jiraMcpCredentialsConfigured()) checks.push(await verifyJiraMcp());
    if (settings.features.sources.github.enabled) checks.push(verifyGitHub());
    if (settings.features.sources.coralogix.enabled) checks.push(verifyCoralogix());
    if (settings.features.sources.postgres.enabled) checks.push(verifyPostgres());
  }

  const failures = checks.filter((check) => check.required && !check.ok);
  if (strict && failures.length > 0) {
    console.error(`\nStrict readiness failed (${failures.length}):`);
    for (const failure of failures) console.error(`- ${failure.label}: ${failure.detail}`);
    process.exitCode = 1;
  } else if (strict) {
    console.log("\nStrict readiness passed");
  }
}

function report(checks: CheckResult[], label: string, ok: boolean, required: boolean, detail: string): void {
  console.log(`- ${label}: ${ok ? "found" : "missing"} (${detail})`);
  checks.push({ label, ok, required, detail });
}

function reportBinary(checks: CheckResult[], label: string, binary: string, required: boolean): void {
  const result = spawnSync(binary, ["--version"], { encoding: "utf8", timeout: 15_000 });
  const ok = !result.error && result.status === 0;
  const detail = ok ? (result.stdout || result.stderr).split(/\r?\n/)[0]?.trim() || "no version output" : result.error?.message || `exit ${result.status}`;
  console.log(`- ${label}: ${ok ? "found" : "missing or failed"} (${detail})${required ? " [required]" : " [optional]"}`);
  checks.push({ label, ok: ok || !required, required, detail });
}

async function verifyCopilot(): Promise<CheckResult> {
  const probe = await probeCopilotAuth();
  const ok = probe.status === "ok";
  console.log(`- Copilot: ${ok ? "authenticated" : probe.status} (${probe.detail.split("\n")[0]})`);
  return { label: "Copilot live authentication", ok, required: true, detail: probe.detail };
}

async function verifyJiraMcp(): Promise<CheckResult> {
  const url = process.env.JIRA_MCP_URL?.trim();
  if (!url) return failed("Jira MCP", "missing JIRA_MCP_URL");
  try {
    const initialize = await mcpRequest(url, {
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "incident-agent-doctor", version: "0.1.0" } },
    });
    const protocolVersion = String(initialize.body?.result?.protocolVersion ?? "2025-06-18");
    const sessionId = initialize.response.headers.get("mcp-session-id");
    await mcpRequest(url, { jsonrpc: "2.0", method: "notifications/initialized" }, sessionId, protocolVersion);
    const toolsResponse = await mcpRequest(url, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, sessionId, protocolVersion);
    const available = Array.isArray(toolsResponse.body?.result?.tools)
      ? toolsResponse.body.result.tools.map((tool: { name?: unknown }) => String(tool.name ?? "")).filter(Boolean)
      : [];
    const allowed = jiraReadOnlyTools();
    const missing = allowed.filter((tool) => !available.includes(tool));
    console.log(`- Jira MCP: initialized; ${available.length} tools available; allowlist: ${allowed.join(", ") || "(none)"}`);
    if (allowed.length === 0) return failed("Jira MCP", `set JIRA_MCP_READONLY_TOOLS from available tools: ${available.join(", ")}`);
    if (missing.length > 0) return failed("Jira MCP", `allowlisted tools missing from server: ${missing.join(", ")}`);
    return { label: "Jira MCP", ok: true, required: true, detail: `${available.length} tools; allowlist verified` };
  } catch (error) {
    return failed("Jira MCP", errorMessage(error));
  }
}

async function mcpRequest(
  url: string,
  body: Record<string, unknown>,
  sessionId?: string | null,
  protocolVersion?: string,
): Promise<{ response: Response; body?: any }> {
  const headers: Record<string, string> = {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    ...jiraMcpProbeHeaders(),
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  if (protocolVersion) headers["MCP-Protocol-Version"] = protocolVersion;
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  if (!text.trim()) return { response };
  const payload = response.headers.get("content-type")?.includes("text/event-stream")
    ? text.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).find(Boolean)
    : text;
  return { response, body: payload ? JSON.parse(payload) : undefined };
}

function verifyGitHub(): CheckResult {
  const result = spawnSync("gh", ["auth", "status", "--hostname", "github.com"], { encoding: "utf8", timeout: 15_000, stdio: "pipe" });
  const ok = !result.error && result.status === 0;
  const detail = ok ? "authenticated" : commandFailure(result);
  console.log(`- GitHub: ${detail}`);
  return { label: "GitHub", ok, required: true, detail };
}

function verifyCoralogix(): CheckResult {
  const result = spawnSync("cx", ["--read-only", "--output", "json", "logs", "limit 1", "--start", "now-5m", "--limit", "1", "--tier", "frequent"], {
    encoding: "utf8", timeout: 15_000, stdio: "pipe",
  });
  const ok = !result.error && result.status === 0;
  const detail = ok ? "authenticated read-only query succeeded" : commandFailure(result);
  console.log(`- Coralogix: ${detail}`);
  return { label: "Coralogix", ok, required: true, detail };
}

function verifyPostgres(): CheckResult {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return failed("Postgres", "missing DATABASE_URL");
  const env: NodeJS.ProcessEnv = { ...process.env, PGDATABASE: databaseUrl };
  delete env.DATABASE_URL;
  const result = spawnSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "--csv", "-c", "BEGIN READ ONLY; SET LOCAL statement_timeout = '5s'; SET LOCAL lock_timeout = '1s'; SELECT now() LIMIT 1; ROLLBACK;"], {
    encoding: "utf8", timeout: 10_000, stdio: "pipe", env,
  });
  const ok = !result.error && result.status === 0;
  const detail = ok ? "read-only query succeeded" : commandFailure(result);
  console.log(`- Postgres: ${detail}`);
  return { label: "Postgres", ok, required: true, detail };
}

function failed(label: string, detail: string): CheckResult {
  console.log(`- ${label}: failed (${detail})`);
  return { label, ok: false, required: true, detail };
}

function jiraReadOnlyTools(): string[] {
  return (process.env.JIRA_MCP_READONLY_TOOLS ?? "").split(",").map((tool) => tool.trim()).filter(Boolean);
}

function jiraMcpCredentialsConfigured(): boolean {
  return Boolean(process.env.JIRA_MCP_URL?.trim() && process.env.JIRA_MCP_TOKEN?.trim());
}

function jiraMcpProbeHeaders(): Record<string, string> {
  const token = process.env.JIRA_MCP_TOKEN?.trim();
  return token ? { Authorization: `${process.env.JIRA_MCP_AUTH_SCHEME?.trim() || "Bearer"} ${token}` } : {};
}

function commandFailure(result: ReturnType<typeof spawnSync>): string {
  if (result.error) return result.error.message;
  return [String(result.stderr || "").trim(), String(result.stdout || "").trim()].filter(Boolean).join("; ") || `exit ${result.status}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

main().catch((error: unknown) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});

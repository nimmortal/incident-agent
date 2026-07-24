#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const command = args[0];
const subcommand = args[1];
const allowed = new Map([
  ["auth", new Set(["status"])],
  ["issue", new Set(["list", "view"])],
  ["pr", new Set(["checks", "diff", "list", "status", "view"])],
  ["release", new Set(["download", "list", "view"])],
  ["repo", new Set(["clone", "list", "view"])],
  ["run", new Set(["list", "view", "watch"])],
  ["search", new Set(["code", "commits", "issues", "prs", "repos"])],
  ["workflow", new Set(["list", "view"])],
]);

if (command === "api") {
  const forbidden = args.some((arg, index) =>
    ["-f", "-F", "--field", "--raw-field", "--input"].includes(arg) ||
    /^--(?:field|raw-field|input)=/.test(arg) ||
    ((arg === "-X" || arg === "--method") && (args[index + 1] ?? "GET").toUpperCase() !== "GET") ||
    /^--method=(?!GET$)/i.test(arg),
  );
  const graphql = args.some((arg) => /^graphql(?:$|[/?])/i.test(arg));
  if (forbidden || graphql) {
    deny("gh api is limited to REST GET requests without fields or input");
  }
} else if (!command || !allowed.get(command)?.has(subcommand)) {
  deny(`gh ${args.join(" ")} is not in the incident-agent read-only allowlist`);
}

run(process.env.INCIDENT_AGENT_REAL_GH, args);

function run(binary, commandArgs) {
  if (!binary) deny("INCIDENT_AGENT_REAL_GH is not configured");
  const result = spawnSync(binary, commandArgs, { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

function deny(message) {
  console.error(`[incident-agent] blocked: ${message}`);
  process.exit(64);
}

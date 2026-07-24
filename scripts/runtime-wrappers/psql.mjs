#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const commands = [];
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "-f" || args[index] === "--file" || args[index].startsWith("--file=")) {
    deny("psql file execution is disabled");
  }
  if (args[index] === "-c" || args[index] === "--command") {
    commands.push(args[index + 1] ?? "");
    index += 1;
  } else if (args[index].startsWith("--command=")) {
    commands.push(args[index].slice("--command=".length));
  }
}
if (commands.length === 0 && !args.some((arg) => arg === "--version" || arg === "-V")) {
  deny("interactive psql and stdin SQL are disabled; use a bounded -c command");
}
const forbidden = /\b(?:insert|update|delete|truncate|alter|drop|create|grant|revoke|vacuum|analyze|call|do|copy|merge|refresh|reindex|cluster|comment|security\s+label)\b|default_transaction_read_only\s*=\s*(?:off|false|0)/i;
if (commands.some((command) => forbidden.test(stripComments(command)))) {
  deny("mutating SQL is disabled");
}

run(process.env.INCIDENT_AGENT_REAL_PSQL, args);

function stripComments(value) {
  return value.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function run(binary, commandArgs) {
  if (!binary) deny("INCIDENT_AGENT_REAL_PSQL is not configured");
  const result = spawnSync(binary, commandArgs, { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

function deny(message) {
  console.error(`[incident-agent] blocked: ${message}`);
  process.exit(64);
}

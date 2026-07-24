#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const commandsWithValue = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace"]);
let index = 0;
while (index < args.length && args[index].startsWith("-")) {
  index += commandsWithValue.has(args[index]) ? 2 : 1;
}
const command = args[index];
const allowed = new Set([
  "branch", "cat-file", "checkout", "clone", "diff", "fetch", "grep", "log", "ls-files", "ls-remote",
  "ls-tree", "merge-base", "remote", "reset", "rev-list", "rev-parse", "show", "status", "switch", "tag",
]);

if (!command || !allowed.has(command)) {
  deny(`git ${args.join(" ")} is not in the incident-agent read-only-remote allowlist`);
}
if (command === "remote" && ![undefined, "-v", "get-url", "show"].includes(args[index + 1])) {
  deny("git remote mutations are disabled");
}
if (command === "tag" && args.slice(index + 1).some((arg) => !arg.startsWith("-") || ["-d", "--delete", "-f", "--force"].includes(arg))) {
  deny("git tag creation or deletion is disabled");
}
if (["checkout", "reset", "switch"].includes(command) && args.slice(index + 1).includes("--orphan")) {
  deny("orphan branch creation is disabled");
}

run(process.env.INCIDENT_AGENT_REAL_GIT, args);

function run(binary, commandArgs) {
  if (!binary) deny("INCIDENT_AGENT_REAL_GIT is not configured");
  const result = spawnSync(binary, commandArgs, { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

function deny(message) {
  console.error(`[incident-agent] blocked: ${message}`);
  process.exit(64);
}

#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const binary = process.env.INCIDENT_AGENT_REAL_CX;
if (!binary) deny("INCIDENT_AGENT_REAL_CX is not configured");

const args = process.argv.slice(2);
const safeArgs = args.includes("--read-only") ? args : ["--read-only", ...args];
const result = spawnSync(binary, safeArgs, { stdio: "inherit", env: process.env });
if (result.error) throw result.error;
process.exit(result.status ?? 1);

function deny(message) {
  console.error(`[incident-agent] blocked: ${message}`);
  process.exit(64);
}

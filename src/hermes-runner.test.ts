import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { HermesRunError, HermesRunner } from "./hermes-runner.ts";

test("max runtime terminates the Hermes process group", { skip: process.platform === "win32", timeout: 6_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "incident-agent-runner-test-"));
  const scriptPath = join(dir, "fake-hermes.mjs");
  const childPidPath = join(dir, "child.pid");
  writeFileSync(scriptPath, [
    'import { spawn } from "node:child_process";',
    'import { writeFileSync } from "node:fs";',
    'const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });',
    'writeFileSync(process.argv[2], String(child.pid));',
    'console.log("Session: runner_test_session");',
    'setInterval(() => {}, 1000);',
  ].join("\n"));
  chmodSync(scriptPath, 0o700);

  try {
    const runner = new HermesRunner(process.execPath, [scriptPath, childPidPath], 1, 0, 1, 1, process.env);
    await assert.rejects(runner.run("test"), (error: unknown) => error instanceof HermesRunError && error.reason === "max-runtime");
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    const childPid = Number(readFileSync(childPidPath, "utf8"));
    assert.throws(() => process.kill(childPid, 0), (error: unknown) => error instanceof Error && "code" in error && error.code === "ESRCH");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

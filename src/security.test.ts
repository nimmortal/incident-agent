import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";

import { assertSafeDelegationConfiguration, redactSensitiveText } from "./security.ts";
import { parseHermesSessionId } from "./hermes-runner.ts";

test("redacts common credentials and rejects autonomous dangerous approval", () => {
  const redacted = redactSensitiveText("GITHUB_TOKEN=github_pat_abcdefghijklmnopqrstuvwxyz123456 postgres://user:secret@db/app Bearer abcdefghijklmnop");
  assert.doesNotMatch(redacted, /github_pat_|:secret@|abcdefghijklmnop/);
  assert.throws(() => assertSafeDelegationConfiguration({ HERMES_DELEGATION_SUBAGENT_AUTO_APPROVE: "true" }), /must remain false/);
});

test("extracts Hermes session IDs for explicit continuation", () => {
  assert.equal(parseHermesSessionId("Session: 20260722_101500_abcd1234"), "20260722_101500_abcd1234");
  assert.equal(parseHermesSessionId("Resume with: hermes --resume 20260722_101500_abcd1234"), "20260722_101500_abcd1234");
});

test("runtime wrappers block remote mutations and mutating SQL", () => {
  const root = resolve("scripts", "runtime-wrappers");
  const baseEnv = {
    ...process.env,
    INCIDENT_AGENT_REAL_GH: "/usr/bin/true",
    INCIDENT_AGENT_REAL_GIT: "/usr/bin/true",
    INCIDENT_AGENT_REAL_CX: "/bin/echo",
    INCIDENT_AGENT_REAL_PSQL: "/usr/bin/true",
  };
  assert.equal(spawnSync(process.execPath, [resolve(root, "gh.mjs"), "pr", "merge", "1"], { env: baseEnv }).status, 64);
  assert.equal(spawnSync(process.execPath, [resolve(root, "gh.mjs"), "api", "-H", "Accept: application/json", "graphql"], { env: baseEnv }).status, 64);
  assert.equal(spawnSync(process.execPath, [resolve(root, "git.mjs"), "push", "origin", "main"], { env: baseEnv }).status, 64);
  assert.equal(spawnSync(process.execPath, [resolve(root, "psql.mjs"), "-c", "DELETE FROM users"], { env: baseEnv }).status, 64);
  assert.equal(spawnSync(process.execPath, [resolve(root, "gh.mjs"), "pr", "view", "1"], { env: baseEnv }).status, 0);
  const cx = spawnSync(process.execPath, [resolve(root, "cx.mjs"), "logs", "limit 1"], { env: baseEnv, encoding: "utf8" });
  assert.equal(cx.status, 0);
  assert.match(cx.stdout, /^--read-only logs limit 1/);
  assert.equal(spawnSync(process.execPath, [resolve(root, "psql.mjs"), "-c", "SELECT now()"], { env: baseEnv }).status, 0);
});

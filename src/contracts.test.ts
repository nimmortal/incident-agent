import assert from "node:assert/strict";
import { test } from "node:test";

import { parseTaggedStatus } from "./contracts.ts";

test("parses the last valid typed phase status", () => {
  const output = `noise
<incident-agent-phase-status>
{"status":"done","summary":"complete","artifact":{"phase":"evidence","summary":"evidence complete","confidence":"medium","identifiers":["trace-1"],"facts":[{"claim":"matched","source":"logs","locator":"trace-1","confidence":"high"}],"blockers":[],"nextChecks":[]}}
</incident-agent-phase-status>`;
  const status = parseTaggedStatus(output, "phase");
  assert.equal(status?.status, "done");
  assert.equal(status?.artifact?.phase, "evidence");
});

test("rejects incomplete continuation and blocked contracts", () => {
  assert.equal(parseTaggedStatus('<incident-agent-goal-status>{"status":"continue","summary":"more"}</incident-agent-goal-status>', "goal"), undefined);
  assert.equal(parseTaggedStatus('<incident-agent-phase-status>{"status":"blocked","summary":"stuck"}</incident-agent-phase-status>', "phase"), undefined);
});

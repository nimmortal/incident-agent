import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { Settings } from "./config.ts";
import { loadPollState, parsePollBatch, savePollBatch, withPollStateLease } from "./poll-state.ts";

test("poll state advances atomically and redacts secrets", () => {
  const dir = mkdtempSync(join(tmpdir(), "incident-agent-poll-test-"));
  try {
    const settings = { pollStatePath: join(dir, "poll-state.json") } as Settings;
    const initial = loadPollState(settings);
    const batch = parsePollBatch('<incident-agent-poll-status>{"tickets":[{"key":"JSM-1","updatedAt":"2026-07-22T10:00:00Z","outcome":"investigated","summary":"token GITHUB_TOKEN=github_pat_abcdefghijklmnopqrstuvwxyz123456"}]}</incident-agent-poll-status>');
    assert.ok(batch);
    const saved = savePollBatch(settings, initial, batch);
    assert.match(saved.tickets["JSM-1"].summary, /REDACTED/);
    assert.equal(statSync(settings.pollStatePath).mode & 0o777, 0o600);
    assert.doesNotMatch(readFileSync(settings.pollStatePath, "utf8"), /github_pat_/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("invalid poll status does not parse", () => {
  assert.equal(parsePollBatch("no status"), undefined);
  assert.equal(parsePollBatch('<incident-agent-poll-status>{"tickets":[{"key":"JSM-1"}]}</incident-agent-poll-status>'), undefined);
});

test("failed and blocked tickets remain uncheckpointed for retry", () => {
  const dir = mkdtempSync(join(tmpdir(), "incident-agent-poll-retry-test-"));
  try {
    const settings = { pollStatePath: join(dir, "poll-state.json") } as Settings;
    const initial = loadPollState(settings);
    const batch = parsePollBatch('<incident-agent-poll-status>{"tickets":[{"key":"JSM-1","updatedAt":"2026-07-22T10:00:00Z","outcome":"failed","summary":"timeout"},{"key":"JSM-2","updatedAt":"2026-07-22T10:01:00Z","outcome":"blocked","summary":"missing service"}]}</incident-agent-poll-status>');
    assert.ok(batch);
    const saved = savePollBatch(settings, initial, batch);
    assert.deepEqual(saved.tickets, {});
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("poll state lease rejects overlapping cycles", async () => {
  const dir = mkdtempSync(join(tmpdir(), "incident-agent-poll-lease-test-"));
  try {
    const settings = {
      pollStatePath: join(dir, "poll-state.json"),
      hermesTimeoutSeconds: 30,
      hermesTerminateGraceSeconds: 1,
    } as Settings;
    await withPollStateLease(settings, async () => {
      await assert.rejects(withPollStateLease(settings, async () => undefined), /Another poll cycle/);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

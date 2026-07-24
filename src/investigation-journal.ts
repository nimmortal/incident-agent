import { appendFileSync, chmodSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";

import type { Settings } from "./config.ts";
import { redactSensitiveText } from "./security.ts";

const maxPromptEntryChars = 48_000;

export interface InvestigationJournal {
  issueKey: string;
  runId: string;
  path: string;
  append(event: InvestigationJournalEvent): void;
  readCompact(maxChars?: number): string;
}

export type InvestigationJournalEvent =
  | { type: "run_started"; command: string }
  | { type: "phase_started"; phase: InvestigationPhase; prompt: string; step?: number; maxSteps?: number; attempt: number; recovery: boolean }
  | { type: "phase_step_completed"; phase: InvestigationPhase; output: string; status: unknown; step: number; attempt: number; recovery: boolean }
  | { type: "phase_completed"; phase: InvestigationPhase; output: string; step?: number; attempt: number; recovery: boolean }
  | { type: "phase_blocked"; phase: InvestigationPhase; output: string; status: unknown; step: number; attempt: number; recovery: boolean }
  | { type: "phase_failed"; phase: InvestigationPhase; error: string; step?: number; attempt: number; recovery: boolean; partialOutput?: string }
  | { type: "phase_fallback"; phase: InvestigationPhase; output: string; step?: number; maxSteps?: number }
  | { type: "run_completed"; status: "done" | "blocked" | "failed"; summary: string };

export type InvestigationPhase = "triage" | "code" | "evidence" | "synthesis";

export function createInvestigationJournal(settings: Settings, issueKey: string): InvestigationJournal {
  const runId = `${timestampId(new Date())}-${randomUUID().slice(0, 8)}`;
  const rootDir = resolve(settings.investigationJournalDir);
  pruneExpiredJournals(rootDir, settings.investigationJournalRetentionDays);
  const dir = resolve(rootDir, sanitizePathPart(issueKey));
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(rootDir, 0o700);
  chmodSync(dir, 0o700);

  const path = join(dir, `${runId}.jsonl`);
  const journal: InvestigationJournal = {
    issueKey,
    runId,
    path,
    append(event) {
      const serialized = JSON.stringify({ timestamp: new Date().toISOString(), issueKey, runId, ...compactEvent(event) });
      appendFileSync(path, redactSensitiveText(serialized) + "\n", { mode: 0o600 });
      chmodSync(path, 0o600);
    },
    readCompact(maxChars = 48_000) {
      const contents = readFileSync(path, "utf8");
      if (contents.length <= maxChars) {
        return contents;
      }
      return contents.slice(-maxChars);
    },
  };

  journal.append({ type: "run_started", command: "investigate" });
  return journal;
}

function pruneExpiredJournals(rootDir: string, retentionDays: number): void {
  if (retentionDays === 0) {
    return;
  }
  const cutoff = Date.now() - retentionDays * 86_400_000;
  for (const path of walkFiles(rootDir)) {
    if (path.endsWith(".jsonl") && statSync(path).mtimeMs < cutoff) {
      rmSync(path, { force: true });
    }
  }
}

function walkFiles(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      return entry.isDirectory() ? walkFiles(path) : [path];
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function compactEvent(event: InvestigationJournalEvent): InvestigationJournalEvent {
  if (event.type === "phase_started") {
    return { ...event, prompt: truncate(event.prompt, maxPromptEntryChars) };
  }
  if (event.type === "phase_completed") {
    return { ...event, output: truncate(event.output, maxPromptEntryChars) };
  }
  if (event.type === "phase_step_completed") {
    return { ...event, output: truncate(event.output, maxPromptEntryChars) };
  }
  if (event.type === "phase_blocked") {
    return { ...event, output: truncate(event.output, maxPromptEntryChars) };
  }
  if (event.type === "phase_failed" && event.partialOutput) {
    return { ...event, partialOutput: truncate(event.partialOutput, maxPromptEntryChars) };
  }
  if (event.type === "phase_fallback") {
    return { ...event, output: truncate(event.output, maxPromptEntryChars) };
  }
  return event;
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars)}\n[truncated ${value.length - maxChars} chars]`;
}

function timestampId(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function sanitizePathPart(value: string): string {
  const sanitized = value.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized || "unknown-issue";
}

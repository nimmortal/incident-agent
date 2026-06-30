import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { Settings } from "./config.ts";

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
  | { type: "phase_fallback"; phase: InvestigationPhase; output: string; step?: number; maxSteps?: number };

export type InvestigationPhase = "triage" | "code" | "evidence" | "synthesis";

export function createInvestigationJournal(settings: Settings, issueKey: string): InvestigationJournal {
  const runId = timestampId(new Date());
  const dir = resolve(settings.investigationJournalDir, sanitizePathPart(issueKey));
  mkdirSync(dir, { recursive: true });

  const path = join(dir, `${runId}.jsonl`);
  const journal: InvestigationJournal = {
    issueKey,
    runId,
    path,
    append(event) {
      appendFileSync(path, JSON.stringify({ timestamp: new Date().toISOString(), issueKey, runId, ...compactEvent(event) }) + "\n");
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

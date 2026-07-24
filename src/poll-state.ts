import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";

import type { Settings } from "./config.ts";
import { redactSensitiveText } from "./security.ts";

const pollTicketSchema = z.object({
  key: z.string().min(1),
  updatedAt: z.string().min(1),
  outcome: z.enum(["unchanged", "investigated", "blocked", "failed"]),
  summary: z.string().min(1),
});

const pollBatchSchema = z.object({ tickets: z.array(pollTicketSchema) });
const pollStateSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string(),
  tickets: z.record(z.string(), pollTicketSchema),
});

export type PollBatch = z.infer<typeof pollBatchSchema>;
export type PollState = z.infer<typeof pollStateSchema>;

export function loadPollState(settings: Settings): PollState {
  const path = resolve(settings.pollStatePath);
  if (!existsSync(path)) {
    return { version: 1, updatedAt: new Date(0).toISOString(), tickets: {} };
  }
  return pollStateSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

export function pollStatePromptContext(state: PollState): string {
  const tickets = Object.values(state.tickets)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 500);
  return JSON.stringify({ version: state.version, updatedAt: state.updatedAt, tickets });
}

export function parsePollBatch(output: string): PollBatch | undefined {
  const matches = [...output.matchAll(/<incident-agent-poll-status>\s*([\s\S]*?)\s*<\/incident-agent-poll-status>/g)];
  const payload = matches.at(-1)?.[1]?.trim();
  if (!payload) {
    return undefined;
  }
  try {
    return pollBatchSchema.parse(JSON.parse(payload.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()));
  } catch {
    return undefined;
  }
}

export function savePollBatch(settings: Settings, current: PollState, batch: PollBatch): PollState {
  const next: PollState = { version: 1, updatedAt: new Date().toISOString(), tickets: { ...current.tickets } };
  for (const ticket of batch.tickets) {
    if (ticket.outcome === "investigated" || ticket.outcome === "unchanged") {
      next.tickets[ticket.key] = { ...ticket, summary: redactSensitiveText(ticket.summary) };
    }
  }

  const path = resolve(settings.pollStatePath);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  chmodSync(dirname(path), 0o700);
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporaryPath, path);
  chmodSync(path, 0o600);
  return next;
}

export async function withPollStateLease<T>(settings: Settings, action: () => Promise<T>): Promise<T> {
  const lockPath = `${resolve(settings.pollStatePath)}.lock`;
  mkdirSync(dirname(lockPath), { recursive: true, mode: 0o700 });
  chmodSync(dirname(lockPath), 0o700);
  const staleAfterMs = (settings.hermesTimeoutSeconds + settings.hermesTerminateGraceSeconds + 60) * 1000;
  let acquired = false;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      mkdirSync(lockPath, { mode: 0o700 });
      acquired = true;
      break;
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
      const ageMs = lockAgeMs(lockPath);
      if (ageMs === undefined) continue;
      if (attempt === 0 && ageMs > staleAfterMs) {
        rmSync(lockPath, { recursive: true, force: true });
        continue;
      }
      throw new Error(`Another poll cycle already holds ${lockPath}`);
    }
  }
  if (!acquired) throw new Error(`Unable to acquire poll lease ${lockPath}`);
  try {
    return await action();
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

function isAlreadyExists(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}

function lockAgeMs(path: string): number | undefined {
  try {
    return Date.now() - statSync(path).mtimeMs;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

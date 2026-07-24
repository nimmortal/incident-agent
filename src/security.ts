import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cleanupPaths = new Set<string>();
let cleanupInstalled = false;

export function assertSafeDelegationConfiguration(env: NodeJS.ProcessEnv): void {
  if (/^(1|true|yes|on)$/i.test(env.HERMES_DELEGATION_SUBAGENT_AUTO_APPROVE?.trim() ?? "")) {
    throw new Error("HERMES_DELEGATION_SUBAGENT_AUTO_APPROVE must remain false: incident-agent is a read-only unattended runtime");
  }
}

export function createPrivateTempDir(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix));
  chmodSync(path, 0o700);
  cleanupPaths.add(path);
  installCleanupHandlers();
  return path;
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/_=.-]{12,}/gi, "$1 [REDACTED]")
    .replace(/\b(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+@/gi, "$1[REDACTED]@")
    .replace(/\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY))\s*=\s*([^\s]+)/gi, "$1=[REDACTED]");
}

function installCleanupHandlers(): void {
  if (cleanupInstalled) {
    return;
  }
  cleanupInstalled = true;
  process.once("exit", cleanup);
}

function cleanup(): void {
  for (const path of cleanupPaths) {
    rmSync(path, { recursive: true, force: true });
  }
  cleanupPaths.clear();
}

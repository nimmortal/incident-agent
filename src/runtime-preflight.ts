import { spawnSync } from "node:child_process";

import type { Settings } from "./config.ts";
import { hasHermesSkill, runtimeSkillsPath } from "./hermes-config.ts";
import { coralogixSkills, githubCodeExplorationSkill, githubSkillNames, postgresSkills, skillName } from "./skill-sets.ts";

const copilotTokenEnvVar = "COPILOT_GITHUB_TOKEN" as const;

export function requireCopilotTokenSupported(): void {
  const token = selectedCopilotToken();
  if (!token) {
    return;
  }

  if (token.kind === "classic-pat") {
    throw new Error(
      [
        `${token.envVar} contains a classic GitHub Personal Access Token (ghp_*), but GitHub Copilot API endpoints do not support classic PATs.`,
        "Use a Copilot-compatible token instead: OAuth/device-flow token (gho_*) or a fine-grained PAT (github_pat_*) with Copilot Requests permission.",
        "Keep normal repository access in GITHUB_TOKEN; do not reuse a classic repo PAT for COPILOT_GITHUB_TOKEN.",
      ].join("\n"),
    );
  }
}

export function copilotAuthFailureHint(output: string): string | undefined {
  const token = selectedCopilotToken();
  if (!token) {
    return undefined;
  }

  const lines: string[] = [];
  if (token.kind === "fine-grained-pat") {
    lines.push(
      `${token.envVar} is a fine-grained PAT (github_pat_*). For Copilot it must be owned by your personal account, not an organization, and include the Account > Copilot Requests permission.`,
    );

    if (/Personal Access Tokens? (are|is) not supported for this endpoint/i.test(output)) {
      lines.push(
        "If that permission is already set, try an OAuth/device-flow token (gho_*) from a Hermes/Copilot login flow; this error can also happen when Hermes' Copilot token exchange path rejects PAT-style credentials.",
      );
    }
  }

  return lines.length > 0 ? ["Copilot auth hint:", ...lines.map((line) => `- ${line}`)].join("\n") : undefined;
}

export interface CopilotAuthProbeResult {
  status: "ok" | "auth-failed" | "unreachable" | "skipped";
  detail: string;
}

// Exchanges the configured Copilot token for a Copilot session token, the same
// call Hermes makes on its first model request. This surfaces bad credentials
// before a multi-phase investigation starts instead of mid-phase.
export async function probeCopilotAuth(): Promise<CopilotAuthProbeResult> {
  const token = selectedCopilotToken();
  if (!token) {
    return { status: "skipped", detail: "COPILOT_GITHUB_TOKEN is not configured" };
  }

  try {
    const response = await fetch("https://api.github.com/copilot_internal/v2/token", {
      method: "GET",
      headers: {
        Authorization: `token ${token.value}`,
        "Copilot-Integration-Id": process.env.COPILOT_INTEGRATION_ID?.trim() || "copilot-developer-cli",
        "User-Agent": "incident-agent-preflight",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) {
      return { status: "ok", detail: `${token.envVar} accepted by Copilot token exchange` };
    }
    if (response.status === 401 || response.status === 403) {
      const body = (await response.text().catch(() => "")).slice(0, 300);
      return {
        status: "auth-failed",
        detail: [`${token.envVar} rejected by Copilot token exchange (${response.status})`, body, copilotAuthFailureHint(body)]
          .filter(Boolean)
          .join("\n"),
      };
    }
    return { status: "unreachable", detail: `Copilot token exchange returned ${response.status}; continuing without preflight` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "unreachable", detail: `Copilot token exchange not reachable (${message}); continuing without preflight` };
  }
}

export async function requireCopilotAuthUsable(): Promise<void> {
  const probe = await probeCopilotAuth();
  if (probe.status === "auth-failed") {
    throw new Error(`Copilot authentication preflight failed.\n${probe.detail}`);
  }
  if (probe.status === "unreachable") {
    console.error(`[incident-agent] ${probe.detail}`);
  }
}

type CopilotTokenKind = "classic-pat" | "fine-grained-pat" | "oauth" | "unknown";

interface SelectedCopilotToken {
  envVar: typeof copilotTokenEnvVar;
  kind: CopilotTokenKind;
  value: string;
}

function selectedCopilotToken(): SelectedCopilotToken | undefined {
  const value = process.env[copilotTokenEnvVar]?.trim();
  if (!value) {
    return undefined;
  }

  return {
    envVar: copilotTokenEnvVar,
    kind: copilotTokenKind(value),
    value,
  };
}

function copilotTokenKind(value: string): CopilotTokenKind {
  if (value.startsWith("ghp_")) {
    return "classic-pat";
  }
  if (value.startsWith("github_pat_")) {
    return "fine-grained-pat";
  }
  if (value.startsWith("gho_")) {
    return "oauth";
  }
  return "unknown";
}

export function requireRuntimeForSkills(settings: Settings, skills: string[]): void {
  const missing: string[] = [];

  const needsGithubCli =
    skills.some((skill) => githubSkillNames.includes(skillName(skill) as (typeof githubSkillNames)[number])) ||
    skills.includes(githubCodeExplorationSkill);
  if (needsGithubCli && !commandExists("gh")) {
    missing.push("gh CLI");
  }
  if (skills.includes(githubCodeExplorationSkill) && !commandExists("git")) {
    missing.push("git");
  }
  if (skills.some((skill) => coralogixSkills.includes(skill as (typeof coralogixSkills)[number])) && !commandExists("cx")) {
    missing.push("cx CLI");
  }
  if (skills.some((skill) => postgresSkills.includes(skill as (typeof postgresSkills)[number])) && !commandExists("psql")) {
    missing.push("psql");
  }

  for (const skill of skills) {
    if (!hasHermesSkill(runtimeSkillsPath(settings), skill)) {
      missing.push(`Hermes skill ${skill}`);
    }
  }

  if (missing.length > 0) {
    throw new Error(["Required runtime tools are not available:", ...missing.map((item) => `- ${item}`)].join("\n"));
  }
}

function commandExists(command: string): boolean {
  const result = spawnSync(command, ["--version"], {
    encoding: "utf8",
    timeout: 15_000,
    stdio: "ignore",
  });
  return !result.error && result.status === 0;
}

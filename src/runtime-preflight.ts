import { spawnSync } from "node:child_process";

import type { Settings } from "./config.ts";
import { hasHermesSkill, runtimeSkillsPath } from "./hermes-config.ts";
import { coralogixSkills, githubSkillNames, postgresSkills, skillName } from "./skill-sets.ts";

const copilotTokenEnvVars = ["COPILOT_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"] as const;

export function requireCopilotTokenSupported(): void {
  for (const envVar of copilotTokenEnvVars) {
    const value = process.env[envVar]?.trim();
    if (!value) {
      continue;
    }
    if (value.startsWith("ghp_")) {
      throw new Error(
        [
          `${envVar} contains a classic GitHub Personal Access Token (ghp_*), but GitHub Copilot API endpoints do not support classic PATs.`,
          "Use a Copilot-compatible token instead: OAuth/device-flow token (gho_*), GitHub App token (ghu_*), or a fine-grained PAT (github_pat_*) with Copilot Requests permission.",
          "Keep normal repository access in GITHUB_TOKEN; do not reuse a classic repo PAT for COPILOT_GITHUB_TOKEN.",
        ].join("\n"),
      );
    }
    return;
  }
}

export function requireRuntimeForSkills(settings: Settings, skills: string[]): void {
  const missing: string[] = [];

  if (skills.some((skill) => githubSkillNames.includes(skillName(skill) as (typeof githubSkillNames)[number])) && !commandExists("gh")) {
    missing.push("gh CLI");
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

import { spawnSync } from "node:child_process";

import type { Settings } from "./config.ts";
import { hasHermesSkill, runtimeSkillsPath } from "./hermes-config.ts";
import { coralogixSkills, githubSkills, postgresSkills } from "./skill-sets.ts";

export function requireRuntimeForSkills(settings: Settings, skills: string[]): void {
  const missing: string[] = [];

  if (skills.some((skill) => githubSkills.includes(skill as (typeof githubSkills)[number])) && !commandExists("gh")) {
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

import type { Settings } from "./config.ts";

export const coralogixSkills = ["cx-telemetry-querying", "cx-incident-management"] as const;
export const githubSkillNames = ["github-auth", "github-repo-management", "github-pr-workflow", "github-issues"] as const;
export const githubSkills = githubSkillNames.map((skill) => `github/${skill}`) as `github/${(typeof githubSkillNames)[number]}`[];
export const postgresSkills = ["postgres-readonly"] as const;

export const managedSkillTargets = [
  ...coralogixSkills.map((skill) => ({ name: skill, target: skill })),
  ...githubSkillNames.map((skill) => ({ name: skill, target: `github/${skill}` })),
  ...postgresSkills.map((skill) => ({ name: skill, target: skill })),
] as const;

export const managedSkills = managedSkillTargets.map((skill) => skill.name);

export function optionalSourceSkills(settings: Settings): string[] {
  return [...optionalGithubSkills(settings), ...optionalCoralogixSkills(settings), ...optionalPostgresSkills(settings)];
}

export function optionalCoralogixSkills(settings: Settings): string[] {
  return settings.features.sources.coralogix.enabled ? [...coralogixSkills] : [];
}

export function optionalGithubSkills(settings: Settings): string[] {
  return settings.features.sources.github.enabled ? [...githubSkills] : [];
}

export function optionalPostgresSkills(settings: Settings): string[] {
  return settings.features.sources.postgres.enabled ? [...postgresSkills] : [];
}

export function skillArgs(skills: string[]): string[] {
  return skills.length > 0 ? ["--skills", skills.join(",")] : [];
}

export function skillName(identifier: string): string {
  return identifier.split("/").filter(Boolean).at(-1) ?? identifier;
}

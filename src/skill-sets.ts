import type { Settings } from "./config.ts";

export const incidentAgentSkill = "incident-agent" as const;
export const companyContextSkill = "company-context" as const;
export const coralogixSkills = ["cx-telemetry-querying", "cx-cases"] as const;
export const githubCodeExplorationSkill = "github-code-exploration" as const;
export const postgresSkills = ["postgres-readonly"] as const;

export const managedSkillTargets = [
  { name: incidentAgentSkill, target: incidentAgentSkill },
  { name: companyContextSkill, target: companyContextSkill },
  { name: githubCodeExplorationSkill, target: githubCodeExplorationSkill },
  ...coralogixSkills.map((skill) => ({ name: skill, target: skill })),
  ...postgresSkills.map((skill) => ({ name: skill, target: skill })),
] as const;

export const managedSkills = managedSkillTargets.map((skill) => skill.name);

export function optionalSourceSkills(settings: Settings): string[] {
  return [...optionalGithubSkills(settings), ...optionalCoralogixSkills(settings), ...optionalPostgresSkills(settings)];
}

export function wrapperSkills(skills: string[]): string[] {
  return [...new Set([incidentAgentSkill, companyContextSkill, ...skills])];
}

export function optionalCoralogixSkills(settings: Settings): string[] {
  return settings.features.sources.coralogix.enabled ? [...coralogixSkills] : [];
}

export function optionalGithubSkills(settings: Settings): string[] {
  return settings.features.sources.github.enabled ? [githubCodeExplorationSkill] : [];
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

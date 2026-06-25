import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import type { Settings } from "./config.ts";
import { applyGitHubAppToken } from "./github-app-token.ts";
import { managedSkillTargets } from "./skill-sets.ts";

export async function buildHermesEnvironment(settings: Settings): Promise<NodeJS.ProcessEnv> {
  writeRuntimeConfig(settings);
  seedHermesSkills(settings);
  return applyGitHubAppToken({
    ...process.env,
    HOME: runtimeHome(settings),
    HERMES_HOME: runtimeHermesHome(settings),
  });
}

export function runtimeConfigPath(settings: Settings): string {
  return join(runtimeHermesHome(settings), "config.yaml");
}

export function runtimeSkillsPath(settings: Settings): string {
  return join(runtimeHermesHome(settings), "skills");
}

export function runtimeHermesHome(settings: Settings): string {
  return join(runtimeHome(settings), ".hermes");
}

export function runtimeHome(settings: Settings): string {
  return resolve(settings.hermesRuntimeHome);
}

export function skillsSeedPath(settings: Settings): string {
  return join(resolve(settings.hermesSkillsSeedHome), ".hermes", "skills");
}

export function localSkillsPath(settings: Settings): string {
  return resolve(settings.hermesLocalSkillsPath);
}

export function hasHermesSkill(skillsPath: string, skillName: string): boolean {
  return findHermesSkillPath(skillsPath, skillName) !== undefined;
}

function findHermesSkillPath(skillsPath: string, skillName: string): string | undefined {
  if (!existsSync(skillsPath)) {
    return undefined;
  }

  const directPath = join(skillsPath, skillName, "SKILL.md");
  if (existsSync(directPath)) {
    return join(skillsPath, skillName);
  }

  for (const entry of readdirSync(skillsPath, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) {
      continue;
    }

    const found = findHermesSkillPath(join(skillsPath, entry.name), skillName);
    if (found) {
      return found;
    }
  }

  return undefined;
}

function writeRuntimeConfig(settings: Settings): void {
  const configPath = runtimeConfigPath(settings);
  mkdirSync(dirname(configPath), { recursive: true });

  const template = readFileSync(settings.hermesConfigTemplatePath, "utf8");
  const config = setMcpServerEnabled(template, "jira", settings.features.sources.jiraJsm.enabled);

  writeFileSync(configPath, config);
}

function seedHermesSkills(settings: Settings): void {
  const sourceDir = skillsSeedPath(settings);
  const localDir = localSkillsPath(settings);
  if (!existsSync(sourceDir) && !existsSync(localDir)) {
    return;
  }

  const targetDir = runtimeSkillsPath(settings);
  mkdirSync(targetDir, { recursive: true });

  for (const skill of managedSkillTargets) {
    const sourcePath = findHermesSkillPath(sourceDir, skill.name) ?? findHermesSkillPath(localDir, skill.name);
    if (!sourcePath) {
      continue;
    }

    const staleFlatPath = join(targetDir, skill.name);
    const targetPath = join(targetDir, skill.target);
    rmSync(staleFlatPath, { recursive: true, force: true });
    rmSync(targetPath, { recursive: true, force: true });
    mkdirSync(dirname(targetPath), { recursive: true });
    cpSync(sourcePath, targetPath, { recursive: true });
  }
}

function setMcpServerEnabled(config: string, serverName: string, enabled: boolean): string {
  const escapedName = escapeRegExp(serverName);
  const pattern = new RegExp(`(^\\s{2}${escapedName}:\\n[\\s\\S]*?^\\s{4}enabled:\\s*)(true|false)`, "m");

  if (!pattern.test(config)) {
    throw new Error(`Hermes config template is missing mcp_servers.${serverName}.enabled`);
  }

  return config.replace(pattern, `$1${enabled ? "true" : "false"}`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

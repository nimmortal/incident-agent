import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import type { Settings } from "./config.ts";
import { applyGitHubAppToken } from "./github-app-token.ts";
import { managedSkillTargets } from "./skill-sets.ts";

export async function buildHermesEnvironment(settings: Settings): Promise<NodeJS.ProcessEnv> {
  writeRuntimeConfig(settings);
  seedHermesSkills(settings);
  const env = await applyGitHubAppToken({
    ...process.env,
    HOME: runtimeHome(settings),
    HERMES_HOME: runtimeHermesHome(settings),
    JIRA_MCP_AUTH_HEADER: jiraMcpAuthHeader(process.env),
    HERMES_REASONING_EFFORT: process.env.HERMES_REASONING_EFFORT ?? "",
    HERMES_SHOW_REASONING: process.env.HERMES_SHOW_REASONING || "false",
    HERMES_REASONING_FULL: process.env.HERMES_REASONING_FULL || "false",
    HERMES_DELEGATION_MAX_ITERATIONS: process.env.HERMES_DELEGATION_MAX_ITERATIONS || "30",
    HERMES_DELEGATION_CHILD_TIMEOUT_SECONDS: process.env.HERMES_DELEGATION_CHILD_TIMEOUT_SECONDS || "600",
    HERMES_DELEGATION_MAX_CONCURRENT_CHILDREN: process.env.HERMES_DELEGATION_MAX_CONCURRENT_CHILDREN || "2",
    HERMES_DELEGATION_MAX_ASYNC_CHILDREN: process.env.HERMES_DELEGATION_MAX_ASYNC_CHILDREN || "2",
    HERMES_DELEGATION_MAX_SPAWN_DEPTH: process.env.HERMES_DELEGATION_MAX_SPAWN_DEPTH || "1",
    HERMES_DELEGATION_SUBAGENT_AUTO_APPROVE: process.env.HERMES_DELEGATION_SUBAGENT_AUTO_APPROVE || "false",
    HERMES_DELEGATION_MODEL: process.env.HERMES_DELEGATION_MODEL ?? "",
    HERMES_DELEGATION_PROVIDER: process.env.HERMES_DELEGATION_PROVIDER ?? "",
    HERMES_DELEGATION_REASONING_EFFORT: process.env.HERMES_DELEGATION_REASONING_EFFORT ?? "",
  });
  configureGitHubCliAuth(settings, env);
  return env;
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

export function gitHubCliConfigPath(settings: Settings): string {
  return join(runtimeHome(settings), ".config", "gh");
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

function jiraMcpAuthHeader(env: NodeJS.ProcessEnv): string {
  const explicit = env.JIRA_MCP_AUTH_HEADER?.trim();
  if (explicit) {
    return explicit;
  }

  const token = env.JIRA_MCP_TOKEN?.trim();
  if (!token) {
    return "";
  }

  const scheme = env.JIRA_MCP_AUTH_SCHEME?.trim() || "Bearer";
  return `${scheme} ${token}`;
}

function configureGitHubCliAuth(settings: Settings, env: NodeJS.ProcessEnv): void {
  const token = env.GITHUB_TOKEN?.trim();
  if (!token) {
    return;
  }

  const configDir = gitHubCliConfigPath(settings);
  mkdirSync(configDir, { recursive: true, mode: 0o700 });
  chmodSync(configDir, 0o700);

  const hostsPath = join(configDir, "hosts.yml");
  writeFileSync(
    hostsPath,
    [
      "github.com:",
      `  oauth_token: ${yamlString(token)}`,
      "  user: incident-agent",
      "  git_protocol: https",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  chmodSync(hostsPath, 0o600);

  env.GH_CONFIG_DIR = configDir;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
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

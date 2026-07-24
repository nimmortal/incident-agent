import { X_OK } from "node:constants";
import { accessSync, chmodSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import type { Settings } from "./config.ts";
import { assertSafeDelegationConfiguration, createPrivateTempDir } from "./security.ts";
import { managedSkillTargets } from "./skill-sets.ts";

export async function buildHermesEnvironment(settings: Settings): Promise<NodeJS.ProcessEnv> {
  assertSafeDelegationConfiguration(process.env);
  await withRuntimePreparationLock(settings, () => {
    writeRuntimeConfig(settings);
    seedHermesSkills(settings);
  });
  const repoCacheDir = resolve(settings.repoCacheDir);
  mkdirSync(repoCacheDir, { recursive: true, mode: 0o700 });
  chmodSync(repoCacheDir, 0o700);
  const env = {
    ...process.env,
    HOME: runtimeHome(settings),
    HERMES_HOME: runtimeHermesHome(settings),
    REPO_CACHE_DIR: repoCacheDir,
    SCHEMA_CACHE_PATH: resolve(settings.schemaCachePath),
    JIRA_MCP_AUTH_HEADER: jiraMcpAuthHeader(process.env),
    CONTEXT7_MCP_URL: process.env.CONTEXT7_MCP_URL || "https://mcp.context7.com/mcp",
    CONTEXT7_API_KEY: process.env.CONTEXT7_API_KEY || "",
    HERMES_REASONING_EFFORT: process.env.HERMES_REASONING_EFFORT ?? "",
    HERMES_SHOW_REASONING: process.env.HERMES_SHOW_REASONING || "false",
    HERMES_REASONING_FULL: process.env.HERMES_REASONING_FULL || "false",
    HERMES_DELEGATION_MAX_ITERATIONS: process.env.HERMES_DELEGATION_MAX_ITERATIONS || "30",
    HERMES_DELEGATION_CHILD_TIMEOUT_SECONDS: process.env.HERMES_DELEGATION_CHILD_TIMEOUT_SECONDS || "600",
    HERMES_DELEGATION_MAX_CONCURRENT_CHILDREN: process.env.HERMES_DELEGATION_MAX_CONCURRENT_CHILDREN || "2",
    HERMES_DELEGATION_MAX_ASYNC_CHILDREN: process.env.HERMES_DELEGATION_MAX_ASYNC_CHILDREN || "2",
    HERMES_DELEGATION_MAX_SPAWN_DEPTH: process.env.HERMES_DELEGATION_MAX_SPAWN_DEPTH || "1",
    HERMES_DELEGATION_SUBAGENT_AUTO_APPROVE: "false",
    HERMES_DELEGATION_MODEL: process.env.HERMES_DELEGATION_MODEL ?? "",
    HERMES_DELEGATION_PROVIDER: process.env.HERMES_DELEGATION_PROVIDER ?? "",
    HERMES_DELEGATION_REASONING_EFFORT: process.env.HERMES_DELEGATION_REASONING_EFFORT ?? "",
  };
  configureReadOnlyCommandWrappers(env);
  configureGitHubCliAuth(env);
  configurePostgresSafety(env);
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
  mkdirSync(dirname(configPath), { recursive: true, mode: 0o700 });
  chmodSync(dirname(configPath), 0o700);

  const template = readFileSync(settings.hermesConfigTemplatePath, "utf8");
  const config = configureContext7Auth(
    setMcpToolInclude(
      setMcpServerEnabled(setMcpServerEnabled(template, "jira", settings.features.sources.jiraJsm.enabled), "context7", true),
      "jira",
      jiraReadOnlyTools(process.env),
    ),
    Boolean(process.env.CONTEXT7_API_KEY?.trim()),
  );

  const temporaryPath = `${configPath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporaryPath, config, { mode: 0o600 });
  renameSync(temporaryPath, configPath);
  chmodSync(configPath, 0o600);
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
    const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
    rmSync(staleFlatPath, { recursive: true, force: true });
    rmSync(temporaryPath, { recursive: true, force: true });
    mkdirSync(dirname(temporaryPath), { recursive: true });
    cpSync(sourcePath, temporaryPath, { recursive: true });
    rmSync(targetPath, { recursive: true, force: true });
    mkdirSync(dirname(targetPath), { recursive: true });
    renameSync(temporaryPath, targetPath);
  }

  removeDuplicateManagedSkills(targetDir);
}

// Hermes resolves skills by directory name across the whole tree, so a stale
// copy of a managed skill at any other path causes a name collision and makes
// skill resolution nondeterministic.
function removeDuplicateManagedSkills(targetDir: string): void {
  for (const skill of managedSkillTargets) {
    const managedPath = join(targetDir, skill.target);
    for (const duplicate of findAllHermesSkillPaths(targetDir, skill.name)) {
      if (duplicate !== managedPath) {
        rmSync(duplicate, { recursive: true, force: true });
      }
    }
  }
}

function findAllHermesSkillPaths(skillsPath: string, skillName: string): string[] {
  if (!existsSync(skillsPath)) {
    return [];
  }

  const found: string[] = [];
  if (existsSync(join(skillsPath, skillName, "SKILL.md"))) {
    found.push(join(skillsPath, skillName));
  }

  for (const entry of readdirSync(skillsPath, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === skillName) {
      continue;
    }
    found.push(...findAllHermesSkillPaths(join(skillsPath, entry.name), skillName));
  }

  return found;
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

function configureGitHubCliAuth(env: NodeJS.ProcessEnv): void {
  const token = env.GITHUB_TOKEN?.trim();
  if (!token) {
    return;
  }

  const configDir = createPrivateTempDir("incident-agent-gh-");
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
  delete env.GITHUB_TOKEN;
}

function configureReadOnlyCommandWrappers(env: NodeJS.ProcessEnv): void {
  const wrapperDir = createPrivateTempDir("incident-agent-bin-");
  const wrappers = [
    { command: "gh", envName: "INCIDENT_AGENT_REAL_GH", script: "gh.mjs" },
    { command: "git", envName: "INCIDENT_AGENT_REAL_GIT", script: "git.mjs" },
    { command: "cx", envName: "INCIDENT_AGENT_REAL_CX", script: "cx.mjs" },
    { command: "psql", envName: "INCIDENT_AGENT_REAL_PSQL", script: "psql.mjs" },
  ] as const;

  for (const wrapper of wrappers) {
    const binary = findExecutable(wrapper.command, env.PATH);
    if (!binary) {
      continue;
    }
    const source = resolve("scripts", "runtime-wrappers", wrapper.script);
    if (!existsSync(source)) {
      throw new Error(`Missing runtime wrapper ${source}`);
    }
    const target = join(wrapperDir, wrapper.command);
    cpSync(source, target);
    chmodSync(target, 0o700);
    env[wrapper.envName] = binary;
  }

  env.PATH = [wrapperDir, env.PATH].filter(Boolean).join(":");
}

function findExecutable(command: string, pathValue: string | undefined): string | undefined {
  for (const directory of pathValue?.split(":") ?? []) {
    const candidate = join(directory, command);
    try {
      accessSync(candidate, X_OK);
      return candidate;
    } catch {
      // Continue searching PATH.
    }
  }
  return undefined;
}

async function withRuntimePreparationLock(settings: Settings, action: () => void): Promise<void> {
  const parent = runtimeHermesHome(settings);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const lockPath = join(parent, ".prepare.lock");
  const deadline = Date.now() + 30_000;

  while (true) {
    try {
      mkdirSync(lockPath, { mode: 0o700 });
      break;
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") {
        throw error;
      }
      if (isStaleLock(lockPath)) {
        rmSync(lockPath, { recursive: true, force: true });
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for Hermes runtime preparation lock ${lockPath}`);
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
  }

  try {
    action();
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

function isStaleLock(path: string): boolean {
  try {
    return Date.now() - statSync(path).mtimeMs > 5 * 60_000;
  } catch {
    return false;
  }
}

function configurePostgresSafety(env: NodeJS.ProcessEnv): void {
  if (!env.DATABASE_URL?.trim()) {
    return;
  }

  env.PGOPTIONS = [
    env.PGOPTIONS?.trim(),
    "-c",
    `statement_timeout=${postgresTimeoutMs(env.POSTGRES_STATEMENT_TIMEOUT_MS, 5_000)}`,
    "-c",
    `lock_timeout=${postgresTimeoutMs(env.POSTGRES_LOCK_TIMEOUT_MS, 1_000)}`,
    "-c",
    `idle_in_transaction_session_timeout=${postgresTimeoutMs(env.POSTGRES_IDLE_IN_TRANSACTION_TIMEOUT_MS, 5_000)}`,
    "-c",
    "default_transaction_read_only=on",
  ]
    .filter(Boolean)
    .join(" ");
}

function postgresTimeoutMs(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
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

function configureContext7Auth(config: string, hasApiKey: boolean): string {
  if (hasApiKey) {
    return config;
  }

  return config.replace(/\n\s{4}headers:\n\s{6}CONTEXT7_API_KEY: "\$\{CONTEXT7_API_KEY\}"/, "");
}

function jiraReadOnlyTools(env: NodeJS.ProcessEnv): string[] {
  const tools = (env.JIRA_MCP_READONLY_TOOLS ?? "").split(",").map((tool) => tool.trim()).filter(Boolean);
  const unsafe = tools.filter((tool) => /(^|[_-])(create|update|delete|remove|add|set|transition|assign|comment|write|edit|move|link|upload|attach|archive|restore)([_-]|$)/i.test(tool));
  if (unsafe.length > 0) {
    throw new Error(`JIRA_MCP_READONLY_TOOLS contains mutation-looking tools: ${unsafe.join(", ")}`);
  }
  return [...new Set(tools)];
}

function setMcpToolInclude(config: string, serverName: string, tools: string[]): string {
  const escapedName = escapeRegExp(serverName);
  const pattern = new RegExp(`(^\\s{2}${escapedName}:\\n[\\s\\S]*?^\\s{6}include:\\s*)\\[[^\\n]*\\]`, "m");
  if (!pattern.test(config)) {
    throw new Error(`Hermes config template is missing mcp_servers.${serverName}.tools.include`);
  }
  return config.replace(pattern, `$1[${tools.map(yamlString).join(", ")}]`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

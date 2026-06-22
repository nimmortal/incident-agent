import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import type { Settings } from "./config.ts";

export function buildHermesEnvironment(settings: Settings): NodeJS.ProcessEnv {
  writeRuntimeConfig(settings);
  seedHermesSkills(settings);
  return {
    ...process.env,
    HOME: runtimeHome(settings),
  };
}

export function runtimeConfigPath(settings: Settings): string {
  return join(runtimeHome(settings), ".hermes", "config.yaml");
}

export function runtimeHome(settings: Settings): string {
  return resolve(settings.hermesRuntimeHome);
}

function writeRuntimeConfig(settings: Settings): void {
  const configPath = runtimeConfigPath(settings);
  mkdirSync(dirname(configPath), { recursive: true });

  const template = readFileSync(settings.hermesConfigTemplatePath, "utf8");
  const config = setMcpServerEnabled(template, "jira", settings.features.sources.jiraJsm.enabled);

  writeFileSync(configPath, config);
}

function seedHermesSkills(settings: Settings): void {
  const sourceDir = join(resolve(settings.hermesSkillsSeedHome), ".hermes", "skills");
  if (!existsSync(sourceDir)) {
    return;
  }

  const targetDir = join(runtimeHome(settings), ".hermes", "skills");
  mkdirSync(targetDir, { recursive: true });

  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) {
      continue;
    }

    const targetPath = join(targetDir, entry.name);
    if (existsSync(targetPath)) {
      continue;
    }

    cpSync(join(sourceDir, entry.name), targetPath, { recursive: true });
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

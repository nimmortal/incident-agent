import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import type { Settings } from "./config.ts";

export function buildHermesEnvironment(settings: Settings): NodeJS.ProcessEnv {
  writeRuntimeConfig(settings);
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
  const config = setMcpServerEnabled(
    setMcpServerEnabled(template, "jira", settings.features.sources.jiraJsm.enabled),
    "coralogix",
    settings.features.sources.coralogix.enabled,
  );

  writeFileSync(configPath, config);
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

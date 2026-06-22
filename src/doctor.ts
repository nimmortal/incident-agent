import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { loadSettings } from "./config.ts";

function main(): void {
  const settings = loadSettings();

  console.log("Environment:");
  report("COPILOT_GITHUB_TOKEN", process.env.COPILOT_GITHUB_TOKEN);
  report("JIRA_MCP_URL", process.env.JIRA_MCP_URL);
  report("JIRA_MCP_TOKEN", process.env.JIRA_MCP_TOKEN);
  report("GITHUB_TOKEN", process.env.GITHUB_TOKEN, true);
  report("CORALOGIX_API_KEY", process.env.CORALOGIX_API_KEY, true);
  report("CORALOGIX_DOMAIN", process.env.CORALOGIX_DOMAIN, true);

  const localConfigPath = "config/hermes.config.yaml";
  const runtimeConfigPath = join(process.env.HOME ?? "", ".hermes", "config.yaml");
  console.log("\nConfig:");
  console.log(`- local template: ${existsSync(localConfigPath) ? "found" : "missing"} (${localConfigPath})`);
  console.log(`- runtime path: ${runtimeConfigPath}`);

  console.log("\nHermes:");
  const result = spawnSync(settings.hermesBin, ["--version"], {
    encoding: "utf8",
    timeout: 15_000,
  });
  if (result.error) {
    console.log(`- binary: missing or failed (${settings.hermesBin})`);
  } else {
    const output = (result.stdout || result.stderr).trim();
    console.log(`- binary: found (${output || "no version output"})`);
  }

  console.log("\nGitHub CLI:");
  const ghResult = spawnSync("gh", ["--version"], {
    encoding: "utf8",
    timeout: 15_000,
  });
  if (ghResult.error) {
    console.log("- gh: missing or failed");
  } else {
    const output = (ghResult.stdout || ghResult.stderr).split(/\r?\n/)[0]?.trim();
    console.log(`- gh: found (${output || "no version output"})`);
  }
}

function report(name: string, value: string | undefined, optional = false): void {
  const state = value && value.trim() ? "set" : optional ? "not set" : "missing";
  console.log(`- ${name}: ${state}`);
}

main();

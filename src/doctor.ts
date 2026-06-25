import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

import { loadSettings } from "./config.ts";
import { listFeatures } from "./features.ts";
import { gitHubAppTokenSourceDescription, missingGitHubAppCredentials } from "./github-app-token.ts";
import {
  gitHubCliConfigPath,
  hasHermesSkill,
  localSkillsPath,
  runtimeConfigPath,
  runtimeHome,
  runtimeSkillsPath,
  skillsSeedPath,
} from "./hermes-config.ts";
import { managedSkills } from "./skill-sets.ts";

function main(): void {
  const settings = loadSettings();

  console.log("Features:");
  for (const feature of listFeatures(settings.features)) {
    const state = feature.enabled ? "enabled" : `disabled (missing ${feature.missingEnv.join(", ")})`;
    console.log(`- ${feature.name} [${feature.kind}]: ${state}`);
  }

  console.log("\nConfig:");
  console.log(
    `- local template: ${existsSync(settings.hermesConfigTemplatePath) ? "found" : "missing"} (${settings.hermesConfigTemplatePath})`,
  );
  console.log(`- generated runtime path: ${runtimeConfigPath(settings)}`);
  console.log(`- runtime home: ${runtimeHome(settings)}`);
  console.log(`- runtime skills path: ${runtimeSkillsPath(settings)}`);

  const seedPath = skillsSeedPath(settings);
  const localPath = localSkillsPath(settings);
  console.log(`- bundled skill seed: ${existsSync(seedPath) ? "found" : "missing"} (${seedPath})`);
  console.log(`- local skills path: ${existsSync(localPath) ? "found" : "missing"} (${localPath})`);
  for (const skill of managedSkills) {
    const state = hasHermesSkill(seedPath, skill) || hasHermesSkill(localPath, skill) ? "found" : "missing";
    console.log(`  - ${skill}: ${state}`);
  }

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
  const appTokenSource = gitHubAppTokenSourceDescription();
  if (appTokenSource) {
    console.log(`- token source: ${appTokenSource} (generated at runtime)`);
  } else if (process.env.GITHUB_TOKEN?.trim()) {
    console.log("- token source: GITHUB_TOKEN");
    console.log(`- gh config path for Hermes: ${gitHubCliConfigPath(settings)}`);
  } else {
    const missingApp = missingGitHubAppCredentials();
    console.log(`- token source: missing GITHUB_TOKEN or GitHub App credentials (${missingApp.join(", ")})`);
  }
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

  console.log("\nCoralogix CLI:");
  const cxResult = spawnSync("cx", ["--version"], {
    encoding: "utf8",
    timeout: 15_000,
  });
  if (cxResult.error) {
    console.log("- cx: missing or failed");
  } else {
    const output = (cxResult.stdout || cxResult.stderr).split(/\r?\n/)[0]?.trim();
    console.log(`- cx: found (${output || "no version output"})`);
  }

  console.log("\nPostgres CLI:");
  const psqlResult = spawnSync("psql", ["--version"], {
    encoding: "utf8",
    timeout: 15_000,
  });
  if (psqlResult.error) {
    console.log("- psql: missing or failed");
  } else {
    const output = (psqlResult.stdout || psqlResult.stderr).split(/\r?\n/)[0]?.trim();
    console.log(`- psql: found (${output || "no version output"})`);
  }
}

main();

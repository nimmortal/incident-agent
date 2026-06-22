import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

import { loadSettings } from "./config.ts";
import { listFeatures } from "./features.ts";
import { hasHermesSkill, runtimeConfigPath, runtimeHome, runtimeSkillsPath, skillsSeedPath } from "./hermes-config.ts";
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
  console.log(`- bundled skill seed: ${existsSync(seedPath) ? "found" : "missing"} (${seedPath})`);
  for (const skill of managedSkills) {
    const state = hasHermesSkill(seedPath, skill) ? "found" : "missing";
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
}

main();

import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { loadSettings } from "./config.ts";
import { listFeatures } from "./features.ts";

function main(): void {
  const settings = loadSettings();

  console.log("Features:");
  for (const feature of listFeatures(settings.features)) {
    const state = feature.enabled ? "enabled" : `disabled (missing ${feature.missingEnv.join(", ")})`;
    console.log(`- ${feature.name} [${feature.kind}]: ${state}`);
  }

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

main();

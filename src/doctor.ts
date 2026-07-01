import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

import { loadSettings } from "./config.ts";
import { listFeatures } from "./features.ts";
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

async function main(): Promise<void> {
  const settings = loadSettings();
  const verifySources = process.argv.includes("--verify-sources");

  console.log("Features:");
  for (const feature of listFeatures(settings.features)) {
    const state = feature.enabled ? "enabled" : `disabled (missing ${feature.missingEnv.join(", ")})`;
    console.log(`- ${feature.name} [${feature.kind}]: ${state}`);
  }

  console.log("\nConfig:");
  console.log(
    `- local template: ${existsSync(settings.hermesConfigTemplatePath) ? "found" : "missing"} (${settings.hermesConfigTemplatePath})`,
  );
  console.log(`- prompt templates: ${existsSync(settings.promptTemplatesDir) ? "found" : "missing"} (${settings.promptTemplatesDir})`);
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
  if (process.env.GITHUB_TOKEN?.trim()) {
    console.log("- token source: GITHUB_TOKEN");
    console.log(`- gh config path for Hermes: ${gitHubCliConfigPath(settings)}`);
  } else {
    console.log("- token source: missing GITHUB_TOKEN");
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

  if (verifySources) {
    await verifyLiveSources();
  }
}

async function verifyLiveSources(): Promise<void> {
  console.log("\nLive Source Probes:");
  await verifyJiraMcp();
  verifyGitHub();
  verifyCoralogix();
  verifyPostgres();
}

async function verifyJiraMcp(): Promise<void> {
  const url = process.env.JIRA_MCP_URL?.trim();
  if (!url) {
    console.log("- Jira MCP: skipped (missing JIRA_MCP_URL)");
    return;
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: jiraMcpProbeHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 401 || response.status === 403) {
      console.log(`- Jira MCP: auth failed (${response.status})`);
      return;
    }
    if (response.status >= 500) {
      console.log(`- Jira MCP: failed (${response.status})`);
      return;
    }
    console.log(`- Jira MCP: reachable (${response.status})`);
  } catch (error) {
    console.log(`- Jira MCP: failed (${errorMessage(error)})`);
  }
}

function verifyGitHub(): void {
  if (!process.env.GITHUB_TOKEN?.trim()) {
    console.log("- GitHub: skipped (missing GITHUB_TOKEN)");
    return;
  }

  const result = spawnSync("gh", ["auth", "status", "--hostname", "github.com"], {
    encoding: "utf8",
    timeout: 15_000,
    stdio: "pipe",
  });
  if (result.error || result.status !== 0) {
    console.log(`- GitHub: failed (${commandFailure(result)})`);
    return;
  }
  console.log("- GitHub: authenticated");
}

function verifyCoralogix(): void {
  if (!process.env.CX_API_KEY?.trim() || !process.env.CX_REGION?.trim()) {
    console.log("- Coralogix: skipped (missing CX_API_KEY or CX_REGION)");
    return;
  }
  console.log("- Coralogix: not probed (configure a safe account-specific read query before enabling live cx probes)");
}

function verifyPostgres(): void {
  if (!process.env.DATABASE_URL?.trim()) {
    console.log("- Postgres: skipped (missing DATABASE_URL)");
    return;
  }

  const result = spawnSync(
    "psql",
    [
      process.env.DATABASE_URL,
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "--csv",
      "-c",
      [
        "BEGIN READ ONLY",
        `SET LOCAL statement_timeout = '${postgresTimeoutMs("POSTGRES_STATEMENT_TIMEOUT_MS", 5_000)}ms'`,
        `SET LOCAL lock_timeout = '${postgresTimeoutMs("POSTGRES_LOCK_TIMEOUT_MS", 1_000)}ms'`,
        "SELECT now() LIMIT 1",
        "ROLLBACK",
      ].join("; "),
    ],
    {
      encoding: "utf8",
      timeout: postgresTimeoutMs("POSTGRES_STATEMENT_TIMEOUT_MS", 5_000) + 5_000,
      stdio: "pipe",
    },
  );
  if (result.error || result.status !== 0) {
    console.log(`- Postgres: failed (${commandFailure(result)})`);
    return;
  }
  console.log("- Postgres: read-only query succeeded");
}

function postgresTimeoutMs(envName: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[envName] ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function jiraMcpProbeHeaders(): Record<string, string> {
  const token = process.env.JIRA_MCP_TOKEN?.trim();
  if (!token) {
    return {};
  }
  const scheme = process.env.JIRA_MCP_AUTH_SCHEME?.trim() || "Bearer";
  return { Authorization: `${scheme} ${token}` };
}

function commandFailure(result: ReturnType<typeof spawnSync>): string {
  if (result.error) {
    return result.error.message;
  }
  const output = [String(result.stderr || "").trim(), String(result.stdout || "").trim()].filter(Boolean).join("; ");
  return output || `exit ${result.status}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

main().catch((error: unknown) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});

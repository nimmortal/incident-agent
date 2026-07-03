import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { loadSettings } from "./config.ts";

const maxTables = 2_000;
const statementTimeout = "15s";

async function main(): Promise<void> {
  const settings = loadSettings();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured; nothing to cache");
  }

  const schemas = runReadOnlyQuery(
    databaseUrl,
    [
      "SELECT '- ' || schema_name",
      "FROM information_schema.schemata",
      "WHERE schema_name NOT IN ('pg_catalog', 'information_schema')",
      "AND schema_name NOT LIKE 'pg\\_%'",
      "ORDER BY schema_name",
    ].join(" "),
  );

  const tables = runReadOnlyQuery(
    databaseUrl,
    [
      "SELECT '- ' || table_schema || '.' || table_name || ': ' ||",
      "string_agg(column_name || ' ' || data_type, ', ' ORDER BY ordinal_position)",
      "FROM information_schema.columns",
      "WHERE table_schema NOT IN ('pg_catalog', 'information_schema')",
      "AND table_schema NOT LIKE 'pg\\_%'",
      "GROUP BY table_schema, table_name",
      "ORDER BY table_schema, table_name",
      `LIMIT ${maxTables}`,
    ].join(" "),
  );

  const cachePath = resolve(settings.schemaCachePath);
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(
    cachePath,
    [
      "# Postgres Schema Cache",
      "",
      `Generated: ${new Date().toISOString()} by \`npm run schema-cache\``,
      `Database: ${redactedDatabaseLabel(databaseUrl)}`,
      "",
      "This is a catalog snapshot for investigation planning. Verify the specific",
      "schema-qualified table with `information_schema` before querying its data;",
      "regenerate after migrations.",
      "",
      "## Schemas",
      "",
      schemas || "- (none visible)",
      "",
      "## Tables And Columns",
      "",
      tables || "- (none visible)",
      "",
    ].join("\n"),
  );

  const tableCount = tables ? tables.split("\n").length : 0;
  console.log(`Wrote ${cachePath} (${tableCount} tables/views${tableCount >= maxTables ? ", truncated" : ""})`);
}

function runReadOnlyQuery(databaseUrl: string, query: string): string {
  const result = spawnSync(
    "psql",
    [
      "-X",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `BEGIN READ ONLY; SET LOCAL statement_timeout = '${statementTimeout}'; SET LOCAL lock_timeout = '1s'; ${query}; ROLLBACK;`,
    ],
    {
      encoding: "utf8",
      env: psqlEnv(databaseUrl),
      timeout: 60_000,
      stdio: "pipe",
    },
  );

  if (result.error) {
    throw new Error(`psql failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`psql failed: ${String(result.stderr || result.stdout).trim() || `exit ${result.status}`}`);
  }

  return result.stdout.trim();
}

function psqlEnv(databaseUrl: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    // libpq reads PGDATABASE as the dbname connection parameter; a connection
    // URI works here without exposing credentials in the psql argv.
    PGDATABASE: databaseUrl,
  };
  delete env.DATABASE_URL;
  return env;
}

function redactedDatabaseLabel(databaseUrl: string): string {
  try {
    const parsed = new URL(databaseUrl);
    const database = parsed.pathname.replace(/^\//, "") || "(default)";
    return `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}/${database}`;
  } catch {
    return "(unparseable DATABASE_URL; value not printed)";
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

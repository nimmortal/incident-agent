import { existsSync, readFileSync } from "node:fs";

export interface Settings {
  jiraProjectKey: string;
  jiraJql: string;
  jiraPollIntervalSeconds: number;
  jiraPollBatchSize: number;
  hermesBin: string;
  hermesArgs: string[];
  hermesTimeoutSeconds: number;
  investigatingLabel: string;
  investigatedLabel: string;
  failedLabel: string;
}

export function loadSettings(): Settings {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const jiraProjectKey = env("JIRA_PROJECT_KEY", "JSM");
  const defaultJql = [
    `project = ${jiraProjectKey}`,
    "AND statusCategory != Done",
    "AND (labels is EMPTY OR labels not in (ai-investigated, ai-investigating))",
    "ORDER BY created ASC",
  ].join(" ");

  return {
    jiraProjectKey,
    jiraJql: env("JIRA_JQL", defaultJql),
    jiraPollIntervalSeconds: numberEnv("JIRA_POLL_INTERVAL_SECONDS", 300),
    jiraPollBatchSize: numberEnv("JIRA_POLL_BATCH_SIZE", 3),
    hermesBin: env("HERMES_BIN", "hermes"),
    hermesArgs: splitArgs(env("HERMES_ARGS", "chat --quiet -q")),
    hermesTimeoutSeconds: numberEnv("HERMES_TIMEOUT_SECONDS", 900),
    investigatingLabel: "ai-investigating",
    investigatedLabel: "ai-investigated",
    failedLabel: "ai-investigation-failed",
  };
}

export function validateSettings(settings: Settings): void {
  if (!settings.hermesBin) {
    throw new Error("Missing HERMES_BIN");
  }
}

function loadEnvFile(path: string): void {
  if (!existsSync(path)) {
    return;
  }

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) {
      continue;
    }
    process.env[key] = unquote(rawValue.trim());
  }
}

function env(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number`);
  }
  return value;
}

function unquote(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function splitArgs(value: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (const char of value) {
    if ((char === '"' || char === "'") && quote === null) {
      quote = char;
      continue;
    }
    if (char === quote) {
      quote = null;
      continue;
    }
    if (/\s/.test(char) && quote === null) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (current) {
    args.push(current);
  }
  return args;
}

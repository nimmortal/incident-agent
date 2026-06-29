import dotenv from "dotenv";
import { cleanEnv, num, str } from "envalid";
import { z } from "zod";
import { buildFeatures, featureRegistrySchema } from "./features.ts";

const settingsSchema = z.object({
  features: featureRegistrySchema,
  jiraProjectKey: z.string().min(1),
  jiraJql: z.string().min(1),
  jiraPollIntervalSeconds: z.number().int().positive(),
  jiraPollBatchSize: z.number().int().positive(),
  hermesBin: z.string().min(1),
  hermesArgs: z.array(z.string().min(1)),
  hermesConfigTemplatePath: z.string().min(1),
  promptTemplatesDir: z.string().min(1),
  hermesRuntimeHome: z.string().min(1),
  investigationJournalDir: z.string().min(1),
  hermesSkillsSeedHome: z.string().min(1),
  hermesLocalSkillsPath: z.string().min(1),
  hermesTimeoutSeconds: z.number().int().positive(),
  hermesIdleTimeoutSeconds: z.number().int().nonnegative(),
  hermesTerminateGraceSeconds: z.number().int().positive(),
  hermesHeartbeatSeconds: z.number().int().positive(),
  hermesRecoveryAttempts: z.number().int().nonnegative(),
  investigationPhaseMaxSteps: z.number().int().positive(),
  investigatingLabel: z.string().min(1),
  investigatedLabel: z.string().min(1),
  failedLabel: z.string().min(1),
});

export type Settings = z.infer<typeof settingsSchema>;

export function loadSettings(): Settings {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const env = cleanEnv(process.env, {
    JIRA_PROJECT_KEY: str({ default: "JSM" }),
    JIRA_JQL: str({ default: "" }),
    JIRA_POLL_INTERVAL_SECONDS: num({ default: 300 }),
    JIRA_POLL_BATCH_SIZE: num({ default: 3 }),
    HERMES_BIN: str({ default: "hermes" }),
    HERMES_ARGS: str({ default: "chat --quiet -q" }),
    HERMES_CONFIG_TEMPLATE: str({ default: "config/hermes.config.yaml" }),
    PROMPT_TEMPLATES_DIR: str({ default: "config/prompts" }),
    HERMES_RUNTIME_HOME: str({ default: "data/hermes-home" }),
    INVESTIGATION_JOURNAL_DIR: str({ default: "data/investigations" }),
    HERMES_SKILLS_SEED_HOME: str({ default: "/opt/hermes-seed-home" }),
    HERMES_LOCAL_SKILLS_PATH: str({ default: "skills" }),
    HERMES_TIMEOUT_SECONDS: num({ default: 900 }),
    HERMES_IDLE_TIMEOUT_SECONDS: num({ default: 300 }),
    HERMES_TERMINATE_GRACE_SECONDS: num({ default: 10 }),
    HERMES_HEARTBEAT_SECONDS: num({ default: 60 }),
    HERMES_RECOVERY_ATTEMPTS: num({ default: 1 }),
    INVESTIGATION_PHASE_MAX_STEPS: num({ default: 3 }),
  });

  const jiraProjectKey = env.JIRA_PROJECT_KEY;
  const defaultJql = [
    `project = ${jiraProjectKey}`,
    "AND statusCategory != Done",
    "AND (labels is EMPTY OR labels not in (ai-investigated, ai-investigating))",
    "ORDER BY created ASC",
  ].join(" ");

  return settingsSchema.parse({
    features: buildFeatures(process.env),
    jiraProjectKey,
    jiraJql: env.JIRA_JQL || defaultJql,
    jiraPollIntervalSeconds: env.JIRA_POLL_INTERVAL_SECONDS,
    jiraPollBatchSize: env.JIRA_POLL_BATCH_SIZE,
    hermesBin: env.HERMES_BIN,
    hermesArgs: splitArgs(env.HERMES_ARGS),
    hermesConfigTemplatePath: env.HERMES_CONFIG_TEMPLATE,
    promptTemplatesDir: env.PROMPT_TEMPLATES_DIR,
    hermesRuntimeHome: env.HERMES_RUNTIME_HOME,
    investigationJournalDir: env.INVESTIGATION_JOURNAL_DIR,
    hermesSkillsSeedHome: env.HERMES_SKILLS_SEED_HOME,
    hermesLocalSkillsPath: env.HERMES_LOCAL_SKILLS_PATH,
    hermesTimeoutSeconds: env.HERMES_TIMEOUT_SECONDS,
    hermesIdleTimeoutSeconds: env.HERMES_IDLE_TIMEOUT_SECONDS,
    hermesTerminateGraceSeconds: env.HERMES_TERMINATE_GRACE_SECONDS,
    hermesHeartbeatSeconds: env.HERMES_HEARTBEAT_SECONDS,
    hermesRecoveryAttempts: env.HERMES_RECOVERY_ATTEMPTS,
    investigationPhaseMaxSteps: env.INVESTIGATION_PHASE_MAX_STEPS,
    investigatingLabel: "ai-investigating",
    investigatedLabel: "ai-investigated",
    failedLabel: "ai-investigation-failed",
  });
}

export function validateSettings(settings: Settings): void {
  settingsSchema.parse(settings);
}

function loadEnvFile(path: string): void {
  dotenv.config({ path, override: false, quiet: true });
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

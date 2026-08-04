import dotenv from "dotenv";
import { cleanEnv, num, str } from "envalid";
import { z } from "zod";
import { buildFeatures, featureRegistrySchema } from "./features.ts";

const reasoningEffortSchema = z.union([z.literal(""), z.enum(["none", "minimal", "low", "medium", "high", "xhigh"])]);

const investigationPhaseSettingsSchema = z.object({
  triage: z.number().int().positive(),
  code: z.number().int().positive(),
  evidence: z.number().int().positive(),
  synthesis: z.number().int().positive(),
});

const investigationReasoningEffortSchema = z.object({
  triage: reasoningEffortSchema,
  code: reasoningEffortSchema,
  evidence: reasoningEffortSchema,
  synthesis: reasoningEffortSchema,
});

const confluenceFolderSchema = z.string().refine((value) => !/[\r\n]/.test(value), {
  message: "CONFLUENCE_KNOWLEDGE_FOLDER must be a single-line folder locator",
});

const settingsSchema = z.object({
  features: featureRegistrySchema,
  jiraProjectKey: z.string().min(1),
  jiraJql: z.string().min(1),
  jiraPollIntervalSeconds: z.number().int().positive(),
  jiraPollBatchSize: z.number().int().positive(),
  jiraPollCandidateBatchSize: z.number().int().positive(),
  jiraPollMaxBackoffSeconds: z.number().int().positive(),
  hermesBin: z.string().min(1),
  hermesArgs: z.array(z.string().min(1)),
  hermesConfigTemplatePath: z.string().min(1),
  promptTemplatesDir: z.string().min(1),
  hermesRuntimeHome: z.string().min(1),
  investigationJournalDir: z.string().min(1),
  investigationJournalRetentionDays: z.number().int().nonnegative(),
  pollStatePath: z.string().min(1),
  hermesSkillsSeedHome: z.string().min(1),
  hermesLocalSkillsPath: z.string().min(1),
  repoCacheDir: z.string().min(1),
  schemaCachePath: z.string().min(1),
  confluenceKnowledgeFolder: confluenceFolderSchema,
  confluenceKnowledgeUseUnconfirmed: z.boolean(),
  hermesTimeoutSeconds: z.number().int().positive(),
  hermesIdleTimeoutSeconds: z.number().int().nonnegative(),
  hermesTerminateGraceSeconds: z.number().int().positive(),
  hermesHeartbeatSeconds: z.number().int().positive(),
  hermesRecoveryAttempts: z.number().int().nonnegative(),
  investigationPhaseMaxSteps: investigationPhaseSettingsSchema,
  investigationReasoningEffort: investigationReasoningEffortSchema,
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
    JIRA_POLL_CANDIDATE_BATCH_SIZE: num({ default: 15 }),
    JIRA_POLL_MAX_BACKOFF_SECONDS: num({ default: 3600 }),
    HERMES_BIN: str({ default: "hermes" }),
    HERMES_ARGS: str({ default: "chat --quiet -q" }),
    HERMES_CONFIG_TEMPLATE: str({ default: "config/hermes.config.yaml" }),
    PROMPT_TEMPLATES_DIR: str({ default: "config/prompts" }),
    HERMES_RUNTIME_HOME: str({ default: "data/hermes-home" }),
    INVESTIGATION_JOURNAL_DIR: str({ default: "data/investigations" }),
    INVESTIGATION_JOURNAL_RETENTION_DAYS: num({ default: 30 }),
    POLL_STATE_PATH: str({ default: "data/poll-state.json" }),
    HERMES_SKILLS_SEED_HOME: str({ default: "/opt/hermes-seed-home" }),
    HERMES_LOCAL_SKILLS_PATH: str({ default: "skills" }),
    REPO_CACHE_DIR: str({ default: "data/repos" }),
    SCHEMA_CACHE_PATH: str({ default: "data/schema-cache.md" }),
    CONFLUENCE_KNOWLEDGE_FOLDER: str({ default: "" }),
    CONFLUENCE_KNOWLEDGE_USE_UNCONFIRMED: str({ default: "false", choices: ["true", "false"] }),
    HERMES_TIMEOUT_SECONDS: num({ default: 900 }),
    HERMES_IDLE_TIMEOUT_SECONDS: num({ default: 300 }),
    HERMES_TERMINATE_GRACE_SECONDS: num({ default: 10 }),
    HERMES_HEARTBEAT_SECONDS: num({ default: 60 }),
    HERMES_RECOVERY_ATTEMPTS: num({ default: 1 }),
    INVESTIGATION_PHASE_MAX_STEPS: str({ default: "" }),
    INVESTIGATION_TRIAGE_MAX_STEPS: num({ default: 2 }),
    INVESTIGATION_CODE_MAX_STEPS: num({ default: 3 }),
    INVESTIGATION_EVIDENCE_MAX_STEPS: num({ default: 6 }),
    INVESTIGATION_SYNTHESIS_MAX_STEPS: num({ default: 2 }),
    HERMES_REASONING_EFFORT_TRIAGE: str({ default: "" }),
    HERMES_REASONING_EFFORT_CODE: str({ default: "" }),
    HERMES_REASONING_EFFORT_EVIDENCE: str({ default: "high" }),
    HERMES_REASONING_EFFORT_SYNTHESIS: str({ default: "high" }),
  });

  const jiraProjectKey = env.JIRA_PROJECT_KEY;
  const defaultJql = [
    `project = ${jiraProjectKey}`,
    "AND statusCategory != Done",
    "ORDER BY created ASC",
  ].join(" ");

  return settingsSchema.parse({
    features: buildFeatures(process.env),
    jiraProjectKey,
    jiraJql: env.JIRA_JQL || defaultJql,
    jiraPollIntervalSeconds: env.JIRA_POLL_INTERVAL_SECONDS,
    jiraPollBatchSize: env.JIRA_POLL_BATCH_SIZE,
    jiraPollCandidateBatchSize: env.JIRA_POLL_CANDIDATE_BATCH_SIZE,
    jiraPollMaxBackoffSeconds: env.JIRA_POLL_MAX_BACKOFF_SECONDS,
    hermesBin: env.HERMES_BIN,
    hermesArgs: splitArgs(env.HERMES_ARGS),
    hermesConfigTemplatePath: env.HERMES_CONFIG_TEMPLATE,
    promptTemplatesDir: env.PROMPT_TEMPLATES_DIR,
    hermesRuntimeHome: env.HERMES_RUNTIME_HOME,
    investigationJournalDir: env.INVESTIGATION_JOURNAL_DIR,
    investigationJournalRetentionDays: env.INVESTIGATION_JOURNAL_RETENTION_DAYS,
    pollStatePath: env.POLL_STATE_PATH,
    hermesSkillsSeedHome: env.HERMES_SKILLS_SEED_HOME,
    hermesLocalSkillsPath: env.HERMES_LOCAL_SKILLS_PATH,
    repoCacheDir: env.REPO_CACHE_DIR,
    schemaCachePath: env.SCHEMA_CACHE_PATH,
    confluenceKnowledgeFolder: env.CONFLUENCE_KNOWLEDGE_FOLDER.trim(),
    confluenceKnowledgeUseUnconfirmed: env.CONFLUENCE_KNOWLEDGE_USE_UNCONFIRMED === "true",
    hermesTimeoutSeconds: env.HERMES_TIMEOUT_SECONDS,
    hermesIdleTimeoutSeconds: env.HERMES_IDLE_TIMEOUT_SECONDS,
    hermesTerminateGraceSeconds: env.HERMES_TERMINATE_GRACE_SECONDS,
    hermesHeartbeatSeconds: env.HERMES_HEARTBEAT_SECONDS,
    hermesRecoveryAttempts: env.HERMES_RECOVERY_ATTEMPTS,
    investigationPhaseMaxSteps: investigationPhaseMaxSteps(env),
    investigationReasoningEffort: {
      triage: env.HERMES_REASONING_EFFORT_TRIAGE,
      code: env.HERMES_REASONING_EFFORT_CODE,
      evidence: env.HERMES_REASONING_EFFORT_EVIDENCE,
      synthesis: env.HERMES_REASONING_EFFORT_SYNTHESIS,
    },
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

interface PhaseStepEnv {
  INVESTIGATION_PHASE_MAX_STEPS: string;
  INVESTIGATION_TRIAGE_MAX_STEPS: number;
  INVESTIGATION_CODE_MAX_STEPS: number;
  INVESTIGATION_EVIDENCE_MAX_STEPS: number;
  INVESTIGATION_SYNTHESIS_MAX_STEPS: number;
}

function investigationPhaseMaxSteps(env: PhaseStepEnv): Settings["investigationPhaseMaxSteps"] {
  const globalOverride = env.INVESTIGATION_PHASE_MAX_STEPS.trim();
  if (globalOverride) {
    if (!/^[1-9]\d*$/.test(globalOverride)) {
      throw new Error(`INVESTIGATION_PHASE_MAX_STEPS must be a positive integer, got ${globalOverride}`);
    }
    const parsed = Number(globalOverride);
    return { triage: parsed, code: parsed, evidence: parsed, synthesis: parsed };
  }

  return {
    triage: env.INVESTIGATION_TRIAGE_MAX_STEPS,
    code: env.INVESTIGATION_CODE_MAX_STEPS,
    evidence: env.INVESTIGATION_EVIDENCE_MAX_STEPS,
    synthesis: env.INVESTIGATION_SYNTHESIS_MAX_STEPS,
  };
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

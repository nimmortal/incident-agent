import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

import { loadSettings, validateSettings, type Settings } from "./config.ts";
import { requireFeatures } from "./features.ts";
import { buildHermesEnvironment, runtimeConfigPath } from "./hermes-config.ts";
import { pollPrompt } from "./prompts.ts";
import { copilotAuthFailureHint, requireCopilotTokenSupported, requireRuntimeForSkills } from "./runtime-preflight.ts";
import { optionalSourceSkills, wrapperSkills } from "./skill-sets.ts";

const POLL_JOB_NAME = "incident-agent-jira-poll";

interface CronJob {
  id: string;
  name?: string;
  prompt?: string;
  skills?: string[];
  schedule_display?: string;
  deliver?: string;
  workdir?: string;
  no_agent?: boolean;
}

interface JobsFile {
  jobs?: CronJob[];
}

async function main(): Promise<void> {
  const settings = loadSettings();
  validateSettings(settings);
  requireFeatures(settings.features, ["provider:copilot", "source:jira-jsm"]);
  requireCopilotTokenSupported();

  const skills = wrapperSkills(optionalSourceSkills(settings));
  const env = await buildHermesEnvironment(settings);
  requireRuntimeForSkills(settings, skills);
  ensurePollCronJob(settings, env, skills);

  console.log("Starting Hermes gateway for scheduled Jira polling");
  runHermes(settings, env, ["gateway", "run", "--replace", "--accept-hooks"], "start Hermes gateway");
}

function ensurePollCronJob(settings: Settings, env: NodeJS.ProcessEnv, skills: string[]): void {
  const schedule = pollSchedule(settings.jiraPollIntervalSeconds);
  const prompt = pollPrompt(settings);
  const workdir = process.cwd();
  const jobs = readCronJobs(settings).filter((job) => job.name === POLL_JOB_NAME);
  const [current, ...duplicates] = jobs;

  for (const duplicate of duplicates) {
    runHermes(settings, env, ["cron", "remove", duplicate.id], `remove duplicate cron job ${duplicate.id}`);
  }

  if (!current) {
    runHermes(
      settings,
      env,
      [
        "cron",
        "create",
        schedule,
        prompt,
        "--name",
        POLL_JOB_NAME,
        "--deliver",
        "local",
        "--workdir",
        workdir,
        ...skillFlags(skills),
      ],
      "create Jira polling cron job",
    );
    return;
  }

  if (cronJobMatches(current, schedule, prompt, workdir, skills)) {
    console.log(`Hermes cron job ${POLL_JOB_NAME} is up to date (${current.id})`);
    return;
  }

  runHermes(
    settings,
    env,
    [
      "cron",
      "edit",
      current.id,
      "--schedule",
      schedule,
      "--prompt",
      prompt,
      "--name",
      POLL_JOB_NAME,
      "--deliver",
      "local",
      "--workdir",
      workdir,
      "--agent",
      ...replaceSkillFlags(skills),
    ],
    `update Jira polling cron job ${current.id}`,
  );
}

function cronJobMatches(job: CronJob, schedule: string, prompt: string, workdir: string, skills: string[]): boolean {
  return (
    job.schedule_display === schedule &&
    job.prompt === prompt &&
    job.deliver === "local" &&
    job.workdir === workdir &&
    job.no_agent === false &&
    sameStrings(job.skills ?? [], skills)
  );
}

function readCronJobs(settings: Settings): CronJob[] {
  const jobsPath = join(dirname(runtimeConfigPath(settings)), "cron", "jobs.json");
  if (!existsSync(jobsPath)) {
    return [];
  }

  const jobsFile = JSON.parse(readFileSync(jobsPath, "utf8")) as JobsFile;
  return Array.isArray(jobsFile.jobs) ? jobsFile.jobs.filter((job) => job.id) : [];
}

function pollSchedule(intervalSeconds: number): string {
  if (intervalSeconds % 86_400 === 0) {
    return `every ${intervalSeconds / 86_400}d`;
  }
  if (intervalSeconds % 3_600 === 0) {
    return `every ${intervalSeconds / 3_600}h`;
  }
  if (intervalSeconds % 60 === 0) {
    return `every ${intervalSeconds / 60}m`;
  }

  throw new Error("Hermes cron only supports minute-or-larger intervals. Set JIRA_POLL_INTERVAL_SECONDS to a multiple of 60.");
}

function skillFlags(skills: string[]): string[] {
  return skills.flatMap((skill) => ["--skill", skill]);
}

function replaceSkillFlags(skills: string[]): string[] {
  return skills.length > 0 ? skillFlags(skills) : ["--clear-skills"];
}

function sameStrings(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function runHermes(settings: Settings, env: NodeJS.ProcessEnv, args: string[], action: string): void {
  console.error(`[incident-agent] Running Hermes to ${action}: ${displayCommand(settings.hermesBin, args)}`);

  const result = spawnSync(settings.hermesBin, args, {
    env,
    encoding: "utf8",
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      [`Failed to ${action}: Hermes exited with code ${result.status}`, copilotAuthFailureHint("")].filter(Boolean).join("\n\n"),
    );
  }
}

function displayCommand(binary: string, args: string[]): string {
  const redacted: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    redacted.push(arg);
    if ((arg === "--prompt" || isCronCreatePrompt(args, index)) && args[index + 1]) {
      redacted.push("<prompt>");
      index += 1;
    }
  }

  return [binary, ...redacted].map(shellish).join(" ");
}

function isCronCreatePrompt(args: string[], index: number): boolean {
  return args[0] === "cron" && args[1] === "create" && index === 2;
}

function shellish(value: string): string {
  return /^[A-Za-z0-9_./:=,@+-]+$/.test(value) ? value : JSON.stringify(value);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

import { loadSettings, validateSettings, type Settings } from "./config.ts";
import { requireFeatures } from "./features.ts";
import { buildHermesEnvironment, runtimeConfigPath } from "./hermes-config.ts";
import { pollPrompt } from "./prompts.ts";
import { requireRuntimeForSkills } from "./runtime-preflight.ts";
import { optionalSourceSkills } from "./skill-sets.ts";

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

function main(): void {
  const settings = loadSettings();
  validateSettings(settings);
  requireFeatures(settings.features, ["provider:copilot", "source:jira-jsm"]);

  const skills = optionalSourceSkills(settings);
  const env = buildHermesEnvironment(settings);
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
  const result = spawnSync(settings.hermesBin, args, {
    env,
    encoding: "utf8",
    stdio: action === "start Hermes gateway" ? "inherit" : "pipe",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      [
        `Failed to ${action}: ${settings.hermesBin} ${args.join(" ")}`,
        result.stderr?.trim() ? `stderr:\n${result.stderr.trim()}` : undefined,
        result.stdout?.trim() ? `stdout:\n${result.stdout.trim()}` : undefined,
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
  }

  const output = result.stdout?.trim();
  if (output) {
    console.log(output);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

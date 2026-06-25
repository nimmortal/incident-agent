import { Command } from "commander";
import { loadSettings, validateSettings, type Settings } from "./config.ts";
import { requireFeatures, type FeatureId } from "./features.ts";
import { buildHermesEnvironment } from "./hermes-config.ts";
import { HermesRunner, type HermesRunOptions } from "./hermes-runner.ts";
import { freeformPrompt, incidentPrompt, jiraTicketPrompt, logsPrompt, pollPrompt } from "./prompts.ts";
import { requireCopilotTokenSupported, requireRuntimeForSkills } from "./runtime-preflight.ts";
import { coralogixSkills, optionalSourceSkills, skillArgs } from "./skill-sets.ts";

interface Runtime {
  settings: Settings;
  hermes: HermesRunner;
}

async function main(): Promise<void> {
  let runtime: Promise<Runtime> | undefined;

  const runPrompt = async (
    prompt: string,
    requiredFeatures: FeatureId[] = [],
    skills: string[] = [],
    options: CliSessionOptions = {},
  ): Promise<void> => {
    const { hermes, settings } = await getRuntime();
    requireFeatures(settings.features, ["provider:copilot", ...requiredFeatures]);
    requireCopilotTokenSupported();
    requireRuntimeForSkills(settings, skills);
    const result = await hermes.run(prompt, skillArgs(skills), sessionOptions(options));
    if (result) {
      console.log(result);
    }
  };

  const getRuntime = (): Promise<Runtime> => {
    if (!runtime) {
      runtime = createRuntime();
    }
    return runtime;
  };

  const createRuntime = async (): Promise<Runtime> => {
    const settings = loadSettings();
    validateSettings(settings);
    return {
      settings,
      hermes: new HermesRunner(
        settings.hermesBin,
        settings.hermesArgs,
        settings.hermesTimeoutSeconds,
        await buildHermesEnvironment(settings),
      ),
    };
  };

  const program = new Command()
    .name("incident-agent")
    .description("Hermes-based incident investigation wrapper")
    .showHelpAfterError()
    .showSuggestionAfterError();

  program
    .command("ask")
    .description("Ask Hermes to investigate an arbitrary request")
    .addOption(sessionOption())
    .addOption(continueSessionOption())
    .addOption(sessionNameOption())
    .argument("<request...>", "request text")
    .action(async (request: string[], options: CliSessionOptions) => {
      const { settings } = await getRuntime();
      return runPrompt(freeformPrompt(joinWords(request), settings), [], optionalSourceSkills(settings), options);
    });

  program
    .command("ticket")
    .description("Inspect a Jira/JSM ticket through Hermes tools")
    .addOption(sessionOption())
    .addOption(continueSessionOption())
    .addOption(sessionNameOption())
    .argument("<issue-key>", "Jira/JSM issue key, for example JSM-123")
    .action(async (issueKey: string, options: CliSessionOptions) =>
      runPrompt(jiraTicketPrompt(issueKey), ["source:jira-jsm"], [], options),
    );

  program
    .command("logs")
    .description("Ask Hermes to check Coralogix logs, traces, or metrics")
    .addOption(sessionOption())
    .addOption(continueSessionOption())
    .addOption(sessionNameOption())
    .option("--window <time-window>", "time window to inspect")
    .argument("<query...>", "log, trace, or metric query")
    .action(async (query: string[], options: CliSessionOptions & { window?: string }) =>
      runPrompt(logsPrompt(joinWords(query), options.window), ["source:coralogix"], [...coralogixSkills], options),
    );

  program
    .command("investigate")
    .description("Investigate a Jira/JSM ticket end to end")
    .addOption(sessionOption())
    .addOption(continueSessionOption())
    .addOption(sessionNameOption())
    .argument("<issue-key>", "Jira/JSM issue key, for example JSM-123")
    .action(async (issueKey: string, options: CliSessionOptions) => {
      const { settings } = await getRuntime();
      return runPrompt(incidentPrompt(issueKey, settings), ["source:jira-jsm"], optionalSourceSkills(settings), options);
    });

  program
    .command("poll-once")
    .description("Run one Jira/JSM polling cycle through Hermes")
    .addOption(sessionOption())
    .addOption(continueSessionOption())
    .addOption(sessionNameOption())
    .action(async (options: CliSessionOptions) => {
      const { settings } = await getRuntime();
      return runPrompt(pollPrompt(settings), ["source:jira-jsm"], optionalSourceSkills(settings), options);
    });

  if (process.argv.length <= 2) {
    program.help();
  }
  await program.parseAsync(process.argv);
}

interface CliSessionOptions {
  session?: string;
  continueSession?: boolean;
  sessionName?: string;
}

function sessionOption(): ReturnType<Command["createOption"]> {
  return new Command().createOption("--session <session-id>", "resume an existing Hermes session by ID");
}

function continueSessionOption(): ReturnType<Command["createOption"]> {
  return new Command().createOption("--continue-session", "continue the most recent Hermes session");
}

function sessionNameOption(): ReturnType<Command["createOption"]> {
  return new Command().createOption("--session-name <session-name>", "continue a Hermes session by name");
}

function sessionOptions(options: CliSessionOptions): HermesRunOptions {
  if (options.session && (options.continueSession || options.sessionName)) {
    throw new Error("Use either --session, --continue-session, or --session-name");
  }
  if (options.continueSession && options.sessionName) {
    throw new Error("Use either --continue-session or --session-name, not both");
  }
  return {
    resumeSessionId: options.session,
    continueSession: options.sessionName ?? options.continueSession,
  };
}

function joinWords(values: string[]): string {
  const text = values.join(" ").trim();
  if (!text) {
    throw new Error("Missing required text");
  }
  return text;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

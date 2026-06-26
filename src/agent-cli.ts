import { Command } from "commander";
import { loadSettings, validateSettings, type Settings } from "./config.ts";
import { requireFeatures, type FeatureId } from "./features.ts";
import { buildHermesEnvironment } from "./hermes-config.ts";
import { HermesRunner, type HermesRunOptions } from "./hermes-runner.ts";
import { createInvestigationJournal, type InvestigationJournal, type InvestigationPhase } from "./investigation-journal.ts";
import {
  freeformPrompt,
  incidentEvidencePrompt,
  incidentSynthesisPrompt,
  incidentTriagePrompt,
  jiraTicketPrompt,
  logsPrompt,
  pollPrompt,
} from "./prompts.ts";
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
    options: CliRunOptions = {},
  ): Promise<void> => {
    const { hermes, settings } = await getRuntime();
    requireFeatures(settings.features, ["provider:copilot", ...requiredFeatures]);
    requireCopilotTokenSupported();
    requireRuntimeForSkills(settings, skills);
    await hermes.run(prompt, skillArgs(skills), sessionOptions(options));
  };

  const runInvestigationPhase = async (
    phase: InvestigationPhase,
    prompt: string,
    journal: InvestigationJournal,
    skills: string[],
    options: CliRunOptions,
  ): Promise<string> => {
    const { hermes, settings } = await getRuntime();
    requireRuntimeForSkills(settings, skills);
    journal.append({ type: "phase_started", phase, prompt });
    try {
      const output = await hermes.run(prompt, skillArgs(skills), { streamOutput: options.stream });
      journal.append({ type: "phase_completed", phase, output });
      return output || "(phase completed without captured stdout)";
    } catch (error) {
      journal.append({ type: "phase_failed", phase, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  };

  const runPhasedInvestigation = async (issueKey: string, options: CliRunOptions): Promise<void> => {
    if (options.session || options.continueSession || options.sessionName) {
      throw new Error("Phased investigate creates bounded fresh Hermes phases; --session, --continue-session, and --session-name are not supported");
    }

    const { settings } = await getRuntime();
    requireFeatures(settings.features, ["provider:copilot", "source:jira-jsm"]);
    requireCopilotTokenSupported();
    const skills = optionalSourceSkills(settings);
    requireRuntimeForSkills(settings, skills);

    const journal = createInvestigationJournal(settings, issueKey);
    console.error(`[incident-agent] Investigation journal: ${journal.path}`);

    const triageBrief = await runInvestigationPhase("triage", incidentTriagePrompt(issueKey, settings), journal, [], options);
    const evidenceBrief = await runInvestigationPhase(
      "evidence",
      incidentEvidencePrompt(issueKey, settings, triageBrief, journal.path),
      journal,
      skills,
      options,
    );
    await runInvestigationPhase(
      "synthesis",
      incidentSynthesisPrompt(issueKey, settings, triageBrief, evidenceBrief, journal.path),
      journal,
      skills,
      options,
    );
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
    .addOption(streamOption())
    .argument("<request...>", "request text")
    .action(async (request: string[], options: CliRunOptions) => {
      const { settings } = await getRuntime();
      return runPrompt(freeformPrompt(joinWords(request), settings), [], optionalSourceSkills(settings), options);
    });

  program
    .command("ticket")
    .description("Inspect a Jira/JSM ticket through Hermes tools")
    .addOption(sessionOption())
    .addOption(continueSessionOption())
    .addOption(sessionNameOption())
    .addOption(streamOption())
    .argument("<issue-key>", "Jira/JSM issue key, for example JSM-123")
    .action(async (issueKey: string, options: CliRunOptions) =>
      runPrompt(jiraTicketPrompt(issueKey), ["source:jira-jsm"], [], options),
    );

  program
    .command("logs")
    .description("Ask Hermes to check Coralogix logs, traces, or metrics")
    .addOption(sessionOption())
    .addOption(continueSessionOption())
    .addOption(sessionNameOption())
    .addOption(streamOption())
    .option("--window <time-window>", "time window to inspect")
    .argument("<query...>", "log, trace, or metric query")
    .action(async (query: string[], options: CliRunOptions & { window?: string }) =>
      runPrompt(logsPrompt(joinWords(query), options.window), ["source:coralogix"], [...coralogixSkills], options),
    );

  program
    .command("investigate")
    .description("Investigate a Jira/JSM ticket end to end")
    .addOption(streamOption())
    .argument("<issue-key>", "Jira/JSM issue key, for example JSM-123")
    .action(async (issueKey: string, options: CliRunOptions) => runPhasedInvestigation(issueKey, options));

  program
    .command("poll-once")
    .description("Run one Jira/JSM polling cycle through Hermes")
    .addOption(sessionOption())
    .addOption(continueSessionOption())
    .addOption(sessionNameOption())
    .addOption(streamOption())
    .action(async (options: CliRunOptions) => {
      const { settings } = await getRuntime();
      return runPrompt(pollPrompt(settings), ["source:jira-jsm"], optionalSourceSkills(settings), options);
    });

  if (process.argv.length <= 2) {
    program.help();
  }
  await program.parseAsync(process.argv);
}

interface CliRunOptions {
  session?: string;
  continueSession?: boolean;
  sessionName?: string;
  stream?: boolean;
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

function streamOption(): ReturnType<Command["createOption"]> {
  return new Command().createOption("--stream", "show Hermes output as it is produced instead of quiet final-response mode");
}

function sessionOptions(options: CliRunOptions): HermesRunOptions {
  if (options.session && (options.continueSession || options.sessionName)) {
    throw new Error("Use either --session, --continue-session, or --session-name");
  }
  if (options.continueSession && options.sessionName) {
    throw new Error("Use either --continue-session or --session-name, not both");
  }
  return {
    resumeSessionId: options.session,
    continueSession: options.sessionName ?? options.continueSession,
    streamOutput: options.stream,
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

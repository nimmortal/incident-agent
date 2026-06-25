import { Command } from "commander";
import { loadSettings, validateSettings, type Settings } from "./config.ts";
import { requireFeatures, type FeatureId } from "./features.ts";
import { buildHermesEnvironment } from "./hermes-config.ts";
import { HermesRunner } from "./hermes-runner.ts";
import { freeformPrompt, incidentPrompt, jiraTicketPrompt, logsPrompt, pollPrompt } from "./prompts.ts";
import { requireCopilotTokenSupported, requireRuntimeForSkills } from "./runtime-preflight.ts";
import { coralogixSkills, optionalSourceSkills, skillArgs } from "./skill-sets.ts";

interface Runtime {
  settings: Settings;
  hermes: HermesRunner;
}

async function main(): Promise<void> {
  let runtime: Promise<Runtime> | undefined;

  const runPrompt = async (prompt: string, requiredFeatures: FeatureId[] = [], skills: string[] = []): Promise<void> => {
    const { hermes, settings } = await getRuntime();
    requireFeatures(settings.features, ["provider:copilot", ...requiredFeatures]);
    requireCopilotTokenSupported();
    requireRuntimeForSkills(settings, skills);
    const result = await hermes.run(prompt, skillArgs(skills));
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
    .argument("<request...>", "request text")
    .action(async (request: string[]) => {
      const { settings } = await getRuntime();
      return runPrompt(freeformPrompt(joinWords(request), settings), [], optionalSourceSkills(settings));
    });

  program
    .command("ticket")
    .description("Inspect a Jira/JSM ticket through Hermes tools")
    .argument("<issue-key>", "Jira/JSM issue key, for example JSM-123")
    .action(async (issueKey: string) => runPrompt(jiraTicketPrompt(issueKey), ["source:jira-jsm"]));

  program
    .command("logs")
    .description("Ask Hermes to check Coralogix logs, traces, or metrics")
    .option("--window <time-window>", "time window to inspect")
    .argument("<query...>", "log, trace, or metric query")
    .action(async (query: string[], options: { window?: string }) =>
      runPrompt(logsPrompt(joinWords(query), options.window), ["source:coralogix"], [...coralogixSkills]),
    );

  program
    .command("investigate")
    .description("Investigate a Jira/JSM ticket end to end")
    .argument("<issue-key>", "Jira/JSM issue key, for example JSM-123")
    .action(async (issueKey: string) => {
      const { settings } = await getRuntime();
      return runPrompt(incidentPrompt(issueKey, settings), ["source:jira-jsm"], optionalSourceSkills(settings));
    });

  program
    .command("poll-once")
    .description("Run one Jira/JSM polling cycle through Hermes")
    .action(async () => {
      const { settings } = await getRuntime();
      return runPrompt(pollPrompt(settings), ["source:jira-jsm"], optionalSourceSkills(settings));
    });

  if (process.argv.length <= 2) {
    program.help();
  }
  await program.parseAsync(process.argv);
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

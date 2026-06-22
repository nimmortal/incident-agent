import { Command } from "commander";
import { loadSettings, validateSettings, type Settings } from "./config.ts";
import { HermesRunner } from "./hermes-runner.ts";
import { freeformPrompt, incidentPrompt, jiraTicketPrompt, logsPrompt, pollPrompt } from "./prompts.ts";

interface Runtime {
  settings: Settings;
  hermes: HermesRunner;
}

async function main(): Promise<void> {
  let runtime: Runtime | undefined;

  const runPrompt = async (prompt: string): Promise<void> => {
    const result = await getRuntime().hermes.run(prompt);
    console.log(result);
  };

  const getRuntime = (): Runtime => {
    if (!runtime) {
      const settings = loadSettings();
      validateSettings(settings);
      runtime = {
        settings,
        hermes: new HermesRunner(settings.hermesBin, settings.hermesArgs, settings.hermesTimeoutSeconds),
      };
    }
    return runtime;
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
    .action(async (request: string[]) => runPrompt(freeformPrompt(joinWords(request))));

  program
    .command("ticket")
    .description("Inspect a Jira/JSM ticket through Hermes tools")
    .argument("<issue-key>", "Jira/JSM issue key, for example JSM-123")
    .action(async (issueKey: string) => runPrompt(jiraTicketPrompt(issueKey)));

  program
    .command("logs")
    .description("Ask Hermes to check Coralogix logs, traces, or metrics")
    .option("--window <time-window>", "time window to inspect")
    .argument("<query...>", "log, trace, or metric query")
    .action(async (query: string[], options: { window?: string }) =>
      runPrompt(logsPrompt(joinWords(query), options.window)),
    );

  program
    .command("investigate")
    .description("Investigate a Jira/JSM ticket end to end")
    .argument("<issue-key>", "Jira/JSM issue key, for example JSM-123")
    .action(async (issueKey: string) => runPrompt(incidentPrompt(issueKey)));

  program
    .command("poll-once")
    .description("Run one Jira/JSM polling cycle through Hermes")
    .action(async () => {
      const { settings } = getRuntime();
      return runPrompt(pollPrompt(settings));
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

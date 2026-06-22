import { Command } from "commander";
import { loadSettings, validateSettings, type Settings } from "./config.ts";
import { requireFeatures, type FeatureId } from "./features.ts";
import { buildHermesEnvironment } from "./hermes-config.ts";
import { HermesRunner } from "./hermes-runner.ts";
import { freeformPrompt, incidentPrompt, jiraTicketPrompt, logsPrompt, pollPrompt } from "./prompts.ts";

interface Runtime {
  settings: Settings;
  hermes: HermesRunner;
}

async function main(): Promise<void> {
  let runtime: Runtime | undefined;

  const runPrompt = async (prompt: string, requiredFeatures: FeatureId[] = [], skills: string[] = []): Promise<void> => {
    const { hermes, settings } = getRuntime();
    requireFeatures(settings.features, ["provider:copilot", ...requiredFeatures]);
    const result = await hermes.run(prompt, skillArgs(skills));
    console.log(result);
  };

  const getRuntime = (): Runtime => {
    if (!runtime) {
      const settings = loadSettings();
      validateSettings(settings);
      runtime = {
        settings,
        hermes: new HermesRunner(
          settings.hermesBin,
          settings.hermesArgs,
          settings.hermesTimeoutSeconds,
          buildHermesEnvironment(settings),
        ),
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
    .action(async (request: string[]) =>
      runPrompt(freeformPrompt(joinWords(request), getRuntime().settings), [], optionalGithubSkills(getRuntime().settings)),
    );

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
      runPrompt(logsPrompt(joinWords(query), options.window), ["source:coralogix"], ["cx-telemetry-querying"]),
    );

  program
    .command("investigate")
    .description("Investigate a Jira/JSM ticket end to end")
    .argument("<issue-key>", "Jira/JSM issue key, for example JSM-123")
    .action(async (issueKey: string) =>
      runPrompt(incidentPrompt(issueKey, getRuntime().settings), ["source:jira-jsm"], optionalInvestigationSkills(getRuntime().settings)),
    );

  program
    .command("poll-once")
    .description("Run one Jira/JSM polling cycle through Hermes")
    .action(async () => {
      const { settings } = getRuntime();
      return runPrompt(pollPrompt(settings), ["source:jira-jsm"], optionalInvestigationSkills(settings));
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

function optionalCoralogixSkills(settings: Settings): string[] {
  return settings.features.sources.coralogix.enabled ? ["cx-telemetry-querying", "cx-incident-management"] : [];
}

function optionalGithubSkills(settings: Settings): string[] {
  return settings.features.sources.github.enabled
    ? ["github-auth", "github-repo-management", "github-pr-workflow", "github-issues"]
    : [];
}

function optionalInvestigationSkills(settings: Settings): string[] {
  return [...optionalGithubSkills(settings), ...optionalCoralogixSkills(settings)];
}

function skillArgs(skills: string[]): string[] {
  return skills.length > 0 ? ["--skills", skills.join(",")] : [];
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

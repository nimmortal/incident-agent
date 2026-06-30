import { Command } from "commander";
import { loadSettings, validateSettings, type Settings } from "./config.ts";
import { requireFeatures, type FeatureId } from "./features.ts";
import { buildHermesEnvironment } from "./hermes-config.ts";
import { HermesRunError, HermesRunner, type HermesRunOptions } from "./hermes-runner.ts";
import { createInvestigationJournal, type InvestigationJournal, type InvestigationPhase } from "./investigation-journal.ts";
import {
  codeUnavailableBrief,
  freeformPrompt,
  goalPrompt,
  incidentCodePrompt,
  incidentEvidenceWithCodePrompt,
  incidentPhaseRecoveryPrompt,
  incidentSynthesisWithCodePrompt,
  incidentTriagePrompt,
  jiraTicketPrompt,
  logsPrompt,
  pollPrompt,
} from "./prompts.ts";
import { requireCopilotTokenSupported, requireRuntimeForSkills } from "./runtime-preflight.ts";
import { coralogixSkills, optionalGithubSkills, optionalSourceSkills, skillArgs, wrapperSkills } from "./skill-sets.ts";

interface Runtime {
  settings: Settings;
  hermes: HermesRunner;
}

const maxContinuationOutputChars = 12_000;
const maxContinuationJournalChars = 12_000;

async function main(): Promise<void> {
  let runtime: Promise<Runtime> | undefined;

  const runPrompt = async (
    prompt: string,
    requiredFeatures: FeatureId[] = [],
    skills: string[] = [],
    options: CliRunOptions = {},
  ): Promise<void> => {
    const { hermes, settings } = await getRuntime();
    const runSkills = wrapperSkills(skills);
    requireFeatures(settings.features, ["provider:copilot", ...requiredFeatures]);
    requireCopilotTokenSupported();
    requireRuntimeForSkills(settings, runSkills);
    await hermes.run(prompt, skillArgs(runSkills), sessionOptions(options));
  };

  const runInvestigationPhase = async (
    phase: InvestigationPhase,
    prompt: string,
    journal: InvestigationJournal,
    skills: string[],
    options: InvestigationRunOptions,
  ): Promise<string> => {
    const { hermes, settings } = await getRuntime();
    const runSkills = wrapperSkills(skills);
    requireRuntimeForSkills(settings, runSkills);

    let nextPrompt = prompt;
    let runOptions: HermesRunOptions = { streamOutput: options.stream };
    const maxSteps = options.phaseMaxSteps ?? settings.investigationPhaseMaxSteps;
    let lastOutput = "";

    for (let step = 1; step <= maxSteps; step += 1) {
      for (let attempt = 0; attempt <= settings.hermesRecoveryAttempts; attempt += 1) {
        const recovery = attempt > 0;
        journal.append({ type: "phase_started", phase, prompt: nextPrompt, step, maxSteps, attempt, recovery });
        console.error(`[incident-agent] ${phase} phase step ${step}/${maxSteps}${recovery ? ` recovery ${attempt}` : ""}`);

        try {
          const output = await hermes.run(nextPrompt, skillArgs(runSkills), runOptions);
          lastOutput = output;
          const status = parseStepStatus(output, "phase");
          if (!status) {
            throw new StepStatusError("Hermes phase output did not include a valid <incident-agent-phase-status> block", output);
          }

          journal.append({ type: "phase_step_completed", phase, output, status, step, attempt, recovery });

          if (status.status === "done") {
            journal.append({ type: "phase_completed", phase, output, step, attempt, recovery });
            return output || "(phase completed without captured stdout)";
          }
          if (status.status === "blocked") {
            const blocked = phaseBlockedResult(phase, status, output);
            journal.append({ type: "phase_blocked", phase, output: blocked, status, step, attempt, recovery });
            console.log(blocked);
            return blocked;
          }

          nextPrompt = phaseContinuationPrompt(
            phase,
            journal.issueKey,
            status,
            compactPromptContext(output, maxContinuationOutputChars),
            journal.readCompact(maxContinuationJournalChars),
          );
          runOptions = { continueSession: true, streamOutput: options.stream };
          break;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const partialOutput = error instanceof HermesRunError ? recoveryOutput(error) : error instanceof StepStatusError ? error.output : "";
          journal.append({ type: "phase_failed", phase, error: message, step, attempt, recovery, partialOutput });

          if (attempt < settings.hermesRecoveryAttempts) {
            console.error(`[incident-agent] Hermes ${phase} phase failed; starting recovery attempt ${attempt + 1}`);
            nextPrompt = incidentPhaseRecoveryPrompt(
              journal.issueKey,
              settings,
              phase,
              compactPromptContext(prompt, maxContinuationOutputChars),
              journal.readCompact(maxContinuationJournalChars),
              message,
              compactPromptContext(partialOutput, maxContinuationOutputChars),
            );
            runOptions = { continueSession: true, streamOutput: options.stream };
            continue;
          }

          const fallback = phaseFallbackResult(phase, message, partialOutput);
          journal.append({ type: "phase_fallback", phase, output: fallback, step });
          console.log(fallback);
          return fallback;
        }
      }
    }

    const fallback = phaseFallbackResult(phase, `Phase reached max steps (${maxSteps}) before reporting done or blocked`, lastOutput);
    journal.append({ type: "phase_fallback", phase, output: fallback, maxSteps });
    console.log(fallback);
    return fallback;
  };

  const runPhasedInvestigation = async (issueKey: string, options: InvestigationRunOptions): Promise<void> => {
    if (options.session || options.continueSession || options.sessionName) {
      throw new Error("Phased investigate creates bounded fresh Hermes phases; --session, --continue-session, and --session-name are not supported");
    }

    const { settings } = await getRuntime();
    requireFeatures(settings.features, ["provider:copilot", "source:jira-jsm"]);
    requireCopilotTokenSupported();
    const skills = optionalSourceSkills(settings);
    requireRuntimeForSkills(settings, wrapperSkills(skills));

    const journal = createInvestigationJournal(settings, issueKey);
    console.error(`[incident-agent] Investigation journal: ${journal.path}`);

    const triageBrief = await runInvestigationPhase("triage", incidentTriagePrompt(issueKey, settings), journal, [], options);
    const codePhaseOutput = settings.features.sources.github.enabled
      ? await runInvestigationPhase("code", incidentCodePrompt(issueKey, settings, triageBrief, journal.path), journal, optionalGithubSkills(settings), options)
      : codePhaseUnavailable(settings);
    const codeBrief = normalizeCodeBrief(codePhaseOutput);
    const evidenceBrief = await runInvestigationPhase(
      "evidence",
      incidentEvidenceWithCodePrompt(issueKey, settings, triageBrief, codeBrief, journal.path),
      journal,
      skills,
      options,
    );
    await runInvestigationPhase(
      "synthesis",
      incidentSynthesisWithCodePrompt(issueKey, settings, triageBrief, codeBrief, evidenceBrief, journal.path),
      journal,
      skills,
      options,
    );
  };

  const runGoal = async (objective: string, options: GoalRunOptions): Promise<void> => {
    const { hermes, settings } = await getRuntime();
    requireFeatures(settings.features, ["provider:copilot"]);
    requireCopilotTokenSupported();

    const skills = wrapperSkills(optionalSourceSkills(settings));
    requireRuntimeForSkills(settings, skills);

    let previousStatus = "(none; this is the first goal step)";
    let runOptions = sessionOptions(options);

    for (let step = 1; step <= options.maxSteps; step += 1) {
      console.error(`[incident-agent] Goal step ${step}/${options.maxSteps}`);
      const output = await hermes.run(goalPrompt(objective, settings, step, options.maxSteps, previousStatus), skillArgs(skills), runOptions);
      const status = parseGoalStatus(output);

      if (!status) {
        throw new Error("Hermes goal step did not include a valid <incident-agent-goal-status> block");
      }

      previousStatus = JSON.stringify(status);
      if (status.status === "done") {
        console.error("[incident-agent] Goal completed");
        return;
      }
      if (status.status === "blocked") {
        console.error("[incident-agent] Goal blocked");
        return;
      }

      runOptions = {
        continueSession: options.sessionName ?? true,
        streamOutput: options.stream,
      };
    }

    console.error(`[incident-agent] Goal stopped after ${options.maxSteps} steps; increase --max-steps to continue`);
  };

  const runUi = async (options: UiRunOptions): Promise<void> => {
    const { hermes, settings } = await getRuntime();
    requireFeatures(settings.features, ["provider:copilot"]);
    requireCopilotTokenSupported();

    const skills = wrapperSkills(optionalSourceSkills(settings));
    requireRuntimeForSkills(settings, skills);
    await hermes.runInteractive(uiArgs(options, skills));
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
        settings.hermesIdleTimeoutSeconds,
        settings.hermesTerminateGraceSeconds,
        settings.hermesHeartbeatSeconds,
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
    .action(async (issueKey: string, options: CliRunOptions) => {
      const { settings } = await getRuntime();
      return runPrompt(jiraTicketPrompt(issueKey, settings), ["source:jira-jsm"], [], options);
    });

  program
    .command("logs")
    .description("Ask Hermes to check Coralogix logs, traces, or metrics")
    .addOption(sessionOption())
    .addOption(continueSessionOption())
    .addOption(sessionNameOption())
    .addOption(streamOption())
    .option("--window <time-window>", "time window to inspect")
    .argument("<query...>", "log, trace, or metric query")
    .action(async (query: string[], options: CliRunOptions & { window?: string }) => {
      const { settings } = await getRuntime();
      return runPrompt(logsPrompt(joinWords(query), settings, options.window), ["source:coralogix"], [...coralogixSkills], options);
    });

  program
    .command("goal")
    .description("Run a bounded multi-step Hermes investigation loop")
    .addOption(sessionOption())
    .addOption(continueSessionOption())
    .addOption(sessionNameOption())
    .addOption(streamOption())
    .option("--max-steps <count>", "maximum Hermes turns before stopping", parsePositiveInt, 6)
    .argument("<objective...>", "goal objective")
    .action(async (objective: string[], options: GoalRunOptions) => runGoal(joinWords(objective), options));

  program
    .command("investigate")
    .description("Investigate a Jira/JSM ticket end to end")
    .addOption(streamOption())
    .option("--phase-max-steps <count>", "maximum Hermes turns per investigation phase", parsePositiveInt)
    .argument("<issue-key>", "Jira/JSM issue key, for example JSM-123")
    .action(async (issueKey: string, options: InvestigationRunOptions) => runPhasedInvestigation(issueKey, options));

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

  program
    .command("ui")
    .description("Start an interactive Hermes UI using the wrapper runtime")
    .addOption(sessionOption())
    .addOption(continueSessionOption())
    .addOption(sessionNameOption())
    .option("--cli", "force Hermes' classic terminal chat instead of the TUI")
    .option("--dashboard", "start Hermes' browser dashboard instead of terminal chat")
    .option("--host <host>", "dashboard host")
    .option("--port <port>", "dashboard port")
    .option("--no-open", "do not ask Hermes to open a browser for the dashboard")
    .action(async (options: UiRunOptions) => runUi(options));

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

interface GoalRunOptions extends CliRunOptions {
  maxSteps: number;
}

interface InvestigationRunOptions extends CliRunOptions {
  phaseMaxSteps?: number;
}

interface UiRunOptions extends CliRunOptions {
  cli?: boolean;
  dashboard?: boolean;
  host?: string;
  port?: string;
  noOpen?: boolean;
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

function parsePositiveInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Expected a positive integer, got ${value}`);
  }
  return parsed;
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

function uiArgs(options: UiRunOptions, skills: string[]): string[] {
  if (options.dashboard) {
    if (options.session || options.continueSession || options.sessionName || options.cli) {
      throw new Error("--dashboard cannot be combined with chat session options or --cli");
    }

    return [
      "dashboard",
      ...optionalValueFlag("--host", options.host),
      ...optionalValueFlag("--port", options.port),
      ...(options.noOpen ? ["--no-open"] : []),
    ];
  }

  if (options.host || options.port || options.noOpen) {
    throw new Error("--host, --port, and --no-open are only supported with --dashboard");
  }

  return ["chat", options.cli ? "--cli" : "--tui", ...skillArgs(skills), ...chatSessionArgs(options)];
}

function chatSessionArgs(options: CliRunOptions): string[] {
  const parsed = sessionOptions(options);
  if (parsed.resumeSessionId) {
    return ["--resume", parsed.resumeSessionId];
  }
  if (typeof parsed.continueSession === "string") {
    return ["--continue", parsed.continueSession];
  }
  if (parsed.continueSession) {
    return ["--continue"];
  }
  return [];
}

function optionalValueFlag(flag: string, value: string | undefined): string[] {
  const trimmed = value?.trim();
  return trimmed ? [flag, trimmed] : [];
}

function joinWords(values: string[]): string {
  const text = values.join(" ").trim();
  if (!text) {
    throw new Error("Missing required text");
  }
  return text;
}

type StepStatusValue = "continue" | "done" | "blocked";

interface StepStatus {
  status: StepStatusValue;
  summary: string;
  nextPrompt?: string;
  blockedBy?: string;
}

function parseGoalStatus(output: string): StepStatus | undefined {
  return parseStepStatus(output, "goal");
}

function parseStepStatus(output: string, scope: "goal" | "phase"): StepStatus | undefined {
  const tag = scope === "goal" ? "incident-agent-goal-status" : "incident-agent-phase-status";
  const pattern = new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`, "g");
  const matches = [...output.matchAll(pattern)];
  const payload = matches.at(-1)?.[1]?.trim();
  if (!payload) {
    return undefined;
  }

  let parsed: Partial<StepStatus>;
  try {
    parsed = JSON.parse(stripJsonFence(payload)) as Partial<StepStatus>;
  } catch {
    return undefined;
  }
  if (!isStepStatusValue(parsed.status) || typeof parsed.summary !== "string" || !parsed.summary.trim()) {
    return undefined;
  }
  if (parsed.status === "continue" && (typeof parsed.nextPrompt !== "string" || !parsed.nextPrompt.trim())) {
    return undefined;
  }
  if (parsed.status === "blocked" && (typeof parsed.blockedBy !== "string" || !parsed.blockedBy.trim())) {
    return undefined;
  }

  return {
    status: parsed.status,
    summary: parsed.summary,
    nextPrompt: typeof parsed.nextPrompt === "string" ? parsed.nextPrompt : undefined,
    blockedBy: typeof parsed.blockedBy === "string" ? parsed.blockedBy : undefined,
  };
}

function stripJsonFence(value: string): string {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function isStepStatusValue(value: unknown): value is StepStatusValue {
  return value === "continue" || value === "done" || value === "blocked";
}

class StepStatusError extends Error {
  constructor(
    message: string,
    readonly output: string,
  ) {
    super(message);
    this.name = "StepStatusError";
  }
}

function phaseContinuationPrompt(
  phase: InvestigationPhase,
  issueKey: string,
  status: StepStatus,
  previousOutput: string,
  journalSnapshot: string,
): string {
  return [
    `Continue the ${phase} phase for incident ticket ${issueKey}.`,
    "",
    "The previous phase step requested another bounded investigation step.",
    "",
    "Previous status:",
    JSON.stringify(status),
    "",
    "Previous phase output:",
    previousOutput,
    "",
    "Recent journal snapshot:",
    journalSnapshot,
    "",
    "Run the nextPrompt from the previous status unless new evidence makes a different bounded check clearly more useful.",
    "Keep this step focused and read-only. Do not write Jira comments or labels.",
    phaseStatusInstructions(phase),
  ].join("\n");
}

function phaseStatusInstructions(phase: InvestigationPhase): string {
  return [
    "",
    "End your response with exactly one status block in this format:",
    "",
    "<incident-agent-phase-status>",
    `{"status":"done","summary":"What changed in this ${phase} step."}`,
    "</incident-agent-phase-status>",
    "",
    "Status rules:",
    "- Use \"done\" only when this phase has produced its required brief and no material read-only checks remain for this phase.",
    "- Use \"blocked\" only when missing credentials, missing identifiers, unavailable tools, unclear time windows, safety or mutation risk, source outage, or excessive scope prevents meaningful progress.",
    "- Use \"continue\" when another bounded read-only check is available and likely to improve this phase output.",
    "- For \"blocked\", include \"blockedBy\" with the concrete blocker and exact next input or source needed.",
    "- For \"continue\", include \"nextPrompt\" with one specific next investigation action for this same phase.",
  ].join("\n");
}

function compactPromptContext(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  const headChars = Math.floor(maxChars / 2);
  const tailChars = maxChars - headChars;
  return [
    value.slice(0, headChars),
    `[truncated ${value.length - maxChars} chars; keeping head and tail]`,
    value.slice(-tailChars),
  ].join("\n");
}

function codePhaseUnavailable(settings: Settings): string {
  const missing = settings.features.sources.github.missingEnv.join(", ") || "GitHub source disabled";
  return codeUnavailableBrief(`GitHub code source is not configured (${missing}).`, "");
}

function normalizeCodeBrief(output: string): string {
  if (output.startsWith("Blocked phase: code")) {
    return codeUnavailableBrief("Code grounding phase was blocked.", output);
  }
  if (output.startsWith("Recovered phase: code")) {
    return codeUnavailableBrief("Code grounding phase fell back before producing a structured code brief.", output);
  }
  return output;
}

function phaseBlockedResult(phase: InvestigationPhase, status: StepStatus, output: string): string {
  return [
    `Blocked phase: ${phase}`,
    "",
    "Summary:",
    status.summary,
    "",
    "Blocked by:",
    status.blockedBy ?? "(unspecified blocker)",
    "",
    "Usable phase output:",
    output || "(none)",
    "",
    "Confidence:",
    "low",
  ].join("\n");
}

function phaseFallbackResult(phase: InvestigationPhase, error: string, partialOutput: string): string {
  return [
    `Recovered phase: ${phase}`,
    "",
    "Usable findings:",
    partialOutput || "(none captured before Hermes stopped)",
    "",
    "Evidence or partial evidence:",
    partialOutput ? "See usable findings above." : "No phase evidence was captured by the wrapper.",
    "",
    "Confidence:",
    "low",
    "",
    "What remains unknown:",
    error,
    "",
    "Exact next step:",
    "Continue with available context and produce an incomplete-investigation note if confidence remains low.",
  ].join("\n");
}

function recoveryOutput(error: HermesRunError): string {
  const output = error.output.trim();
  const tail = error.outputTail.trim();
  if (!tail || tail === output) {
    return output;
  }
  return [output, "Output tail:", tail].filter(Boolean).join("\n\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

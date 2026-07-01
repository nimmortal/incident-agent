import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { Settings } from "./config.ts";

type PromptVariables = Record<string, string | number>;

export function freeformPrompt(request: string, settings: Settings): string {
  return renderPrompt(settings, "freeform", {
    featureContext: featureContext(settings),
    request,
  });
}

export function jiraTicketPrompt(issueKey: string, settings: Settings): string {
  return renderPrompt(settings, "jira-ticket", {
    issueKey,
  });
}

export function logsPrompt(query: string, settings: Settings, window?: string): string {
  return renderPrompt(settings, "logs", {
    windowInstruction: window
      ? `Time window: ${window}`
      : "If no time window is obvious, ask for one or state the assumed window clearly.",
    query,
  });
}

export function goalPrompt(objective: string, settings: Settings, step: number, maxSteps: number, previousStatus: string): string {
  return renderPrompt(settings, "goal", {
    featureContext: featureContext(settings),
    objective,
    step,
    maxSteps,
    previousStatus,
  });
}

export function incidentPrompt(issueKey: string, settings: Settings): string {
  return renderPrompt(settings, "incident", {
    featureContext: featureContext(settings),
    issueKey,
  });
}

export function incidentTriagePrompt(issueKey: string, settings: Settings): string {
  return renderPrompt(settings, "incident-triage", {
    featureContext: featureContext(settings),
    issueKey,
  });
}

export function incidentCodePrompt(issueKey: string, settings: Settings, triageBrief: string, journalPath: string): string {
  return renderPrompt(settings, "incident-code", {
    featureContext: featureContext(settings),
    issueKey,
    triageBrief,
    journalPath,
  });
}

export function codeUnavailableBrief(reason: string, details: string): string {
  return [
    "Code phase: unavailable",
    "",
    "code path map",
    "- repo/service: missing",
    "- environment, deploy/ref, version range, tenant/customer/request/trace IDs when available: missing",
    "- file path and function/class/module/route/job name: missing",
    "- logic summary in one sentence: GitHub code grounding could not complete.",
    "- expected log, trace, metric, persisted-state, or external-service evidence: use Jira/JSM identifiers only until code grounding is restored.",
    "- confidence: low",
    "",
    "source join keys",
    "- service: missing",
    "- environment: missing",
    "- time window: use triage timeline only",
    "- ticket/tenant/customer/request/trace IDs: use triage identifiers only",
    "- repo: missing",
    "- deploy/ref: missing",
    "- join confidence: low",
    "",
    "runtime signals to verify",
    "- missing because code grounding is unavailable",
    "",
    "ticket-to-code alignment",
    "- missing: Jira/JSM ticket could not be mapped to GitHub code.",
    "",
    "recent change or deployment context",
    "- missing",
    "",
    "alternate paths or ruled-out paths",
    "- not checked",
    "",
    "code confidence",
    "- low",
    "",
    "next evidence queries",
    `- restore code grounding or provide repository/service/deploy context; reason: ${reason}`,
    "",
    "raw blocker or fallback details",
    details || "(none)",
  ].join("\n");
}

export function incidentEvidencePrompt(issueKey: string, settings: Settings, triageBrief: string, journalPath: string): string {
  return renderPrompt(settings, "incident-evidence", {
    featureContext: featureContext(settings),
    issueKey,
    triageBrief,
    codeBrief: "(code phase not available or not run)",
    journalPath,
  });
}

export function incidentEvidenceWithCodePrompt(
  issueKey: string,
  settings: Settings,
  triageBrief: string,
  codeBrief: string,
  journalPath: string,
): string {
  return renderPrompt(settings, "incident-evidence", {
    featureContext: featureContext(settings),
    issueKey,
    triageBrief,
    codeBrief,
    journalPath,
  });
}

export function incidentSynthesisPrompt(
  issueKey: string,
  settings: Settings,
  triageBrief: string,
  evidenceBrief: string,
  journalPath: string,
): string {
  return renderPrompt(settings, "incident-synthesis", {
    featureContext: featureContext(settings),
    issueKey,
    triageBrief,
    codeBrief: "(code phase not available or not run)",
    evidenceBrief,
    journalPath,
  });
}

export function incidentSynthesisWithCodePrompt(
  issueKey: string,
  settings: Settings,
  triageBrief: string,
  codeBrief: string,
  evidenceBrief: string,
  journalPath: string,
): string {
  return renderPrompt(settings, "incident-synthesis", {
    featureContext: featureContext(settings),
    issueKey,
    triageBrief,
    codeBrief,
    evidenceBrief,
    journalPath,
  });
}

export function incidentPhaseRecoveryPrompt(
  issueKey: string,
  settings: Settings,
  phase: string,
  failedPrompt: string,
  journalSnapshot: string,
  error: string,
  partialOutput: string,
): string {
  return renderPrompt(settings, "incident-phase-recovery", {
    featureContext: featureContext(settings),
    issueKey,
    phase,
    failedPrompt,
    journalSnapshot,
    error,
    partialOutput: partialOutput || "(none)",
  });
}

export function pollPrompt(settings: Settings): string {
  return renderPrompt(settings, "poll", {
    featureContext: featureContext(settings),
    jiraPollBatchSize: settings.jiraPollBatchSize,
    jiraJql: settings.jiraJql,
    investigatedLabel: settings.investigatedLabel,
    investigatingLabel: settings.investigatingLabel,
    failedLabel: settings.failedLabel,
  });
}

function renderPrompt(settings: Settings, name: string, variables: PromptVariables): string {
  const template = readPromptTemplate(settings, name);
  return template
    .replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_match, key: string) => {
      if (!(key in variables)) {
        throw new Error(`Prompt template ${name}.md references unknown variable ${key}`);
      }
      return String(variables[key]);
    })
    .trimEnd();
}

function readPromptTemplate(settings: Settings, name: string): string {
  return readFileSync(join(resolve(settings.promptTemplatesDir), `${name}.md`), "utf8");
}

function featureContext(settings: Settings): string {
  const features = [
    settings.features.sources.jiraJsm,
    settings.features.sources.github,
    settings.features.sources.context7,
    settings.features.sources.coralogix,
    settings.features.sources.postgres,
  ];
  return [
    "Configured sources:",
    ...features.map((feature) => {
      const state = feature.enabled ? "enabled" : `disabled, missing ${feature.missingEnv.join(", ")}`;
      return `- ${feature.name}: ${state}`;
    }),
  ].join("\n");
}

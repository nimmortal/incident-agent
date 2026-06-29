import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { Settings } from "./config.ts";
import { runtimeSkillsPath } from "./hermes-config.ts";
import { incidentAgentSkill } from "./skill-sets.ts";

type PromptVariables = Record<string, string | number>;

export function freeformPrompt(request: string, settings: Settings): string {
  return renderPrompt(settings, "freeform", {
    baseInstructions: baseInstructions(settings),
    featureContext: featureContext(settings),
    request,
  });
}

export function jiraTicketPrompt(issueKey: string, settings: Settings): string {
  return renderPrompt(settings, "jira-ticket", {
    baseInstructions: baseInstructions(settings),
    issueKey,
  });
}

export function logsPrompt(query: string, settings: Settings, window?: string): string {
  return renderPrompt(settings, "logs", {
    baseInstructions: baseInstructions(settings),
    windowInstruction: window
      ? `Time window: ${window}`
      : "If no time window is obvious, ask for one or state the assumed window clearly.",
    query,
  });
}

export function incidentPrompt(issueKey: string, settings: Settings): string {
  return renderPrompt(settings, "incident", {
    baseInstructions: baseInstructions(settings),
    featureContext: featureContext(settings),
    issueKey,
  });
}

export function incidentTriagePrompt(issueKey: string, settings: Settings): string {
  return renderPrompt(settings, "incident-triage", {
    baseInstructions: baseInstructions(settings),
    featureContext: featureContext(settings),
    issueKey,
  });
}

export function incidentEvidencePrompt(issueKey: string, settings: Settings, triageBrief: string, journalPath: string): string {
  return renderPrompt(settings, "incident-evidence", {
    baseInstructions: baseInstructions(settings),
    featureContext: featureContext(settings),
    issueKey,
    triageBrief,
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
    baseInstructions: baseInstructions(settings),
    featureContext: featureContext(settings),
    issueKey,
    triageBrief,
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
    baseInstructions: baseInstructions(settings),
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
    baseInstructions: baseInstructions(settings),
    featureContext: featureContext(settings),
    jiraPollBatchSize: settings.jiraPollBatchSize,
    jiraJql: settings.jiraJql,
    investigatedLabel: settings.investigatedLabel,
    investigatingLabel: settings.investigatingLabel,
    failedLabel: settings.failedLabel,
  });
}

function baseInstructions(settings: Settings): string {
  return stripSkillFrontmatter(readFileSync(incidentAgentSkillPath(settings), "utf8"));
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

function stripSkillFrontmatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
}

function incidentAgentSkillPath(settings: Settings): string {
  const candidates = [
    join(resolve(settings.hermesLocalSkillsPath), incidentAgentSkill, "SKILL.md"),
    join(runtimeSkillsPath(settings), incidentAgentSkill, "SKILL.md"),
  ];
  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) {
    throw new Error(`Missing Hermes skill ${incidentAgentSkill}. Expected one of: ${candidates.join(", ")}`);
  }
  return path;
}

function featureContext(settings: Settings): string {
  const features = [
    settings.features.sources.jiraJsm,
    settings.features.sources.github,
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

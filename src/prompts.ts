import type { Settings } from "./config.ts";

export function freeformPrompt(request: string, settings: Settings): string {
  return [
    baseInstructions(),
    "",
    featureContext(settings),
    "",
    "User request:",
    request,
  ].join("\n");
}

export function jiraTicketPrompt(issueKey: string): string {
  return [
    baseInstructions(),
    "",
    `Use Jira MCP to inspect Jira/JSM ticket ${issueKey}.`,
    "Summarize the ticket, current status, customer impact, relevant comments, linked issues, and what information is missing for investigation.",
  ].join("\n");
}

export function logsPrompt(query: string, window?: string): string {
  return [
    baseInstructions(),
    "",
    "Use the cx CLI and the loaded Coralogix skill to investigate logs, metrics, traces, alerts, and incidents.",
    window ? `Time window: ${window}` : "If no time window is obvious, ask for one or state the assumed window clearly.",
    "",
    "Investigation request:",
    query,
  ].join("\n");
}

export function incidentPrompt(issueKey: string, settings: Settings): string {
  return [
    baseInstructions(),
    "",
    featureContext(settings),
    "",
    `Investigate incident ticket ${issueKey}.`,
    "",
    "Required workflow:",
    "1. Use Jira MCP to read the ticket, comments, links, status, labels, and customer impact.",
    "2. If Coralogix is configured, use cx CLI with the loaded Coralogix skills to inspect relevant logs, metrics, traces, alerts, incidents, and error signatures.",
    "3. If GitHub is configured, inspect recent deployments, commits, PRs, and workflow runs if they may be relevant.",
    "4. Post no public customer response unless explicitly asked. If writing to Jira, use an internal/private note.",
    "5. Produce an evidence-backed RCA draft with confidence and follow-up actions.",
  ].join("\n");
}

export function pollPrompt(settings: Settings): string {
  return [
    baseInstructions(),
    "",
    featureContext(settings),
    "",
    "Run one polling cycle for new Jira/JSM incident tickets.",
    "",
    "Use Jira MCP only for Jira/JSM operations. Do not call Jira REST directly.",
    `Find up to ${settings.jiraPollBatchSize} tickets with this JQL:`,
    settings.jiraJql,
    "",
    "For each matching ticket:",
    `1. If it already has label ${settings.investigatedLabel} or ${settings.investigatingLabel}, skip it.`,
    `2. Claim it by adding label ${settings.investigatingLabel}.`,
    "3. Add an internal/private Jira note saying AI investigation started.",
    "4. Investigate using Jira MCP plus any configured optional sources. For Coralogix, use cx CLI.",
    "5. Add an internal/private RCA comment with summary, timeline, evidence, likely root cause, confidence, mitigations, follow-up actions, and open questions.",
    `6. On success, add label ${settings.investigatedLabel} and remove ${settings.investigatingLabel}.`,
    `7. On failure, add label ${settings.failedLabel}, remove ${settings.investigatingLabel}, and include the failure reason in your final output.`,
    "",
    "Return a concise run summary listing every ticket considered and the action taken.",
  ].join("\n");
}

function baseInstructions(): string {
  return [
    "You are an incident investigation agent.",
    "Use available MCP tools and CLI tools. Prefer tool evidence over assumptions.",
    "Keep actions read-only except Jira/JSM labels and internal/private investigation comments when explicitly required by the workflow.",
    "Do not invent evidence. Cite concrete timestamps, query terms, issue keys, commit SHAs, workflow names, and links where available.",
    "Separate direct root cause, contributing factors, and unrelated noise.",
  ].join("\n");
}

function featureContext(settings: Settings): string {
  const features = [settings.features.sources.jiraJsm, settings.features.sources.github, settings.features.sources.coralogix];
  return [
    "Configured sources:",
    ...features.map((feature) => {
      const state = feature.enabled ? "enabled" : `disabled, missing ${feature.missingEnv.join(", ")}`;
      return `- ${feature.name}: ${state}`;
    }),
  ].join("\n");
}

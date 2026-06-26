import type { Settings } from "./config.ts";

export const scoutPromptTemplates = [
  "Scout prompt templates:",
  "",
  "Log scout:",
  "Goal: Investigate one log/trace/metric hypothesis or one bounded time/service slice.",
  "Context: <issue key or request>, <service/component>, <time window>, <known error terms>, <constraints>.",
  "Tools: Use cx CLI and loaded Coralogix skills only. Stay read-only.",
  "Return: query used; inspected time range; top patterns with counts; 3 to 5 representative timestamps, trace IDs, or event IDs; suspected service/component; confidence; unknowns; next query if more work is needed.",
  "",
  "GitHub scout:",
  "Goal: Investigate one repository, deployment, commit range, workflow, or code path relevant to the incident.",
  "Context: <issue key or request>, <repo>, <service/component>, <time window or commit range>, <suspected files/functions>.",
  "Tools: Use gh, local read-only inspection, and loaded GitHub skills only. Do not change files, branches, PRs, releases, deployments, or workflow state.",
  "Return: repos/branches inspected; commands run; relevant commits/PRs/workflows with links or SHAs; files/functions implicated; confidence; unknowns; next step.",
  "",
  "Postgres scout:",
  "Goal: Verify one bounded read-only application-state hypothesis.",
  "Context: <issue key or request>, <tenant/user/order IDs>, <tables or entities>, <time window>, <safety constraints>.",
  "Tools: Use psql and loaded Postgres skill only. Read-only queries only; no locks, writes, migrations, or schema changes.",
  "Return: queries run; row counts; compact result summary; sensitive values redacted; confidence; unknowns; next query if needed.",
].join("\n");

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
    "Context budget rule:",
    "Use delegate_task for high-volume log exploration, uncertain query building, broad error searches, and service-by-service or time-slice comparisons.",
    "Keep the parent context focused on the investigation plan and final synthesis. Do not paste large raw log output into the parent context.",
    "Each delegated log scout should return compact findings only: query used, time range, top patterns with counts, 3 to 5 representative event timestamps or trace IDs, suspected service/component, confidence, and remaining unknowns.",
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
    "2. If Coralogix is configured, use cx CLI with the loaded Coralogix skills to inspect relevant logs, metrics, traces, alerts, incidents, and error signatures. Delegate broad or high-volume log exploration to focused log scouts and keep only compact findings in the parent context.",
    "3. If GitHub is configured, inspect recent deployments, commits, PRs, and workflow runs if they may be relevant.",
    "4. Use subagent delegation for focused deep dives when the issue points to a specific service, repository, subsystem, error signature, or code path.",
    "5. If Postgres is configured, use psql with the loaded Postgres skill for read-only database evidence when the ticket points to application state or records.",
    "6. Post no public customer response unless explicitly asked. If writing to Jira, use an internal/private note.",
    "7. Produce an evidence-backed RCA draft with confidence and follow-up actions.",
  ].join("\n");
}

export function incidentTriagePrompt(issueKey: string, settings: Settings): string {
  return [
    baseInstructions(),
    "",
    featureContext(settings),
    "",
    `Phase 1: triage incident ticket ${issueKey}.`,
    "",
    "Use Jira MCP only for Jira/JSM operations. Do not write Jira comments or labels in this phase.",
    "Read the ticket, comments, links, status, labels, customer impact, affected services, timestamps, identifiers, and existing troubleshooting notes.",
    "",
    "Return a compact triage brief with these headings:",
    "- ticket summary",
    "- customer impact",
    "- affected systems or services",
    "- timeline anchors",
    "- identifiers and query terms",
    "- likely evidence scouts to run",
    "- immediate blockers or missing information",
  ].join("\n");
}

export function incidentEvidencePrompt(issueKey: string, settings: Settings, triageBrief: string, journalPath: string): string {
  return [
    baseInstructions(),
    "",
    featureContext(settings),
    "",
    `Phase 2: gather bounded evidence for incident ticket ${issueKey}.`,
    "",
    "Use the triage brief below to decide which focused scouts are needed. Use delegate_task for each bounded log, GitHub, or Postgres deep dive.",
    "Do not write Jira comments or labels in this phase. Keep parent context compact and synthesize scout results instead of pasting raw logs or command dumps.",
    `The wrapper is journaling phase outputs at ${journalPath}; make your final phase output compact enough to reread during synthesis.`,
    "",
    "Triage brief:",
    triageBrief,
    "",
    "Return an evidence brief with these headings:",
    "- scouts run",
    "- evidence supporting likely root cause",
    "- evidence against or unrelated noise",
    "- timeline",
    "- suspected root cause",
    "- confidence",
    "- open questions",
  ].join("\n");
}

export function incidentSynthesisPrompt(
  issueKey: string,
  settings: Settings,
  triageBrief: string,
  evidenceBrief: string,
  journalPath: string,
): string {
  return [
    baseInstructions(),
    "",
    featureContext(settings),
    "",
    `Phase 3: synthesize incident ticket ${issueKey}.`,
    "",
    "Use Jira MCP for Jira/JSM operations. You may write exactly one internal/private Jira investigation comment if the evidence is sufficient.",
    "Do not post a public customer response. Do not change labels unless explicitly required by this phase output format or the surrounding workflow.",
    `The compact investigation journal is at ${journalPath}.`,
    "",
    "Triage brief:",
    triageBrief,
    "",
    "Evidence brief:",
    evidenceBrief,
    "",
    "If evidence is sufficient, produce an internal RCA draft with summary, impact, timeline, root cause, confidence, mitigation, follow-up actions, and open questions.",
    "If evidence is insufficient, produce an internal investigation-incomplete note with what was checked, why confidence is low, and exact next evidence needed.",
  ].join("\n");
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
  return [
    baseInstructions(),
    "",
    featureContext(settings),
    "",
    `Recovery: the ${phase} phase for incident ticket ${issueKey} did not complete cleanly.`,
    "",
    "Goal: provide a compact, usable phase result so the wrapper can continue the investigation.",
    "Do not restart a broad investigation. Use the journal and partial output first. If one small read-only tool check is needed, do only that.",
    "Do not write Jira comments or labels during recovery.",
    "",
    "Failure:",
    error,
    "",
    "Partial output captured before failure:",
    partialOutput || "(none)",
    "",
    "Recent journal snapshot:",
    journalSnapshot,
    "",
    "Original phase prompt:",
    failedPrompt,
    "",
    "Return a compact recovery brief with these headings:",
    "- recovered phase",
    "- usable findings",
    "- evidence or partial evidence",
    "- confidence",
    "- what remains unknown",
    "- exact next step",
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
    "4. Investigate using Jira MCP plus any configured optional sources. For Coralogix, use cx CLI and delegate broad or high-volume log exploration to focused log scouts. For Postgres, use psql read-only. Use subagent delegation for focused code, log, or database deep dives when the ticket identifies a likely service, subsystem, or error signature.",
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
    "When deep investigation has a focused scope, use delegate_task to spawn autonomous read-only subagents with fresh context.",
    "For noisy sources such as logs, traces, broad code search, and uncertain query construction, protect the parent context: delegate the exploration and ask for compact evidence summaries instead of raw dumps.",
    scoutPromptTemplates,
    "Delegated subagents must not ask the user questions, wait for approvals, change files, write Jira comments, add labels, merge code, trigger deployments, or mutate external systems. If blocked, they must return what they verified and what remains unknown.",
    "Give subagents narrow goals, concrete context, and expected output. Ask for compact evidence: files/functions, commands or queries run, timestamps, links, confidence, and next steps.",
    "Do not invent evidence. Cite concrete timestamps, query terms, issue keys, commit SHAs, workflow names, and links where available.",
    "Separate direct root cause, contributing factors, and unrelated noise.",
  ].join("\n");
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

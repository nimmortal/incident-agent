{{featureContext}}

Phase 1: triage incident ticket {{issueKey}}.

Use Jira MCP only for Jira/JSM operations. Do not write Jira comments or labels in this phase.
Read the ticket, comments, links, status, labels, customer impact, affected services, timestamps, identifiers, and existing troubleshooting notes.
The triage brief is machine-to-machine input for the code and evidence phases, not a user answer: include every identifier, timestamp, service hint, and error signature that could matter downstream. Do not copy ticket prose verbatim and do not narrate tool usage, but never drop a concrete identifier to save space.
Prefer a code-grounding scout before noisy log exploration when GitHub is configured and the ticket contains a service, route, job, error signature, workflow, repository, or version hint.
If the ticket points to framework, SDK, protocol, API, blockchain, cloud service, or library behavior, include a documentation scout. Prefer Context7 MCP for library/framework/API docs.

Return a triage brief with these headings:
- ticket summary
- customer impact
- affected systems or services
- timeline anchors
- identifiers and query terms
- source join keys
- likely code entry points
- competing hypotheses
- technology docs to check
- scout plan
- immediate blockers or missing information

For competing hypotheses, state 2 or 3 plausible, materially different explanations of the incident. For each, include:
- hypothesis: one sentence
- discriminating evidence: what observation would confirm it or rule it out
- which planned scout produces that observation

If only one explanation is plausible, say why the alternatives were already excluded by ticket facts.

For each scout in the scout plan, include:
- source: Jira, Coralogix, GitHub, Postgres, or other
- hypothesis or question
- time window or version range
- identifiers, service names, repos, tables, fields, or query terms
- join keys: service, environment, time window, tenant/customer/request/trace IDs, repo, deploy/ref, schema, and confidence
- expected evidence shape
- stop condition

End your response with exactly one status block in this format:

<incident-agent-phase-status>
{"status":"done","summary":"Triage brief produced with timeline anchors, identifiers, and scout plan.","artifact":{"phase":"triage","summary":"One-sentence triage result.","confidence":"medium","identifiers":["JSM-123"],"facts":[{"claim":"Concrete ticket fact.","source":"Jira/JSM","locator":"field, comment, or timestamp","confidence":"medium"}],"blockers":[],"nextChecks":["One bounded next check."]}}
</incident-agent-phase-status>

Status rules:
- Use "done" only when the triage brief is complete enough for evidence gathering and no material Jira/JSM read-only checks remain.
- Use "blocked" only when missing credentials, missing identifiers, unavailable tools, unclear time windows, safety or mutation risk, source outage, or excessive scope prevents meaningful progress.
- Use "continue" when another bounded Jira/JSM read-only check is available and likely to improve the triage brief.
- For "blocked", include "blockedBy" with the concrete blocker and exact next input or source needed.
- For "continue", include "nextPrompt" with one specific next triage action.
- For "done" or "blocked", include the typed `artifact`; preserve concrete identifiers and facts, and use empty arrays rather than omitting fields.

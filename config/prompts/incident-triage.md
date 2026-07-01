{{featureContext}}

Phase 1: triage incident ticket {{issueKey}}.

Use Jira MCP only for Jira/JSM operations. Do not write Jira comments or labels in this phase.
Read the ticket, comments, links, status, labels, customer impact, affected services, timestamps, identifiers, and existing troubleshooting notes.
Keep the triage brief terse: at most 2 bullets per heading, no ticket prose copied verbatim, no tool narration.
Prefer a code-grounding scout before noisy log exploration when GitHub is configured and the ticket contains a service, route, job, error signature, workflow, repository, or version hint.
If the ticket points to framework, SDK, protocol, API, blockchain, cloud service, or library behavior, include a documentation scout. Prefer Context7 MCP for library/framework/API docs.

Return a compact triage brief with these headings:
- ticket summary
- customer impact
- affected systems or services
- timeline anchors
- identifiers and query terms
- source join keys
- likely code entry points
- technology docs to check
- scout plan
- immediate blockers or missing information

For each scout in the scout plan, include:
- source: Jira, Coralogix, GitHub, Postgres, or other
- hypothesis or question
- time window or version range
- identifiers, service names, repos, tables, fields, or query terms
- join keys: service, environment, time window, tenant/customer/request/trace IDs, repo, deploy/ref, and confidence
- expected evidence shape
- stop condition

End your response with exactly one status block in this format:

<incident-agent-phase-status>
{"status":"done","summary":"Triage brief produced with timeline anchors, identifiers, and scout plan."}
</incident-agent-phase-status>

Status rules:
- Use "done" only when the triage brief is complete enough for evidence gathering and no material Jira/JSM read-only checks remain.
- Use "blocked" only when missing credentials, missing identifiers, unavailable tools, unclear time windows, safety or mutation risk, source outage, or excessive scope prevents meaningful progress.
- Use "continue" when another bounded Jira/JSM read-only check is available and likely to improve the triage brief.
- For "blocked", include "blockedBy" with the concrete blocker and exact next input or source needed.
- For "continue", include "nextPrompt" with one specific next triage action.

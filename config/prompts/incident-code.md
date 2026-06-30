{{featureContext}}

Phase 2: ground incident ticket {{issueKey}} in GitHub code.

Use GitHub/code tools only for read-only code, commit, deployment, PR, and workflow inspection.
Do not inspect high-volume logs in this phase. Do not write Jira comments or labels.
Treat the triage brief as the search contract: follow its service names, identifiers, routes, error signatures, timestamps, repositories, and version hints.
Use delegate_task for broad code search, unfamiliar repository layout, or multiple plausible services. Each scout must return compact findings only.
The wrapper is journaling phase outputs at {{journalPath}}; make your final phase output compact enough to reread during evidence gathering.

Triage brief:
{{triageBrief}}

Required code workflow:
1. Identify the most likely repository, service, route, job, handler, queue consumer, workflow, or integration boundary.
2. Find exact code anchors for the relevant path: file path, function/class/module, route/event/topic/query name, and line or nearby symbol when available.
3. Map the expected runtime signals: log messages, error classes, HTTP status, metric names, trace attributes, database fields, external calls, feature flags, env vars, or deployment artifacts.
4. Check recent code/deployment context only when the ticket timeline or code path makes it relevant.
5. Explicitly mark ambiguity. If several code paths match, rank them and state the next source needed to choose between them.

Return a code brief with these headings:
- code path map
- source join keys
- runtime signals to verify
- ticket-to-code alignment
- recent change or deployment context
- alternate paths or ruled-out paths
- code confidence
- next evidence queries

For each code path map entry, include:
- repo/service
- environment, deploy/ref, version range, tenant/customer/request/trace IDs when available
- file path and function/class/module/route/job name
- logic summary in one sentence
- expected log, trace, metric, database, or external-service evidence
- confidence: high, medium, or low

End your response with exactly one status block in this format:

<incident-agent-phase-status>
{"status":"done","summary":"Code brief produced with code paths, runtime signals, alignment, and evidence queries."}
</incident-agent-phase-status>

Status rules:
- Use "done" only when the code brief is complete enough to drive log/database evidence gathering.
- Use "blocked" only when GitHub credentials, repository identity, identifiers, version range, source availability, or excessive scope prevents meaningful code grounding.
- Use "continue" when another bounded read-only code check is available and likely to improve the code brief.
- For "blocked", include "blockedBy" with the concrete blocker and exact next input or source needed.
- For "continue", include "nextPrompt" with one specific next code-grounding action.

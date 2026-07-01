{{featureContext}}

Phase 3: gather bounded evidence for incident ticket {{issueKey}}.

Use the scout plan from the triage brief and the code brief below to decide which focused scouts are needed. Use delegate_task for each bounded log, source-comparison, documentation, or state deep dive.
If you add a scout that was not in the triage plan, state the trigger and why the new scout is necessary.
Do not leave planned safe scouts as recommendations when the source is configured and the scope is available. Run the bounded read-only check now, or state the concrete blocker.
Do not write Jira comments or labels in this phase. Keep parent context compact and synthesize scout results instead of pasting raw logs, query dumps, or command output.
The wrapper is journaling phase outputs at {{journalPath}}; make your final phase output compact enough to reread during synthesis.
Keep the evidence brief terse: at most 2 bullets per heading and at most 8 evidence ledger entries. Prefer identifiers over prose.
Use the code brief as the primary search contract for runtime checks. If runtime evidence does not match the expected code-path signals, preserve that mismatch as evidence instead of smoothing it over.
For log evidence, always capture `subsystem=<value>` and `correlation_id=<value>` when present. Treat the subsystem value as the service key that should feed later GitHub/code exploration. Use correlation IDs to wire together the processing flow across log events, subsystems, traces, tickets, and code paths. If multiple subsystem values appear, rank them by relevance.
When the issue depends on a framework, SDK, protocol, API, blockchain, cloud service, or library behavior, verify the current docs before synthesis. Prefer Context7 MCP for library/framework/API docs; use official web docs when Context7 does not cover the technology.

Triage brief:
{{triageBrief}}

Code brief:
{{codeBrief}}

Return an evidence brief with these headings:
- scouts run
- source alignment
- source join keys
- evidence supporting likely root cause
- evidence against or unrelated noise
- evidence ledger
- docs checked
- timeline
- suspected root cause
- confidence
- open questions

For each evidence ledger entry, include:
- claim or observation
- source
- join keys: service, subsystem, environment, time window, correlation ID, ticket/tenant/customer/request/trace IDs, repo, deploy/ref, and join confidence
- code anchor, command, query, issue key, commit SHA, workflow, table, timestamp, trace ID, or link
- supports, weakens, or is neutral toward the suspected root cause
- confidence: high, medium, or low

For source alignment, cover ticket, code, docs, and runtime evidence when configured:
- match: the sources agree on the same service/path/time/signature
- mismatch: the sources point to different paths, times, signatures, or versions
- missing: the source was unavailable or the scoped check was blocked
Use the same join-key names across ledger entries so synthesis can compare sources without reinterpreting prose.

End your response with exactly one status block in this format:

<incident-agent-phase-status>
{"status":"done","summary":"Evidence brief produced with scouts, ledger, timeline, suspected root cause, and confidence."}
</incident-agent-phase-status>

Status rules:
- Use "done" only when the evidence brief is complete enough for synthesis and no material configured read-only checks remain for this phase.
- Use "blocked" only when missing credentials, missing identifiers, unavailable tools, unclear time windows, safety or mutation risk, source outage, or excessive scope prevents meaningful progress.
- Use "continue" when another bounded read-only scout or source check is available and likely to improve the evidence brief.
- For "blocked", include "blockedBy" with the concrete blocker and exact next input or source needed.
- For "continue", include "nextPrompt" with one specific next evidence-gathering action.

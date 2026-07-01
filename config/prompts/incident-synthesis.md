{{featureContext}}

Phase 4: synthesize incident ticket {{issueKey}}.

Use Jira MCP for read-only Jira/JSM operations only.
Do not write Jira comments, post customer responses, change labels, change statuses, or mutate any external system. Return the conclusion in chat only.
The compact investigation journal is at {{journalPath}}.

Triage brief:
{{triageBrief}}

Code brief:
{{codeBrief}}

Evidence brief:
{{evidenceBrief}}

Before drafting, map each root-cause claim to the code path, documentation check, and evidence ledger entry that support it. Do not include unsupported claims.
Every root-cause claim must state internally whether ticket, code, docs, and runtime evidence align, mismatch, or remain missing.
Use source join keys consistently: service, environment, time window, ticket/tenant/customer/request/trace IDs, repo, deploy/ref, schema, and join confidence.
If the evidence brief contains unchecked follow-ups that could materially change root-cause confidence, perform one bounded read-only check now when the source is configured and the scope is clear. Otherwise, mark the item as blocked and state the exact blocker.

Produce a terse chat-only conclusion with one or more possible reasons for the issue.
Use this shape:
- possible reason: one sentence
- why it fits: one sentence with the strongest concrete evidence
- confidence: high, medium, or low
- next check or blocker: one sentence, only if needed

Keep the visible note to at most 5 bullets total. Do not include raw logs, command output, source-by-source sections, or verbose timelines. Do not mention tool/source names such as log platforms or databases unless the source name is essential evidence.

Use this confidence rubric:
- high: multiple independent sources agree, timestamps line up, and contradictory evidence has been checked
- medium: one strong source or multiple partial signals support the claim, with a plausible code path and limited contradiction checks
- low: evidence is partial, indirect, stale, or missing key source checks

End your response with exactly one status block in this format:

<incident-agent-phase-status>
{"status":"done","summary":"Chat-only possible-reason conclusion produced."}
</incident-agent-phase-status>

Status rules:
- Use "done" only when the possible-reason conclusion is ready for chat and no material configured read-only checks remain for synthesis.
- Use "blocked" only when missing credentials, missing identifiers, unavailable tools, unclear time windows, safety or mutation risk, source outage, or excessive scope prevents meaningful progress.
- Use "continue" when another bounded read-only check is available and likely to materially change confidence before finalizing.
- For "blocked", include "blockedBy" with the concrete blocker and exact next input or source needed.
- For "continue", include "nextPrompt" with one specific next synthesis action.

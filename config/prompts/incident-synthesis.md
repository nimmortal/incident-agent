{{featureContext}}

Phase 3: synthesize incident ticket {{issueKey}}.

Use Jira MCP for Jira/JSM operations. You may write exactly one internal/private Jira investigation comment if the evidence is sufficient.
Do not post a public customer response. Do not change labels unless explicitly required by this phase output format or the surrounding workflow.
The compact investigation journal is at {{journalPath}}.

Triage brief:
{{triageBrief}}

Evidence brief:
{{evidenceBrief}}

Before drafting, map each root-cause claim to the evidence ledger entry that supports it. Do not include unsupported claims.
If the evidence brief contains unchecked follow-ups that could materially change root-cause confidence, perform one bounded read-only check now when the source is configured and the scope is clear. Otherwise, mark the item as blocked and state the exact blocker.

If evidence is sufficient, produce an internal RCA draft with summary, impact, timeline, root cause, evidence ledger, confidence, mitigation, follow-up actions, and open questions.
If evidence is insufficient, produce an internal investigation-incomplete note with what was checked, evidence ledger, why confidence is low, and exact next evidence needed.
Keep the note terse: at most 10 bullets total, at most 5 evidence ledger entries, and no raw logs or command output.

Use this confidence rubric:
- high: multiple independent sources agree, timestamps line up, and contradictory evidence has been checked
- medium: one strong source or multiple partial signals support the claim, with limited contradiction checks
- low: evidence is partial, indirect, stale, or missing key source checks

End your response with exactly one status block in this format:

<incident-agent-phase-status>
{"status":"done","summary":"Internal RCA or incomplete-investigation note produced."}
</incident-agent-phase-status>

Status rules:
- Use "done" only when the RCA or incomplete-investigation note is ready and no material configured read-only checks remain for synthesis.
- Use "blocked" only when missing credentials, missing identifiers, unavailable tools, unclear time windows, safety or mutation risk, source outage, or excessive scope prevents meaningful progress.
- Use "continue" when another bounded read-only check is available and likely to materially change confidence before finalizing.
- For "blocked", include "blockedBy" with the concrete blocker and exact next input or source needed.
- For "continue", include "nextPrompt" with one specific next synthesis action.

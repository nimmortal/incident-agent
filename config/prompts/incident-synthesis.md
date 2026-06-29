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

Use this confidence rubric:
- high: multiple independent sources agree, timestamps line up, and contradictory evidence has been checked
- medium: one strong source or multiple partial signals support the claim, with limited contradiction checks
- low: evidence is partial, indirect, stale, or missing key source checks

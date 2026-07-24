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
Address every competing hypothesis from the triage and evidence briefs: a hypothesis may only be ruled out by citing the discriminating evidence that excludes it, not by omission. Untested hypotheses stay in the conclusion as alternatives or next checks.
Use source join keys consistently: service, environment, time window, ticket/tenant/customer/request/trace IDs, repo, deploy/ref, schema, and join confidence.
If the evidence brief contains unchecked follow-ups that could materially change root-cause confidence, perform one bounded read-only check now when the source is configured and the scope is clear. Otherwise, mark the item as blocked and state the exact blocker.

Produce a terse chat-only conclusion with one or more possible reasons for the issue.
Use this shape:
- possible reason: one sentence
- why it fits: one sentence with the strongest concrete evidence
- confidence: high, medium, or low
- ruled out: the rejected alternatives and the one piece of evidence that excludes each
- next check or blocker: one sentence, only if needed

Keep the visible note to at most 6 bullets total. Do not include raw logs, command output, source-by-source sections, or verbose timelines. Do not mention tool/source names such as log platforms or databases unless the source name is essential evidence.
If the confirmed conclusion reveals a reusable fact about a service that future investigations would need again (for example a service-to-repository mapping, a telemetry subsystem name, a schema.table ownership, or a recurring failure signature), append one final line starting with "proposed learning:" containing a one-line entry a human can copy into the company-context Confirmed Learnings table. Skip the line when confidence is low or the fact is ticket-specific.

Use this confidence rubric:
- high: multiple independent sources agree, timestamps line up, and contradictory evidence has been checked
- medium: one strong source or multiple partial signals support the claim, with a plausible code path and limited contradiction checks
- low: evidence is partial, indirect, stale, or missing key source checks

End your response with exactly one status block in this format:

<incident-agent-phase-status>
{"status":"done","summary":"Chat-only possible-reason conclusion produced.","artifact":{"phase":"synthesis","summary":"One-sentence final conclusion.","confidence":"medium","identifiers":["strongest evidence identifier"],"facts":[{"claim":"Root-cause claim.","source":"aligned evidence","locator":"strongest concrete locator","confidence":"medium"}],"blockers":[],"nextChecks":[]}}
</incident-agent-phase-status>

Status rules:
- Use "done" only when the possible-reason conclusion is ready for chat and no material configured read-only checks remain for synthesis.
- Use "blocked" only when missing credentials, missing identifiers, unavailable tools, unclear time windows, safety or mutation risk, source outage, or excessive scope prevents meaningful progress.
- Use "continue" when another bounded read-only check is available and likely to materially change confidence before finalizing.
- For "blocked", include "blockedBy" with the concrete blocker and exact next input or source needed.
- For "continue", include "nextPrompt" with one specific next synthesis action.
- If exactly one evidence gap that only the evidence phase can fill (a scout-scale log, code, docs, or state deep dive) would materially change root-cause confidence, add "evidenceRequest" with one specific bounded request to the final "done" or "blocked" status. The wrapper will re-run the evidence phase once with that request and then re-run synthesis. Use it at most once and only for a check you could not perform in this phase.
- For "done" or "blocked", include the typed `artifact`; it is the durable machine-readable result, so use empty arrays rather than omitting fields.

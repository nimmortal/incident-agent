{{featureContext}}

Phase 2: gather bounded evidence for incident ticket {{issueKey}}.

Use the scout plan from the triage brief below to decide which focused scouts are needed. Use delegate_task for each bounded log, GitHub, or Postgres deep dive.
If you add a scout that was not in the triage plan, state the trigger and why the new scout is necessary.
Do not leave planned safe scouts as recommendations when the source is configured and the scope is available. Run the bounded read-only check now, or state the concrete blocker.
Do not write Jira comments or labels in this phase. Keep parent context compact and synthesize scout results instead of pasting raw logs or command dumps.
The wrapper is journaling phase outputs at {{journalPath}}; make your final phase output compact enough to reread during synthesis.

Triage brief:
{{triageBrief}}

Return an evidence brief with these headings:
- scouts run
- evidence supporting likely root cause
- evidence against or unrelated noise
- evidence ledger
- timeline
- suspected root cause
- confidence
- open questions

For each evidence ledger entry, include:
- claim or observation
- source
- command, query, issue key, commit SHA, workflow, table, timestamp, or link
- supports, weakens, or is neutral toward the suspected root cause
- confidence: high, medium, or low

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

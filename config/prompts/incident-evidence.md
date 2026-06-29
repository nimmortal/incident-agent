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

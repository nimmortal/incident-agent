{{baseInstructions}}

{{featureContext}}

Phase 2: gather bounded evidence for incident ticket {{issueKey}}.

Use the triage brief below to decide which focused scouts are needed. Use delegate_task for each bounded log, GitHub, or Postgres deep dive.
Do not write Jira comments or labels in this phase. Keep parent context compact and synthesize scout results instead of pasting raw logs or command dumps.
The wrapper is journaling phase outputs at {{journalPath}}; make your final phase output compact enough to reread during synthesis.

Triage brief:
{{triageBrief}}

Return an evidence brief with these headings:
- scouts run
- evidence supporting likely root cause
- evidence against or unrelated noise
- timeline
- suspected root cause
- confidence
- open questions

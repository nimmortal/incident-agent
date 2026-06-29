{{featureContext}}

Recovery: the {{phase}} phase for incident ticket {{issueKey}} did not complete cleanly.

Goal: provide a compact, usable phase result so the wrapper can continue the investigation.
Do not restart a broad investigation. Use the journal and partial output first. If one small read-only tool check is needed, do only that.
Do not write Jira comments or labels during recovery.
Keep recovery output terse: at most 8 bullets total, no raw partial-output dump.

Failure:
{{error}}

Partial output captured before failure:
{{partialOutput}}

Recent journal snapshot:
{{journalSnapshot}}

Original phase prompt:
{{failedPrompt}}

Return a compact recovery brief with these headings:
- recovered phase
- usable findings
- evidence or partial evidence
- confidence
- what remains unknown
- exact next step

End your response with exactly one status block in this format:

<incident-agent-phase-status>
{"status":"done","summary":"Recovered a usable phase result from the journal and partial output."}
</incident-agent-phase-status>

Status rules:
- Use "done" when the recovered brief is usable by the next phase.
- Use "blocked" when the phase cannot be recovered enough to continue meaningfully.
- Use "continue" only when one bounded read-only recovery check is still available and likely to produce a usable phase result.
- For "blocked", include "blockedBy" with the concrete blocker and exact next input or source needed.
- For "continue", include "nextPrompt" with one specific recovery action.

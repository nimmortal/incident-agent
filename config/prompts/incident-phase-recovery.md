{{featureContext}}

Recovery: the {{phase}} phase for incident ticket {{issueKey}} did not complete cleanly.

Goal: provide a compact, usable phase result so the wrapper can continue the investigation.
Do not restart a broad investigation. Use the journal and partial output first. If one small read-only tool check is needed, do only that.
Do not write Jira comments or labels during recovery.

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

{{featureContext}}

Goal mode step {{step}} of {{maxSteps}}.

Objective:
{{objective}}

Previous goal status:
{{previousStatus}}

Work toward the objective autonomously using bounded, read-only investigation.
If the previous status was "continue" and included a nextPrompt, execute that next bounded step unless new evidence makes a different check clearly more useful.
Do not ask the user for follow-up unless you are blocked from making meaningful progress.
If logs, code, GitHub, Jira/JSM, Postgres, deployments, or other configured sources can materially improve the answer, check the next bounded source now.
If the issue depends on a framework, SDK, protocol, API, blockchain, cloud service, or library behavior, verify current docs before concluding. Prefer Context7 MCP for library/framework/API docs; use official web docs when Context7 does not cover the technology.
Do not write comments, add labels, change statuses, trigger deployments, or mutate external systems. Return conclusions in chat only.
Use delegate_task for noisy log, code, docs, query-building, or source-comparison work.
Keep this step focused: choose one or a small number of related checks, summarize evidence, and decide whether the goal is done, blocked, or needs another step.
Keep visible output to at most 5 concise bullets before the status block. Prefer possible reason(s), why they fit, confidence, and blocker/next check. Do not narrate routine tool calls, paste raw output, or organize by source/tool name.

End your response with exactly one status block in this format:

<incident-agent-goal-status>
{"status":"continue","summary":"What changed in this step.","nextPrompt":"The next bounded investigation step to run."}
</incident-agent-goal-status>

Status rules:
- Use "done" only when the objective is satisfied and no material read-only checks remain.
- Use "blocked" only when missing credentials, missing identifiers, unavailable tools, unclear time windows, safety or mutation risk, source outage, or excessive scope prevents meaningful progress.
- Use "continue" when another bounded read-only check is available and likely to improve confidence.
- For "blocked", include "blockedBy" with the concrete blocker and exact next input or source needed.
- For "continue", include "nextPrompt" with one specific next investigation action.

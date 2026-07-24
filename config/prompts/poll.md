{{featureContext}}

Run one idempotent polling cycle for new or changed Jira/JSM incident tickets.

Use Jira MCP only for read-only Jira/JSM operations. Do not call Jira REST directly.
Do not add or remove labels, write comments, change statuses, assign tickets, or mutate Jira/JSM in any way.
Read up to {{jiraPollCandidateBatchSize}} candidate tickets with this JQL:
{{jiraJql}}

Durable state from previous cycles:
{{pollState}}

Compare each candidate's exact Jira `updated` timestamp with the matching state's `updatedAt`.
Skip expensive investigation when the timestamp is unchanged. Investigate at most {{jiraPollBatchSize}} new or changed tickets per cycle so older unchanged tickets do not starve newer work.

For each new or changed ticket:
1. Read only the ticket fields, comments, links, timestamps, service identifiers, and troubleshooting notes needed to decide whether it has enough context for investigation.
2. If the ticket has a likely service, repo, error signature, or code path, inspect the code before broad runtime evidence.
3. If the code path depends on framework, SDK, protocol, API, blockchain, cloud service, or library behavior, verify current docs before concluding. Prefer Context7 MCP for library/framework/API docs.
4. Run only bounded read-only evidence checks. Use subagent delegation for focused code, docs, or noisy runtime exploration.
5. Return the conclusion in chat only. Do not write the conclusion back to Jira/JSM.

Return a concise chat summary listing only new or changed tickets investigated and the likely reason or blocker. Use one line per ticket; avoid source-by-source prose.

End with exactly one machine-readable block containing every candidate considered, including unchanged tickets:

<incident-agent-poll-status>
{"tickets":[{"key":"JSM-123","updatedAt":"exact Jira updated timestamp","outcome":"unchanged|investigated|blocked|failed","summary":"One-line result or unchanged reason."}]}
</incident-agent-poll-status>

Do not invent timestamps. If the Jira updated timestamp cannot be read, mark that ticket `failed` and explain why; the wrapper will not silently advance an unverifiable checkpoint.
Only `investigated` and verified `unchanged` outcomes advance the durable checkpoint. `blocked` and `failed` outcomes remain eligible for retry.

{{featureContext}}

Run one polling cycle for new Jira/JSM incident tickets.

Use Jira MCP only for read-only Jira/JSM operations. Do not call Jira REST directly.
Do not add or remove labels, write comments, change statuses, assign tickets, or mutate Jira/JSM in any way.
Find up to {{jiraPollBatchSize}} tickets with this JQL:
{{jiraJql}}

For each matching ticket:
1. Read only the ticket fields, comments, links, timestamps, service identifiers, and troubleshooting notes needed to decide whether it has enough context for investigation.
2. If the ticket has a likely service, repo, error signature, or code path, inspect the code before broad runtime evidence.
3. If the code path depends on framework, SDK, protocol, API, blockchain, cloud service, or library behavior, verify current docs before concluding. Prefer Context7 MCP for library/framework/API docs.
4. Run only bounded read-only evidence checks. Use subagent delegation for focused code, docs, or noisy runtime exploration.
5. Return the conclusion in chat only. Do not write the conclusion back to Jira/JSM.

Return a concise chat summary listing every ticket considered and the likely reason or blocker. Use one line per ticket; avoid source-by-source prose.

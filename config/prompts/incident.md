{{featureContext}}

Investigate incident ticket {{issueKey}}.

Required workflow:
1. Use Jira MCP to read the ticket, comments, links, status, labels, and customer impact.
2. If GitHub is configured, ground the ticket in code before broad log exploration: identify the likely repo/service/path, exact code anchors, expected runtime signals, and recent deployment or change context when relevant.
3. If the code path depends on a framework, SDK, protocol, API, blockchain, cloud service, or library behavior, read current docs before concluding. Prefer Context7 MCP for library/framework/API docs; use official web docs when Context7 does not cover the technology.
4. If runtime evidence is configured, inspect relevant logs, metrics, traces, alerts, incidents, and error signatures. Drive queries from the code-grounded runtime signals when available. Delegate broad or high-volume exploration to focused scouts and keep only compact findings in the parent context.
5. Use subagent delegation for focused deep dives when the issue points to a specific service, repository, subsystem, error signature, code path, documentation behavior, or evidence mismatch.
6. Keep all actions read-only. Do not write Jira comments, add or remove labels, change statuses, post customer responses, trigger deployments, or mutate any external system.
7. Before finalizing, map each possible reason across ticket, code, docs, and runtime evidence as aligned, mismatched, or missing. Run any material safe read-only follow-up checks that are possible with configured sources and available context.
8. Return a chat-only conclusion with one or a short list of possible reasons, why each fits, confidence, and the next missing check only if needed.
9. Keep the final output terse: at most 5 bullets, no raw logs, no command dumps, no source-by-source sections, and no routine tool narration.

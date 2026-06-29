{{featureContext}}

Investigate incident ticket {{issueKey}}.

Required workflow:
1. Use Jira MCP to read the ticket, comments, links, status, labels, and customer impact.
2. If Coralogix is configured, use cx CLI with the loaded Coralogix skills to inspect relevant logs, metrics, traces, alerts, incidents, and error signatures. Delegate broad or high-volume log exploration to focused log scouts and keep only compact findings in the parent context.
3. If GitHub is configured, inspect recent deployments, commits, PRs, and workflow runs if they may be relevant.
4. Use subagent delegation for focused deep dives when the issue points to a specific service, repository, subsystem, error signature, or code path.
5. If Postgres is configured, use psql with the loaded Postgres skill for read-only database evidence when the ticket points to application state or records.
6. Post no public customer response unless explicitly asked. If writing to Jira, use an internal/private note.
7. Before finalizing, run any material safe read-only follow-up checks that are possible with configured sources and available context.
8. Produce an evidence-backed RCA draft with confidence and follow-up actions. Mark follow-up actions as checked now or blocked, and state the blocker for anything left unchecked.
9. Keep the final output terse: at most 10 bullets, no raw logs, no command dumps, no routine tool narration.

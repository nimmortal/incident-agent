{{featureContext}}

Run one polling cycle for new Jira/JSM incident tickets.

Use Jira MCP only for Jira/JSM operations. Do not call Jira REST directly.
Find up to {{jiraPollBatchSize}} tickets with this JQL:
{{jiraJql}}

For each matching ticket:
1. If it already has label {{investigatedLabel}} or {{investigatingLabel}}, skip it.
2. Claim it by adding label {{investigatingLabel}}.
3. Add an internal/private Jira note saying AI investigation started.
4. Investigate using Jira MCP plus any configured optional sources. For Coralogix, use cx CLI and delegate broad or high-volume log exploration to focused log scouts. For Postgres, use psql read-only. Use subagent delegation for focused code, log, or database deep dives when the ticket identifies a likely service, subsystem, or error signature.
5. Add an internal/private RCA comment with summary, timeline, evidence, likely root cause, confidence, mitigations, follow-up actions, and open questions.
6. On success, add label {{investigatedLabel}} and remove {{investigatingLabel}}.
7. On failure, add label {{failedLabel}}, remove {{investigatingLabel}}, and include the failure reason in your final output.

Return a concise run summary listing every ticket considered and the action taken. Use one line per ticket; avoid investigation prose unless a ticket failed.

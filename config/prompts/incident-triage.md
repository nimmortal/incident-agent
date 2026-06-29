{{featureContext}}

Phase 1: triage incident ticket {{issueKey}}.

Use Jira MCP only for Jira/JSM operations. Do not write Jira comments or labels in this phase.
Read the ticket, comments, links, status, labels, customer impact, affected services, timestamps, identifiers, and existing troubleshooting notes.

Return a compact triage brief with these headings:
- ticket summary
- customer impact
- affected systems or services
- timeline anchors
- identifiers and query terms
- scout plan
- immediate blockers or missing information

For each scout in the scout plan, include:
- source: Jira, Coralogix, GitHub, Postgres, or other
- hypothesis or question
- time window or version range
- identifiers, service names, repos, tables, fields, or query terms
- expected evidence shape
- stop condition

Use the cx CLI and the loaded Coralogix skill to investigate logs, metrics, traces, alerts, and incidents.
{{windowInstruction}}

Context budget rule:
Use delegate_task for high-volume log exploration, uncertain query building, broad error searches, and service-by-service or time-slice comparisons.
Keep the parent context focused on the investigation plan and final synthesis. Do not paste large raw log output into the parent context.
Each delegated log scout should return compact findings only: query used, time range, top patterns with counts, 3 to 5 representative event timestamps or trace IDs, suspected service/component, confidence, and remaining unknowns.
If log findings point to a material code, deployment, ticket, docs, or state follow-up and the matching source is configured, run the next bounded read-only check before finalizing. Leave it as a recommendation only when blocked, and state the blocker.
If the issue depends on framework, SDK, protocol, API, blockchain, cloud service, or library behavior, verify current docs before concluding. Prefer Context7 MCP for library/framework/API docs.
Keep the final answer to at most 5 bullets: possible reason(s), why they fit, confidence, and next blocker/action. Do not include raw logs or source-by-source sections.

Investigation request:
{{query}}

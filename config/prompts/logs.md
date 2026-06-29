Use the cx CLI and the loaded Coralogix skill to investigate logs, metrics, traces, alerts, and incidents.
{{windowInstruction}}

Context budget rule:
Use delegate_task for high-volume log exploration, uncertain query building, broad error searches, and service-by-service or time-slice comparisons.
Keep the parent context focused on the investigation plan and final synthesis. Do not paste large raw log output into the parent context.
Each delegated log scout should return compact findings only: query used, time range, top patterns with counts, 3 to 5 representative event timestamps or trace IDs, suspected service/component, confidence, and remaining unknowns.
If log findings point to a material code, deployment, Jira/JSM, or Postgres follow-up and the matching source is configured, run the next bounded read-only check before finalizing. Leave it as a recommendation only when blocked, and state the blocker.
Keep the final answer to at most 8 bullets: conclusion, query/time window, top patterns, representative IDs, confidence, and next blocker/action.

Investigation request:
{{query}}

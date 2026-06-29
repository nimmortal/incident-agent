{{baseInstructions}}

Use the cx CLI and the loaded Coralogix skill to investigate logs, metrics, traces, alerts, and incidents.
{{windowInstruction}}

Context budget rule:
Use delegate_task for high-volume log exploration, uncertain query building, broad error searches, and service-by-service or time-slice comparisons.
Keep the parent context focused on the investigation plan and final synthesis. Do not paste large raw log output into the parent context.
Each delegated log scout should return compact findings only: query used, time range, top patterns with counts, 3 to 5 representative event timestamps or trace IDs, suspected service/component, confidence, and remaining unknowns.

Investigation request:
{{query}}

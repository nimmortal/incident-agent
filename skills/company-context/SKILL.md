---
name: company-context
description: Company-specific context for incident investigation. Use alongside incident-agent to map tickets, services, telemetry, repositories, environments, ownership, escalation paths, and response policy.
---

# Company Context

Use this context to make incident investigation faster and less generic.
When a section is not filled in yet, do not invent details. Ask for the missing context or state the assumption clearly.

## Investigation Priorities

- Customer impact and blast radius come before implementation details.
- Prefer direct evidence from Jira/JSM, Coralogix, GitHub, and Postgres over assumptions.
- Keep customer-facing communication separate from internal/private investigation notes.

## Service And Repository Map

Fill this with service names, owning teams, repository names, deployable units, runtime names, and common aliases.

| Service or alias | Owner | Repository | Runtime/deployment | Notes |
| --- | --- | --- | --- | --- |
| _todo_ | _todo_ | _todo_ | _todo_ | _todo_ |

## Environments And Regions

Fill this with environment names, region names, cluster names, tenant conventions, and how they appear in logs, metrics, traces, deployments, and tickets.

| Environment | Region/cluster | Log or metric labels | Notes |
| --- | --- | --- | --- |
| _todo_ | _todo_ | _todo_ | _todo_ |

## Telemetry Conventions

Fill this with Coralogix teams/apps/subsystems, common fields, trace ID fields, request ID fields, tenant/user/account identifiers, severity conventions, and useful baseline queries.

| Signal | Field or query convention | Notes |
| --- | --- | --- |
| Logs | _todo_ | _todo_ |
| Traces | _todo_ | _todo_ |
| Metrics | _todo_ | _todo_ |
| Alerts | _todo_ | _todo_ |

## Jira/JSM Conventions

Fill this with project keys, ticket types, labels, statuses, internal-comment policy, customer-comment policy, escalation fields, and incident severity definitions.

| Convention | Value |
| --- | --- |
| Project keys | _todo_ |
| Investigation labels | _todo_ |
| Severity mapping | _todo_ |
| Internal comment policy | _todo_ |

## Data Safety

Fill this with sensitive fields, PII rules, tenant isolation constraints, allowed database tables or schemas, and examples of what must be masked in summaries.

| Data type | Handling rule |
| --- | --- |
| Secrets/tokens | Never print; report presence/absence only. |
| Personal data | Mask unless exact values are required and allowed. |
| _todo_ | _todo_ |

## Escalation And Follow-Up

Fill this with team aliases, Slack channels, on-call groups, escalation thresholds, follow-up issue conventions, and postmortem requirements.

| Condition | Escalation target | Expected action |
| --- | --- | --- |
| _todo_ | _todo_ | _todo_ |

---
name: postgres-readonly
description: Read Postgres data safely with psql for incident investigation. Use when DATABASE_URL is configured and the user asks for database evidence, application state, records, queues, jobs, tenants, or persisted incident context.
---

# Postgres Read-Only Access

Use this skill when incident investigation needs evidence from the configured Postgres database.

## Connection

- Use the `DATABASE_URL` environment variable. Do not print it.
- Use `psql`; do not install packages or use ad hoc database clients.
- Assume access should be read-only. If a query would mutate data, stop and explain why.

## Safe Query Pattern

Run every investigation query inside a read-only transaction with a short timeout:

```bash
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 --csv -c "BEGIN READ ONLY; SET LOCAL statement_timeout = '30s'; SELECT now(); ROLLBACK;"
```

Replace `SELECT now()` with the actual read-only query. Prefer `--csv` for tabular results that need to be summarized.

## Workflow

1. Identify the entity being investigated: tenant, user, account, request ID, job ID, order ID, document ID, timestamp window, or service-specific key.
2. Discover schema before guessing table names:
   - list schemas from `information_schema.schemata`
   - list candidate tables from `information_schema.tables`
   - list columns from `information_schema.columns`
3. Read only the minimum rows needed to answer the incident question.
4. Use tight filters and explicit limits.
5. Cite table names, filters, row counts, and timestamps in the final answer.
6. Do not expose secrets, tokens, passwords, private keys, or full personal data values. Mask sensitive fields in summaries.

## Guardrails

- Never run `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `ALTER`, `DROP`, `CREATE`, `GRANT`, `REVOKE`, `VACUUM`, `ANALYZE`, `CALL`, or `DO`.
- Do not run long table scans without a narrow time window or identifier filter.
- Do not change session settings except `statement_timeout` inside the read-only transaction.
- If read-only access is denied or the connection user can write, continue to use read-only transactions and report the access mismatch.

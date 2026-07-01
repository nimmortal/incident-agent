---
name: postgres-readonly
description: Read Postgres data safely with psql for incident investigation. Use when DATABASE_URL is configured and the user asks for database evidence, application state, records, queues, jobs, tenants, or persisted incident context.
---

# Postgres Read-Only Access

Use this skill when incident investigation needs evidence from the configured Postgres database.
One `DATABASE_URL` points to one database. If that database contains multiple application schemas, discover and choose schemas inside the connected database; do not treat schemas as separate database URLs.
Do not use Postgres as the first discovery source. Start from the impacted service identified by the ticket, logs, or code brief, then use code/config evidence to choose schema.table targets before querying state.

## Connection

- Use the `DATABASE_URL` environment variable. Do not print it.
- Use `psql`; do not install packages or use ad hoc database clients.
- Assume access should be read-only. If a query would mutate data, stop and explain why.
- The runtime sets `PGOPTIONS` with default read-only mode, statement timeout, lock timeout, and idle transaction timeout. Do not override those settings to longer or less restrictive values.

## Safe Query Pattern

Run every investigation query inside a read-only transaction with local timeouts:

```bash
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 --csv -c "BEGIN READ ONLY; SET LOCAL statement_timeout = '5s'; SET LOCAL lock_timeout = '1s'; SELECT now() LIMIT 1; ROLLBACK;"
```

Replace `SELECT now()` with the actual read-only query. Prefer `--csv` for tabular results that need to be summarized.
Every query must have a bounded predicate or a small `LIMIT`; schema-discovery queries should also use narrow filters.

## Workflow

1. Identify the impacted service from the ticket, logs, or code brief, plus the entity being investigated: tenant, user, account, request ID, job ID, order ID, document ID, timestamp window, or service-specific key.
2. Use code/config context before querying state: service default config, datastore setting, repository/ORM/query code, migrations, or query builders should point to candidate schemas and tables. If that mapping is missing, report the blocker instead of running broad table discovery.
3. Discover schemas before querying table data:
   - list visible non-system schemas from `information_schema.schemata`
   - prefer company-context schema hints when present, but verify they exist
   - do not assume `public` unless schema discovery or the user identifies it
4. Discover candidate tables with schema-qualified names:
   - query `information_schema.tables` by `table_schema`
   - query `information_schema.columns` by `table_schema` and `table_name`
   - use `schema.table` in queries and summaries once a table is selected
5. Read only the minimum rows needed to answer the incident question.
6. Use tight filters, explicit limits, and the shortest useful time window.
7. Cite impacted service, code/config basis, schemas inspected, `schema.table` names, filters, row counts, and timestamps in the final answer.
8. Do not expose secrets, tokens, passwords, private keys, or full personal data values. Mask sensitive fields in summaries.

## Guardrails

- Never run `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `ALTER`, `DROP`, `CREATE`, `GRANT`, `REVOKE`, `VACUUM`, `ANALYZE`, `CALL`, or `DO`.
- Do not run long table scans without a narrow time window or identifier filter.
- Do not run unbounded `SELECT *`; select only columns needed for the hypothesis.
- Do not query unqualified table names when multiple schemas are visible.
- Do not change session settings except local timeouts inside the read-only transaction.
- If a query times out, narrow the predicate, reduce the time window, or inspect schema/indexes before retrying. Do not simply raise the timeout.
- If read-only access is denied or the connection user can write, continue to use read-only transactions and report the access mismatch.

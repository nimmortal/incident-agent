---
name: github-code-exploration
description: Explore GitHub repository code through a local shallow-clone cache and ripgrep. Use whenever incident investigation needs to read code, map log messages to source, trace call paths, inspect config/ORM/migrations, or compare commit ranges. Prefer this over GitHub code-search APIs.
---

# GitHub Code Exploration

Read code from a local clone, not through the GitHub API. `gh search code` is
rate-limited (about 10 requests/minute), returns fragments without surrounding
context, and cannot follow imports. A shallow clone plus ripgrep is faster,
unlimited, and gives full-file context.

## Repository Resolution

1. Resolve service to repository using the company-context service map first.
2. If the map has no entry, run one bounded lookup: `gh search repos <service> --limit 5`
   or `gh repo list <org> --limit 30 --json name,description | grep -i <service>`.
3. If the repository is still ambiguous, report the candidates and confidence
   instead of exploring all of them.

## Clone Cache

Use the persistent cache directory in `REPO_CACHE_DIR` (fall back to
`data/repos` when unset). Clones survive across investigation runs; reuse them.

Clone once, shallow and blob-filtered:

```bash
gh repo clone <org>/<repo> "$REPO_CACHE_DIR/<org>/<repo>" -- --depth 1 --filter=blob:none
```

Refresh an existing cached clone instead of recloning:

```bash
git -C "$REPO_CACHE_DIR/<org>/<repo>" fetch --depth 1 origin HEAD
git -C "$REPO_CACHE_DIR/<org>/<repo>" reset --hard FETCH_HEAD
```

Inspect a specific deploy ref, tag, or commit SHA:

```bash
git -C "$REPO_CACHE_DIR/<org>/<repo>" fetch --depth 1 origin <ref-or-sha>
git -C "$REPO_CACHE_DIR/<org>/<repo>" checkout --detach FETCH_HEAD
```

The cache is scratch space: local checkouts and resets are fine. Never commit,
push, create branches on the remote, or mutate any GitHub state.

## Reading Code

- Search with `rg -n` (fall back to `grep -rn` if ripgrep is unavailable):
  `rg -n "handleCallback" --type ts`.
- To map a log message to source, search the literal message with regex
  characters escaped: `rg -nF "payment callback failed"`. If the message is
  templated, search a stable substring.
- Read whole functions/files around a hit; follow imports to the definitions
  that matter. Do not conclude from a grep fragment alone.
- Use git history from the clone instead of the API where possible:
  - recent changes to a path: `git log --oneline -n 20 -- <path>`
    (fetch more history first when needed: `git fetch --deepen 200 origin`)
  - when a term changed: `git log -S "<term>" --oneline -- <path>`
  - what changed between deploys: `git log <base>..<head> --stat`
- Config/DB grounding: inspect default config, env templates, ORM/repository
  code, migrations, and query builders to find the datastore, schema, and
  table names the service actually uses.

## When To Use The API Instead

Use `gh` API commands only for data a clone cannot provide: PRs
(`gh pr list/view`), workflow runs (`gh run list/view`), deployments,
releases, and issues. Use `gh search code` only when the owning repository is
unknown and the company-context map plus repo search failed; keep it to one or
two bounded queries.

## Return Shape

Report: repository and ref inspected; search terms or commands used; file
paths with line numbers; functions/classes implicated; a one-sentence logic
summary per code path; expected runtime signals (log messages, error classes,
metrics, schema.table usage); confidence; unknowns.

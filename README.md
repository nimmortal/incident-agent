# Incident Agent PoC

Local PoC for a Hermes-based incident investigation agent.

The first version is intentionally simple:

- exposes a small CLI for ad-hoc investigation commands
- uses Hermes cron and gateway to poll Jira/JSM through MCP
- delegates Jira, Coralogix, and GitHub investigation to Hermes tools and CLIs
- keeps the wrapper limited to scheduling and prompt construction

## Setup

1. Copy the env template:

   ```bash
   cp .env.example .env.local
   ```

2. Fill in tokens in `.env.local`.

3. Build the image:

   ```bash
   docker compose build
   ```

4. Run a local sanity check:

   ```bash
   docker compose run --rm incident-agent npm run doctor
   ```

## Running With Docker Compose

Docker Compose is the default local path. It loads `.env.local`, mounts the
Hermes config template, and keeps generated Hermes runtime state under `./data`.

Run one-off commands:

```bash
docker compose run --rm incident-agent npm run agent -- ask "Check whether service api had errors in the last 30 minutes"
docker compose run --rm incident-agent npm run agent -- ticket JSM-123
docker compose run --rm incident-agent npm run agent -- logs --window "last 2 hours" "payment callback failures for tenant abc"
docker compose run --rm incident-agent npm run investigate -- JSM-123
docker compose run --rm incident-agent npm run agent -- poll-once
```

Start periodic polling through Hermes cron and gateway:

```bash
docker compose up incident-agent
```

Rebuild after source or Dockerfile changes:

```bash
docker compose build
```

Run a shell in the container:

```bash
docker compose run --rm incident-agent sh
```

Useful checks inside the shell:

```bash
hermes --version
gh --version
cx --version
npm run doctor
```

For local development, mount the current source into the container so you can
test prompt or CLI changes without rebuilding the image:

```bash
docker compose run --rm \
  -v "$PWD/src:/app/src:ro" \
  incident-agent \
  npm run agent -- ask "Check whether the GitHub CLI is available"
```

The image still contains the previously copied source, but the bind mount wins
for that run.

## Running With Plain Docker

Use this when you want to run the built image without Compose:

```bash
docker build -t incident-agent:local .
```

Run a one-off command:

```bash
docker run --rm \
  --env-file .env.local \
  -v "$PWD/config/hermes.config.yaml:/app/config/hermes.config.yaml:ro" \
  -v "$PWD/data:/app/data" \
  incident-agent:local \
  npm run agent -- ask "Check recent logs for service api"
```

Run one polling cycle:

```bash
docker run --rm \
  --env-file .env.local \
  -v "$PWD/config/hermes.config.yaml:/app/config/hermes.config.yaml:ro" \
  -v "$PWD/data:/app/data" \
  incident-agent:local \
  npm run agent -- poll-once
```

Start periodic polling through Hermes cron and gateway:

```bash
docker run --rm \
  --env-file .env.local \
  -v "$PWD/config/hermes.config.yaml:/app/config/hermes.config.yaml:ro" \
  -v "$PWD/data:/app/data" \
  incident-agent:local
```

Run with local source mounted, without rebuilding:

```bash
docker run --rm \
  --env-file .env.local \
  -v "$PWD/src:/app/src:ro" \
  -v "$PWD/config/hermes.config.yaml:/app/config/hermes.config.yaml:ro" \
  -v "$PWD/data:/app/data" \
  incident-agent:local \
  npm run agent -- ask "Check whether the runtime can see Jira MCP, gh, cx, psql, and source skills"
```

If your Jira MCP server runs on your laptop, use `host.docker.internal` in
`.env.local`, for example:

```bash
JIRA_MCP_URL=http://host.docker.internal:9000/mcp
```

## Running Without Docker

This is useful for fast CLI iteration, but the host must already have Hermes,
Node 24+, `gh`, `cx`, `psql`, and the required Hermes skills installed. The
wrapper launches Hermes with `HOME=HERMES_RUNTIME_HOME`, so host-installed
skills under your normal `~/.hermes` are not visible unless you seed them into
the runtime home. Repository-local skills are read from `HERMES_LOCAL_SKILLS_PATH`.

```bash
npm install
npm run check
HERMES_SKILLS_SEED_HOME="$HOME" npm run doctor
HERMES_SKILLS_SEED_HOME="$HOME" npm run agent -- ask "Check whether service api had errors in the last 30 minutes"
```

Install the Coralogix skills into your normal host skill directory first:

```bash
npx skills add coralogix/cx-cli \
  --agent github-copilot \
  --skill cx-telemetry-querying \
  --skill cx-incident-management \
  --copy \
  -y
```

The Docker image already includes Hermes' bundled GitHub skills. For host mode,
verify that `npm run doctor` reports all expected seed skills as `found` before
using GitHub, Coralogix, or Postgres commands.

For Copilot-only prompt tests that do not need source skills:

```bash
npm run doctor
npm run agent -- ask "Check whether service api had errors in the last 30 minutes"
```

For local host execution, the wrapper reads `HERMES_CONFIG_TEMPLATE`, writes a
generated config under `HERMES_RUNTIME_HOME`, and launches Hermes with that
directory as `HOME`. The Docker path is closer to the future Kubernetes runtime.

## Examples

Ask a direct question:

```bash
docker compose run --rm incident-agent npm run agent -- ask "Check if login errors increased after the last deployment"
```

Inspect a Jira/JSM ticket through MCP:

```bash
docker compose run --rm incident-agent npm run agent -- ticket JSM-123
```

Investigate a ticket end to end:

```bash
docker compose run --rm incident-agent npm run investigate -- JSM-123
```

Check Coralogix logs/traces/metrics:

```bash
docker compose run --rm incident-agent npm run agent -- logs --window "last 2 hours" "payment callback failures for tenant abc"
```

Ask for GitHub context through `gh`:

```bash
docker compose run --rm incident-agent npm run agent -- ask "Use gh to check recent failed workflow runs in OctoComm/example-service"
```

Run one polling cycle:

```bash
docker compose run --rm incident-agent npm run agent -- poll-once
```

## Required Secrets

- `COPILOT_GITHUB_TOKEN`: Copilot-compatible token Hermes uses for GitHub Copilot. Classic GitHub PATs (`ghp_*`) are not supported by Copilot API endpoints.

Supported Copilot token options:

- OAuth/device-flow token (`gho_*`), for example from `hermes model` or Copilot login flows.
- GitHub App token (`ghu_*`).
- Fine-grained PAT (`github_pat_*`) owned by your personal account, not an organization, with the Account > Copilot Requests permission.

If Hermes still reports `Personal Access Tokens are not supported for this endpoint` with a valid `github_pat_*`, try an OAuth/device-flow token (`gho_*`) from a Hermes/Copilot login flow. This points at the Copilot provider authentication path, not at the GitHub source skills or `gh` CLI setup.

To test whether a GitHub App installation token works for Hermes Copilot too,
set `COPILOT_GITHUB_TOKEN_SOURCE=github-app` alongside the GitHub App
credentials. The wrapper will generate one `ghs_*` installation token and expose
it as both `GITHUB_TOKEN` and `COPILOT_GITHUB_TOKEN` in the Hermes child process.

Required only for Jira/JSM commands:

- `JIRA_MCP_URL`: Jira/JSM MCP endpoint for Hermes.
- `JIRA_MCP_TOKEN`: token for the Jira/JSM MCP endpoint.

Source credentials. These are optional globally, but required by commands that
use the corresponding source:

- `GITHUB_TOKEN`: read-only token available to `gh` inside the container. As an alternative, provide `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, and `GITHUB_APP_PRIVATE_KEY`; the wrapper will generate a short-lived installation token and expose it to `gh` as `GITHUB_TOKEN`.
- `CX_API_KEY`: Coralogix API key available to `cx` inside the container.
- `CX_REGION`: Coralogix region available to `cx` inside the container.
- `DATABASE_URL`: Postgres connection URL available to `psql` inside the container. Prefer a read-only database user.

For GitHub CLI access, the container has `gh` installed and the image build
seeds Hermes' bundled GitHub skills for auth, issues, PR workflow, and
repository management. Those skills prefer `gh` and fall back to lower-level
GitHub access where appropriate. Provide either `GITHUB_TOKEN` or GitHub App
credentials in `.env.local`; Hermes can then call `gh` without relying on an
interactive login session. When GitHub App credentials are present, the wrapper
generates a `ghs_*` installation token at startup, sets it as `GITHUB_TOKEN` for
the Hermes child process, and clears `GH_TOKEN` for that child so `gh` does not
prefer a stale token. Store PEM private keys with escaped newlines in `.env.local`:

```env
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"
```

Optional Copilot experiment:

```env
COPILOT_GITHUB_TOKEN_SOURCE=github-app
```

For Coralogix access, the container has `cx` installed and the image build
installs the `cx-telemetry-querying` and `cx-incident-management` Hermes skills
into an image seed profile. Before each Hermes run, the wrapper refreshes
image-managed skills in `HERMES_RUNTIME_HOME/.hermes/skills`, so image rebuilds
roll out skill updates even when `./data` is bind-mounted.

For Postgres access, the container has `psql` installed and the repository
includes a `postgres-readonly` Hermes skill. Set `DATABASE_URL` only when the
agent should be allowed to read database state. The skill instructs Hermes to use
read-only transactions, short statement timeouts, tight filters, and masked
summaries for sensitive fields.

## Commands

The wrapper intentionally does not implement Jira, GitHub, Coralogix, or
Postgres clients. Those systems are exposed to Hermes as tools.
CLI parsing is handled by Commander, so use the built-in help while iterating:

```bash
npm run agent -- --help
npm run agent -- logs --help
```

```bash
npm run agent -- ask <request>
npm run agent -- ticket <JSM-123>
npm run agent -- logs [--window <time-window>] <query>
npm run agent -- investigate <JSM-123>
npm run agent -- poll-once
npm run poll
```

Command behavior:

- `ask`: requires GitHub Copilot only. Source tools are optional and used only if the request needs them.
- `ticket`: requires GitHub Copilot and Jira/JSM.
- `logs`: requires GitHub Copilot and Coralogix.
- `investigate`: requires GitHub Copilot and Jira/JSM. GitHub, Coralogix, and Postgres are optional investigation context.
- `poll-once`: requires GitHub Copilot and Jira/JSM. GitHub, Coralogix, and Postgres are optional investigation context.
- `poll`: ensures the managed Hermes cron job `incident-agent-jira-poll` matches current env/config, then runs `hermes gateway run`.

## Features

The local wrapper treats capabilities as provider/source modules:

- Provider: GitHub Copilot is mandatory for every Hermes run.
- Model: Hermes is pinned to `gpt-5.4` through `config/hermes.config.yaml`.
- Source: Jira/JSM provides tickets and incident workflow through MCP.
- Source: GitHub provides code, deployments, PRs, commits, and workflow runs through `gh` and bundled GitHub skills.
- Source: Coralogix provides logs, metrics, traces, alerts, and incidents through `cx`.
- Source: Postgres provides read-only database evidence through `psql` and a repository-local skill.

Run `npm run doctor` to see which modules are enabled. Missing optional sources
do not prevent the wrapper from starting, but commands that need a missing source
fail before starting Hermes.

Before launching Hermes, the wrapper copies `HERMES_CONFIG_TEMPLATE` to
`HERMES_RUNTIME_HOME/.hermes/config.yaml`, sets Jira MCP `enabled` from the
feature registry, refreshes image-installed Hermes skills in the runtime Hermes
home, refreshes repository-local Hermes skills, and checks required CLI binaries
plus preloaded skills before starting Hermes.

Periodic polling uses Hermes' native cron scheduler. `npm run poll` creates or
updates the managed `incident-agent-jira-poll` job using
`JIRA_POLL_INTERVAL_SECONDS`, removes duplicate managed jobs, and then starts
the Hermes gateway in the foreground so due cron jobs fire.

## Investigation State

The polling prompt tells Hermes to use labels:

- `ai-investigating`
- `ai-investigated`
- `ai-investigation-failed`

For production, replace labels with a custom field or a dedicated app property.

## Comment Visibility

The prompt instructs Hermes to write only internal/private Jira/JSM investigation
comments. Validate the Jira MCP tool behavior before using this with real
customer tickets.

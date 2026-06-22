# Incident Agent PoC

Local PoC for a Hermes-based incident investigation agent.

The first version is intentionally simple:

- exposes a small CLI for ad-hoc investigation commands
- periodically asks Hermes to poll Jira/JSM through MCP
- delegates Jira, Coralogix, and GitHub investigation to Hermes tools
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

Start periodic polling:

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

Start periodic polling:

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
  npm run agent -- ask "Check whether the runtime can see Jira MCP and gh"
```

If your Jira MCP server runs on your laptop, use `host.docker.internal` in
`.env.local`, for example:

```bash
JIRA_MCP_URL=http://host.docker.internal:9000/mcp
```

## Running Without Docker

This is useful for fast CLI iteration, but the host must already have Hermes,
Node 24+, and `gh` installed.

```bash
npm install
npm run check
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

- `COPILOT_GITHUB_TOKEN`: token Hermes uses for GitHub Copilot.

Required only for Jira/JSM commands:

- `JIRA_MCP_URL`: Jira/JSM MCP endpoint for Hermes.
- `JIRA_MCP_TOKEN`: token for the Jira/JSM MCP endpoint.

Source credentials. These are optional globally, but required by commands that
use the corresponding source:

- `GITHUB_TOKEN`: read-only token available to `gh` inside the container.
- `CORALOGIX_API_KEY`: Coralogix API key, passed through for Hermes/MCP usage.
- `CORALOGIX_DOMAIN`: Coralogix API domain segment used by the Hermes MCP config.

For GitHub CLI access, the container has `gh` installed. Provide `GITHUB_TOKEN`
in `.env.local`; Hermes can then call `gh` without relying on an interactive
login session.

## Commands

The wrapper intentionally does not implement Jira, GitHub, or Coralogix clients.
Those systems are exposed to Hermes as tools.
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
- `investigate`: requires GitHub Copilot and Jira/JSM. GitHub and Coralogix are optional investigation context.
- `poll-once`: requires GitHub Copilot and Jira/JSM. GitHub and Coralogix are optional investigation context.
- `poll`: repeats `poll-once` every `JIRA_POLL_INTERVAL_SECONDS`.

## Features

The local wrapper treats capabilities as provider/source modules:

- Provider: GitHub Copilot is mandatory for every Hermes run.
- Source: Jira/JSM provides tickets and incident workflow through MCP.
- Source: GitHub provides code, deployments, PRs, commits, and workflow runs through `gh`.
- Source: Coralogix provides logs, metrics, traces, and alerts through MCP.

Run `npm run doctor` to see which modules are enabled. Missing optional sources
do not prevent the wrapper from starting, but commands that need a missing source
fail before starting Hermes.

Before launching Hermes, the wrapper copies `HERMES_CONFIG_TEMPLATE` to
`HERMES_RUNTIME_HOME/.hermes/config.yaml` and sets MCP server `enabled` flags
from the feature registry. For example, if Coralogix envs are absent, the
generated Hermes config keeps the Coralogix MCP server disabled.

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

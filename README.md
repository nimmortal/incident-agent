# Incident Agent PoC

Local PoC for a Hermes-based incident investigation agent.

The first version is intentionally simple:

- exposes a small CLI for ad-hoc investigation commands
- uses Hermes cron and gateway to poll Jira/JSM through MCP
- delegates Jira, Coralogix, and GitHub investigation to Hermes tools and CLIs
- runs end-to-end ticket investigation in triage, code grounding, evidence, and synthesis phases
- runs bounded goal loops for autonomous multi-step investigation
- writes compact investigation journals under `./data/investigations`
- keeps the wrapper limited to scheduling and prompt template rendering

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
Hermes config template, prompt templates, and local Hermes skills, and keeps
generated Hermes runtime state under `./data`.

Run one-off commands:

```bash
docker compose run --rm incident-agent npm run agent -- ask "Check whether service api had errors in the last 30 minutes"
docker compose run --rm incident-agent npm run agent -- ticket JSM-123
docker compose run --rm incident-agent npm run agent -- logs --window "last 2 hours" "payment callback failures for tenant abc"
docker compose run --rm incident-agent npm run goal -- --max-steps 6 "Investigate JSM-123 until RCA confidence is medium or blocked"
docker compose run --rm incident-agent npm run investigate -- JSM-123
docker compose run --rm incident-agent npm run investigate -- --phase-max-steps 5 JSM-123
docker compose run --rm incident-agent npm run agent -- poll-once
```

Start an interactive Hermes terminal UI with the same generated runtime config,
skills, and credentials as wrapper-launched one-off runs:

```bash
docker compose run --rm -it incident-agent npm run ui
```

Start Hermes' browser dashboard:

```bash
docker compose run --rm -p 127.0.0.1:9119:9119 incident-agent \
  npm run dashboard -- --host 0.0.0.0 --no-open
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
test CLI changes without rebuilding the image. Prompt templates and local
Hermes skills are already bind-mounted by Docker Compose.

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
  -v "$PWD/config/prompts:/app/config/prompts:ro" \
  -v "$PWD/skills:/app/skills:ro" \
  -v "$PWD/data:/app/data" \
  incident-agent:local \
  npm run agent -- ask "Check recent logs for service api"
```

Run one polling cycle:

```bash
docker run --rm \
  --env-file .env.local \
  -v "$PWD/config/hermes.config.yaml:/app/config/hermes.config.yaml:ro" \
  -v "$PWD/config/prompts:/app/config/prompts:ro" \
  -v "$PWD/skills:/app/skills:ro" \
  -v "$PWD/data:/app/data" \
  incident-agent:local \
  npm run agent -- poll-once
```

Start periodic polling through Hermes cron and gateway:

```bash
docker run --rm \
  --env-file .env.local \
  -v "$PWD/config/hermes.config.yaml:/app/config/hermes.config.yaml:ro" \
  -v "$PWD/config/prompts:/app/config/prompts:ro" \
  -v "$PWD/skills:/app/skills:ro" \
  -v "$PWD/data:/app/data" \
  incident-agent:local
```

Run with local source mounted, without rebuilding:

```bash
docker run --rm \
  --env-file .env.local \
  -v "$PWD/src:/app/src:ro" \
  -v "$PWD/config/hermes.config.yaml:/app/config/hermes.config.yaml:ro" \
  -v "$PWD/config/prompts:/app/config/prompts:ro" \
  -v "$PWD/skills:/app/skills:ro" \
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
- Fine-grained PAT (`github_pat_*`) owned by your personal account, not an organization, with the Account > Copilot Requests permission.

The Docker image patches Hermes' Copilot request headers to send
`Copilot-Integration-Id: copilot-developer-cli` by default. This is required for
some fine-grained PAT flows that otherwise fail with `Personal Access Tokens are
not supported for this endpoint`. Override with `COPILOT_INTEGRATION_ID` only if
GitHub or Hermes changes the required integration id.

If Hermes still reports `Personal Access Tokens are not supported for this endpoint` with a valid `github_pat_*`, try an OAuth/device-flow token (`gho_*`) from a Hermes/Copilot login flow. This points at the Copilot provider authentication path, not at the GitHub source skills or `gh` CLI setup.

Required only for Jira/JSM commands:

- `JIRA_MCP_URL`: Jira/JSM MCP endpoint for Hermes.
- `JIRA_MCP_AUTH_SCHEME`: auth scheme for the Jira/JSM MCP endpoint. Defaults to `Bearer`; use `Basic` when `JIRA_MCP_TOKEN` is `base64(email:api-token)`.
- `JIRA_MCP_TOKEN`: token for the Jira/JSM MCP endpoint.

For a personal Atlassian API token encoded as `base64(email:api-token)`, use:

```env
JIRA_MCP_AUTH_SCHEME=Basic
JIRA_MCP_TOKEN=<base64-email-colon-api-token>
```

Source credentials. These are optional globally, but required by commands that
use the corresponding source:

- `GITHUB_TOKEN`: read-only token available to `gh` inside the container.
- `CX_API_KEY`: Coralogix API key available to `cx` inside the container.
- `CX_REGION`: Coralogix region available to `cx` inside the container.
- `DATABASE_URL`: Postgres connection URL available to `psql` inside the container. Prefer a read-only database user.

For GitHub CLI access, the container has `gh` installed and the image build
seeds Hermes' bundled GitHub skills for auth, issues, PR workflow, and
repository management. Those skills prefer `gh` and fall back to lower-level
GitHub access where appropriate. Provide `GITHUB_TOKEN` in `.env.local`; Hermes
can then call `gh` without relying on an interactive login session. Hermes
strips `GITHUB_TOKEN` from terminal subprocesses as a tool secret, so the
wrapper also writes a `gh` hosts file under `HERMES_RUNTIME_HOME` and sets
`GH_CONFIG_DIR` for Hermes. This lets Hermes use `gh` without exposing the token
as a terminal environment variable.

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
npm run agent -- goal [--max-steps 6] <objective>
npm run agent -- investigate [--phase-max-steps 3] <JSM-123>
npm run agent -- poll-once
npm run agent -- ui
npm run agent -- ui --dashboard
npm run ui
npm run dashboard
npm run poll
```

Session options:

```bash
npm run agent -- ask --session <session-id> <request>
npm run agent -- ask --continue-session <request>
npm run agent -- ask --session-name <session-name> <request>
```

By default, every command starts a new Hermes chat run. `--session` maps to
Hermes `--resume <session-id>`. `--continue-session` maps to Hermes
`--continue` for the most recent session. `--session-name` maps to Hermes
`--continue <session-name>`. Hermes prints session information on exit.

The `investigate` command is intentionally different: it runs fresh bounded
Hermes phases and passes compact phase outputs forward, so `--session`,
`--continue-session`, and `--session-name` are not supported there.

Output options:

```bash
npm run agent -- ask --stream <request>
```

`--stream` removes Hermes `--quiet` for that run so Hermes can show live
terminal output, including token streaming and tool progress when Hermes and the
selected provider emit it. The wrapper already forwards Hermes stdout and stderr
as chunks arrive.

Command behavior:

- `ask`: requires GitHub Copilot only. Source tools are optional and used only if the request needs them.
- `ticket`: requires GitHub Copilot and Jira/JSM.
- `logs`: requires GitHub Copilot and Coralogix.
- `goal`: requires GitHub Copilot. It runs repeated Hermes turns in one session until Hermes reports `done`, `blocked`, or the wrapper reaches `--max-steps`.
- `investigate`: requires GitHub Copilot and Jira/JSM. It runs triage, evidence, and synthesis phases, writes a compact JSONL journal, and uses GitHub, Coralogix, and Postgres as optional investigation context. Each phase uses the same `continue`, `done`, or `blocked` progress contract as goal mode.
- `poll-once`: requires GitHub Copilot and Jira/JSM. GitHub, Coralogix, and Postgres are optional investigation context.
- `ui`: requires GitHub Copilot. Source tools are optional and preloaded when their environment is configured.
- `poll`: ensures the managed Hermes cron job `incident-agent-jira-poll` matches current env/config, then runs `hermes gateway run`.

`HERMES_ARGS` defaults to `chat --quiet -q`. Hermes `--quiet` is for
programmatic use: it suppresses the banner, spinner, and tool previews while
still outputting the final response and session info.

Interactive UI mode:

```bash
npm run ui
npm run agent -- ui --cli
npm run agent -- ui --continue-session
npm run dashboard -- --host 0.0.0.0 --no-open
```

`ui` launches Hermes `chat --tui` by default and preloads the optional source
skills enabled by the current environment. Use `--cli` for Hermes' classic
terminal chat. Session options map to the same Hermes session flags as one-off
commands. `dashboard` starts Hermes' browser dashboard through the wrapper
runtime. When running the dashboard in Docker, publish the dashboard port with
`-p 127.0.0.1:9119:9119` and bind Hermes to `--host 0.0.0.0` inside the
container.

Goal mode:

```bash
npm run goal -- --max-steps 6 "Investigate JSM-123 until RCA confidence is medium or blocked"
npm run agent -- goal --session-name jsm-123-rca --stream "Investigate JSM-123 and check safe read-only follow-ups"
```

`goal` is a wrapper-managed loop, not a native Hermes daemon. Each Hermes turn
must finish with a small status block: `continue`, `done`, or `blocked`. When
the status is `continue`, the wrapper feeds the next bounded investigation step
back into the same Hermes session. The loop stops on `done`, `blocked`,
`--max-steps`, `HERMES_TIMEOUT_SECONDS`, or `HERMES_IDLE_TIMEOUT_SECONDS`.
Use `--session-name` when you want the goal loop to use a stable Hermes session
that can be resumed later.

Reasoning controls are passed through the generated Hermes config:

```bash
HERMES_REASONING_EFFORT=medium
HERMES_SHOW_REASONING=false
HERMES_REASONING_FULL=false
```

`HERMES_REASONING_EFFORT` accepts `none`, `minimal`, `low`, `medium`, `high`,
or `xhigh`. Leave it empty to use Hermes' default. `HERMES_SHOW_REASONING`
controls whether Hermes displays model reasoning when the provider returns it;
keep it off for normal incident comments.

Shared incident-investigation behavior lives in the local Hermes skill
`skills/incident-agent` and is preloaded for wrapper commands, `npm run ui`, and
scheduled polling. That is the part Hermes chat sessions can use directly.
Company-specific service maps, ownership, telemetry conventions, data-safety
rules, and escalation paths live in `skills/company-context` and are preloaded
the same way.

Command-specific prompt templates live under `config/prompts` by default and are
rendered by the wrapper before launching Hermes. Override the directory with:

```bash
PROMPT_TEMPLATES_DIR=config/prompts
```

Templates use simple `{{variableName}}` placeholders for runtime values such as
issue keys, feature context, JQL, phase briefs, labels, and journal paths. These
templates are only used by wrapper commands that submit a prompt to Hermes; the
interactive UI gets the shared behavior through the `incident-agent` and
`company-context` skills.

Hermes process supervision is handled by the wrapper:

```bash
HERMES_TIMEOUT_SECONDS=900
HERMES_IDLE_TIMEOUT_SECONDS=300
HERMES_TERMINATE_GRACE_SECONDS=10
HERMES_HEARTBEAT_SECONDS=60
HERMES_RECOVERY_ATTEMPTS=1
INVESTIGATION_PHASE_MAX_STEPS=3
```

`HERMES_TIMEOUT_SECONDS` is the max runtime for one Hermes command or
investigation phase. While the child process is still alive, the wrapper logs a
heartbeat every `HERMES_HEARTBEAT_SECONDS` with elapsed time and time since last
stdout/stderr output. This proves the process has not exited; it does not prove
semantic progress inside Hermes. `HERMES_IDLE_TIMEOUT_SECONDS` stops a Hermes
command that remains alive but produces no stdout/stderr for the configured
period; set it to `0` to disable idle timeout. `HERMES_TERMINATE_GRACE_SECONDS`
controls the grace period between SIGTERM and SIGKILL after max-runtime or idle
timeouts. For `investigate`, each phase turn must report `continue`, `done`, or
`blocked`. A `continue` status repeats the same phase in the same Hermes session
with the requested next bounded step. A `done` status advances to the next
phase. A `blocked` status returns a low-confidence blocked brief that the next
phase can use. `INVESTIGATION_PHASE_MAX_STEPS` caps turns per phase; the
`investigate --phase-max-steps` option can override it for one run. A failed or
timed-out phase step is retried with a recovery prompt up to
`HERMES_RECOVERY_ATTEMPTS` times. If recovery still cannot get a normal phase
result, the wrapper records the failure in the journal and returns a
low-confidence fallback brief so synthesis can produce an incomplete
investigation result instead of ending with no output.

Subagent delegation is enabled through Hermes' `delegate_task` tool for focused
deep dives. The wrapper config keeps subagents autonomous and conservative by
default:

```bash
HERMES_DELEGATION_MAX_ITERATIONS=30
HERMES_DELEGATION_CHILD_TIMEOUT_SECONDS=600
HERMES_DELEGATION_MAX_CONCURRENT_CHILDREN=2
HERMES_DELEGATION_MAX_SPAWN_DEPTH=1
HERMES_DELEGATION_SUBAGENT_AUTO_APPROVE=false
```

Subagents run with fresh context and return compact findings to the parent.
They are instructed to stay read-only, avoid Jira/comment/label writes, avoid
file changes, never wait for human approval, and report partial evidence when
blocked. Keep `HERMES_DELEGATION_SUBAGENT_AUTO_APPROVE=false` for unattended
runs; changing it to `true` allows delegated workers to approve dangerous shell
commands without a human in the loop.

For expensive evidence gathering, treat the main Hermes agent as the incident
orchestrator, not the place where every raw result should accumulate. Broad log
queries, uncertain Coralogix query construction, service-by-service comparisons,
large trace searches, and broad code searches should be delegated to focused
read-only subagents. Each subagent should return only a bounded summary: query
or command used, inspected time range, top patterns with counts, a few
representative timestamps or trace IDs, confidence, and unknowns. The parent
keeps the timeline, RCA synthesis, Jira state transitions, and final comment.

The prompt contract in `skills/incident-agent/SKILL.md` includes fixed scout
templates for log, GitHub, and Postgres deep dives. Company-specific lookup
tables and conventions belong in `skills/company-context/SKILL.md`. Delegated
scouts receive one narrow goal, bounded context, read-only tool constraints, and
a required compact return shape. This keeps uncertain query construction and
high-volume source exploration out of the parent context.

End-to-end `investigate` runs are split into three wrapper-orchestrated phases:

- `triage`: read Jira/JSM and produce a compact ticket brief.
- `evidence`: use the triage brief to delegate bounded source scouts and
  produce an evidence brief.
- `synthesis`: use the two briefs to prepare the internal RCA or incomplete
  investigation note.

Within each phase Hermes must end every turn with an
`<incident-agent-phase-status>` block. The wrapper parses that block to decide
whether the phase should continue, advance, or stop as blocked. This gives
`investigate` the same progress semantics as goal mode while preserving the
fixed triage -> evidence -> synthesis workflow.

Each phase writes a JSONL event stream to
`INVESTIGATION_JOURNAL_DIR/<issue-key>/<run-id>.jsonl`, defaulting to
`data/investigations`. The journal is for recovery and audit, not for storing
large raw logs.

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
fail before starting Hermes. Use `npm run doctor -- --verify-sources` for
opt-in live probes of configured sources. The live probes intentionally stay
conservative: GitHub checks `gh auth status`, Postgres runs a read-only
`SELECT now()`, Jira MCP checks endpoint reachability/auth status, and Coralogix
is left unprobed until a safe account-specific read query is configured.

Before launching Hermes, the wrapper copies `HERMES_CONFIG_TEMPLATE` to
`HERMES_RUNTIME_HOME/.hermes/config.yaml`, sets Jira MCP `enabled` from the
feature registry, renders prompt templates from `PROMPT_TEMPLATES_DIR`,
refreshes image-installed Hermes skills in the runtime Hermes home, refreshes
repository-local Hermes skills, preloads the `incident-agent` and
`company-context` skills, and checks required CLI binaries plus preloaded skills
before starting Hermes.

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

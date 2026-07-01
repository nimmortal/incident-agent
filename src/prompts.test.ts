import assert from "node:assert/strict";
import { test } from "node:test";

import type { Settings } from "./config.ts";
import {
  codeUnavailableBrief,
  incidentCodePrompt,
  incidentEvidenceWithCodePrompt,
  incidentSynthesisWithCodePrompt,
  incidentTriagePrompt,
} from "./prompts.ts";

test("incident prompt phases render code grounding and source alignment contracts", () => {
  const config = settings();
  const triageBrief = "service: payments\nsource join keys: service=payments env=prod request=abc";
  const codeBrief = "code path map: repo=payments-api file=src/callback.ts function=handleCallback";
  const evidenceBrief = "source alignment: match\ntrace ID: trace-1";

  assert.match(incidentTriagePrompt("JSM-123", config), /likely code entry points/);
  assert.match(incidentTriagePrompt("JSM-123", config), /source join keys/);

  const code = incidentCodePrompt("JSM-123", config, triageBrief, "data/investigations/JSM-123/run.jsonl");
  assert.match(code, /Phase 2: ground incident ticket JSM-123 in GitHub code/);
  assert.match(code, /runtime signals to verify/);
  assert.match(code, /service=payments/);

  const evidence = incidentEvidenceWithCodePrompt(
    "JSM-123",
    config,
    triageBrief,
    codeBrief,
    "data/investigations/JSM-123/run.jsonl",
  );
  assert.match(evidence, /Phase 3: gather bounded evidence/);
  assert.match(evidence, /source alignment/);
  assert.match(evidence, /repo=payments-api/);

  const synthesis = incidentSynthesisWithCodePrompt(
    "JSM-123",
    config,
    triageBrief,
    codeBrief,
    evidenceBrief,
    "data/investigations/JSM-123/run.jsonl",
  );
  assert.match(synthesis, /Phase 4: synthesize incident ticket/);
  assert.match(synthesis, /Do not write Jira comments/);
  assert.match(synthesis, /chat-only conclusion/);
  assert.match(synthesis, /possible reason/);
  assert.match(synthesis, /ticket, code, docs, and runtime evidence align/);
  assert.match(synthesis, /trace-1/);
});

test("code unavailable brief preserves structured code contract for downstream evidence", () => {
  const brief = codeUnavailableBrief("GitHub code source is not configured (GITHUB_TOKEN).", "Blocked phase: code");

  assert.match(brief, /code path map/);
  assert.match(brief, /source join keys/);
  assert.match(brief, /ticket-to-code alignment/);
  assert.match(brief, /join confidence: low/);
  assert.match(brief, /Blocked phase: code/);
});

function settings(): Settings {
  return {
    features: {
      provider: {
        copilot: feature("provider:copilot", "provider", "GitHub Copilot"),
      },
      sources: {
        jiraJsm: feature("source:jira-jsm", "source", "Jira/JSM"),
        github: feature("source:github", "source", "GitHub"),
        context7: feature("source:context7", "source", "Context7"),
        coralogix: feature("source:coralogix", "source", "Coralogix"),
        postgres: feature("source:postgres", "source", "Postgres"),
      },
    },
    jiraProjectKey: "JSM",
    jiraJql: "project = JSM",
    jiraPollIntervalSeconds: 300,
    jiraPollBatchSize: 3,
    hermesBin: "hermes",
    hermesArgs: ["chat", "--quiet", "-q"],
    hermesConfigTemplatePath: "config/hermes.config.yaml",
    promptTemplatesDir: "config/prompts",
    hermesRuntimeHome: "data/hermes-home",
    investigationJournalDir: "data/investigations",
    hermesSkillsSeedHome: "/opt/hermes-seed-home",
    hermesLocalSkillsPath: "skills",
    hermesTimeoutSeconds: 900,
    hermesIdleTimeoutSeconds: 300,
    hermesTerminateGraceSeconds: 10,
    hermesHeartbeatSeconds: 60,
    hermesRecoveryAttempts: 1,
    investigationPhaseMaxSteps: 3,
    investigatingLabel: "ai-investigating",
    investigatedLabel: "ai-investigated",
    failedLabel: "ai-investigation-failed",
  };
}

function feature(id: Settings["features"]["provider"]["copilot"]["id"], kind: "provider" | "source", name: string) {
  return {
    id,
    kind,
    name,
    description: `${name} test feature`,
    requiredEnv: [],
    missingEnv: [],
    enabled: true,
  };
}

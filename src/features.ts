import { z } from "zod";

import { hasGitHubAppCredentials, missingGitHubAppCredentials } from "./github-app-token.ts";

export const featureIdSchema = z.enum([
  "provider:copilot",
  "source:jira-jsm",
  "source:github",
  "source:coralogix",
  "source:postgres",
]);
export type FeatureId = z.infer<typeof featureIdSchema>;

export const featureSchema = z.object({
  id: featureIdSchema,
  kind: z.enum(["provider", "source"]),
  name: z.string().min(1),
  description: z.string().min(1),
  requiredEnv: z.array(z.string().min(1)),
  missingEnv: z.array(z.string().min(1)),
  enabled: z.boolean(),
});

export type Feature = z.infer<typeof featureSchema>;

export const featureRegistrySchema = z.object({
  provider: z.object({
    copilot: featureSchema,
  }),
  sources: z.object({
    jiraJsm: featureSchema,
    github: featureSchema,
    coralogix: featureSchema,
    postgres: featureSchema,
  }),
});

export type FeatureRegistry = z.infer<typeof featureRegistrySchema>;

export function buildFeatures(env: NodeJS.ProcessEnv): FeatureRegistry {
  return featureRegistrySchema.parse({
    provider: {
      copilot: feature("provider:copilot", "provider", "GitHub Copilot", "LLM provider used by Hermes.", [
        "COPILOT_GITHUB_TOKEN",
      ], env),
    },
    sources: {
      jiraJsm: feature("source:jira-jsm", "source", "Jira/JSM", "Tickets and incident workflow through Jira MCP.", [
        "JIRA_MCP_URL",
        "JIRA_MCP_TOKEN",
      ], env),
      github: githubFeature(env),
      coralogix: feature("source:coralogix", "source", "Coralogix", "Logs, metrics, traces, and alerts through cx CLI.", [
        "CX_API_KEY",
        "CX_REGION",
      ], env),
      postgres: feature("source:postgres", "source", "Postgres", "Read-only database access through psql.", ["DATABASE_URL"], env),
    },
  });
}

export function requireFeatures(registry: FeatureRegistry, featureIds: FeatureId[]): void {
  const unavailable = featureIds.map((featureId) => getFeature(registry, featureId)).filter((feature) => !feature.enabled);
  if (unavailable.length === 0) {
    return;
  }

  const details = unavailable.map((feature) => {
    const missing = feature.missingEnv.length > 0 ? feature.missingEnv.join(", ") : "unknown";
    return `- ${feature.name}: missing ${missing}`;
  });
  throw new Error(["Required features are not configured:", ...details].join("\n"));
}

export function listFeatures(registry: FeatureRegistry): Feature[] {
  return [
    registry.provider.copilot,
    registry.sources.jiraJsm,
    registry.sources.github,
    registry.sources.coralogix,
    registry.sources.postgres,
  ];
}

function githubFeature(env: NodeJS.ProcessEnv): Feature {
  const hasToken = Boolean(env.GITHUB_TOKEN?.trim());
  const hasApp = hasGitHubAppCredentials(env);
  const missingEnv = hasToken || hasApp ? [] : ["GITHUB_TOKEN", ...missingGitHubAppCredentials(env)];

  return {
    id: "source:github",
    kind: "source",
    name: "GitHub",
    description: "Code, commits, deployments, PRs, and workflow runs through gh.",
    requiredEnv: ["GITHUB_TOKEN", "GITHUB_APP_ID", "GITHUB_APP_INSTALLATION_ID", "GITHUB_APP_PRIVATE_KEY"],
    missingEnv,
    enabled: missingEnv.length === 0,
  };
}

function getFeature(registry: FeatureRegistry, featureId: FeatureId): Feature {
  switch (featureId) {
    case "provider:copilot":
      return registry.provider.copilot;
    case "source:jira-jsm":
      return registry.sources.jiraJsm;
    case "source:github":
      return registry.sources.github;
    case "source:coralogix":
      return registry.sources.coralogix;
    case "source:postgres":
      return registry.sources.postgres;
  }
}

function feature(
  id: FeatureId,
  kind: Feature["kind"],
  name: string,
  description: string,
  requiredEnv: string[],
  env: NodeJS.ProcessEnv,
): Feature {
  const missingEnv = requiredEnv.filter((name) => !env[name]?.trim());
  return {
    id,
    kind,
    name,
    description,
    requiredEnv,
    missingEnv,
    enabled: missingEnv.length === 0,
  };
}

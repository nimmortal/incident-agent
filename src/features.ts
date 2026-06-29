import { z } from "zod";

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
      copilot: copilotFeature(env),
    },
    sources: {
      jiraJsm: feature("source:jira-jsm", "source", "Jira/JSM", "Tickets and incident workflow through Jira MCP.", [
        "JIRA_MCP_URL",
        "JIRA_MCP_TOKEN",
      ], env),
      github: feature("source:github", "source", "GitHub", "Code, commits, deployments, PRs, and workflow runs through gh.", [
        "GITHUB_TOKEN",
      ], env),
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

function copilotFeature(env: NodeJS.ProcessEnv): Feature {
  const missingEnv = env.COPILOT_GITHUB_TOKEN?.trim() ? [] : ["COPILOT_GITHUB_TOKEN"];

  return {
    id: "provider:copilot",
    kind: "provider",
    name: "GitHub Copilot",
    description: "LLM provider used by Hermes.",
    requiredEnv: ["COPILOT_GITHUB_TOKEN"],
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

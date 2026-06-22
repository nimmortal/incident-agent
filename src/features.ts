import { z } from "zod";

export const featureIdSchema = z.enum(["provider:copilot", "source:jira-jsm", "source:github", "source:coralogix"]);
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
      github: feature("source:github", "source", "GitHub", "Code, commits, deployments, PRs, and workflow runs through gh.", [
        "GITHUB_TOKEN",
      ], env),
      coralogix: feature("source:coralogix", "source", "Coralogix", "Logs, metrics, traces, and alerts through Coralogix MCP.", [
        "CORALOGIX_API_KEY",
        "CORALOGIX_DOMAIN",
      ], env),
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
  return [registry.provider.copilot, registry.sources.jiraJsm, registry.sources.github, registry.sources.coralogix];
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

import { z } from "zod";

export const confidenceSchema = z.enum(["low", "medium", "high"]);
export const investigationPhaseSchema = z.enum(["triage", "code", "evidence", "synthesis"]);

export const evidenceFactSchema = z.object({
  claim: z.string().min(1),
  source: z.string().min(1),
  locator: z.string().min(1).optional(),
  confidence: confidenceSchema,
});

export const investigationArtifactSchema = z.object({
  phase: investigationPhaseSchema,
  summary: z.string().min(1),
  confidence: confidenceSchema,
  identifiers: z.array(z.string().min(1)).default([]),
  facts: z.array(evidenceFactSchema).default([]),
  blockers: z.array(z.string().min(1)).default([]),
  nextChecks: z.array(z.string().min(1)).default([]),
});

export const stepStatusSchema = z.object({
  status: z.enum(["continue", "done", "blocked"]),
  summary: z.string().min(1),
  nextPrompt: z.string().min(1).optional(),
  blockedBy: z.string().min(1).optional(),
  evidenceRequest: z.string().min(1).optional(),
  artifact: investigationArtifactSchema.optional(),
}).superRefine((value, context) => {
  if (value.status === "continue" && !value.nextPrompt) {
    context.addIssue({ code: "custom", path: ["nextPrompt"], message: "continue status requires nextPrompt" });
  }
  if (value.status === "blocked" && !value.blockedBy) {
    context.addIssue({ code: "custom", path: ["blockedBy"], message: "blocked status requires blockedBy" });
  }
});

export type InvestigationArtifact = z.infer<typeof investigationArtifactSchema>;
export type StepStatus = z.infer<typeof stepStatusSchema>;

export function parseTaggedStatus(output: string, scope: "goal" | "phase"): StepStatus | undefined {
  const tag = scope === "goal" ? "incident-agent-goal-status" : "incident-agent-phase-status";
  const matches = [...output.matchAll(new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`, "g"))];
  const payload = matches.at(-1)?.[1]?.trim();
  if (!payload) {
    return undefined;
  }
  try {
    return stepStatusSchema.parse(JSON.parse(stripJsonFence(payload)));
  } catch {
    return undefined;
  }
}

function stripJsonFence(value: string): string {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

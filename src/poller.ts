import { loadSettings, validateSettings } from "./config.ts";
import { requireFeatures } from "./features.ts";
import { buildHermesEnvironment } from "./hermes-config.ts";
import { HermesRunner } from "./hermes-runner.ts";
import { runPollCycle } from "./polling.ts";
import { requireCopilotAuthUsable, requireCopilotTokenSupported, requireRuntimeForSkills } from "./runtime-preflight.ts";
import { optionalSourceSkills, wrapperSkills } from "./skill-sets.ts";

async function main(): Promise<void> {
  const settings = loadSettings();
  validateSettings(settings);
  requireFeatures(settings.features, ["provider:copilot", "source:jira-jsm"]);
  requireCopilotTokenSupported();
  await requireCopilotAuthUsable();

  const skills = wrapperSkills(optionalSourceSkills(settings));
  const env = await buildHermesEnvironment(settings);
  requireRuntimeForSkills(settings, skills);
  const hermes = new HermesRunner(
    settings.hermesBin,
    settings.hermesArgs,
    settings.hermesTimeoutSeconds,
    settings.hermesIdleTimeoutSeconds,
    settings.hermesTerminateGraceSeconds,
    settings.hermesHeartbeatSeconds,
    env,
  );

  const controller = new AbortController();
  process.once("SIGINT", () => controller.abort());
  process.once("SIGTERM", () => controller.abort());
  let failures = 0;
  console.log("Starting supervised Jira polling loop");

  while (!controller.signal.aborted) {
    try {
      await runPollCycle(settings, hermes, skills);
      failures = 0;
    } catch (error) {
      failures += 1;
      console.error(`[incident-agent] Poll cycle failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    const baseDelay = settings.jiraPollIntervalSeconds * 1000;
    const delay = failures === 0
      ? baseDelay
      : Math.min(baseDelay * 2 ** Math.min(failures - 1, 10), settings.jiraPollMaxBackoffSeconds * 1000);
    if (!controller.signal.aborted) {
      console.error(`[incident-agent] Next poll in ${Math.round(delay / 1000)}s`);
      await wait(delay, controller.signal);
    }
  }
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolveWait) => {
    const timer = setTimeout(resolveWait, milliseconds);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolveWait();
    }, { once: true });
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

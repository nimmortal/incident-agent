import { loadSettings, validateSettings } from "./config.ts";
import { HermesRunner } from "./hermes-runner.ts";
import { pollPrompt } from "./prompts.ts";

async function main(): Promise<void> {
  const settings = loadSettings();
  validateSettings(settings);
  const hermes = new HermesRunner(settings.hermesBin, settings.hermesArgs, settings.hermesTimeoutSeconds);

  console.log("Starting Hermes-driven Jira polling loop");
  for (;;) {
    try {
      const result = await hermes.run(pollPrompt(settings));
      console.log(result);
    } catch (error) {
      console.error("Polling cycle failed", error);
    }

    await sleep(settings.jiraPollIntervalSeconds * 1000);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

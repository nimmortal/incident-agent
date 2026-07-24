import type { Settings } from "./config.ts";
import type { HermesRunner } from "./hermes-runner.ts";
import { loadPollState, parsePollBatch, pollStatePromptContext, savePollBatch, withPollStateLease } from "./poll-state.ts";
import { pollPrompt } from "./prompts.ts";
import { skillArgs } from "./skill-sets.ts";

export async function runPollCycle(
  settings: Settings,
  hermes: HermesRunner,
  skills: string[],
  options: { streamOutput?: boolean } = {},
): Promise<void> {
  await withPollStateLease(settings, async () => {
    const state = loadPollState(settings);
    const output = await hermes.run(pollPrompt(settings, pollStatePromptContext(state)), skillArgs(skills), options);
    const batch = parsePollBatch(output);
    if (!batch) {
      throw new Error("Hermes polling output did not include a valid <incident-agent-poll-status> block; poll state was not advanced");
    }
    savePollBatch(settings, state, batch);
    const investigated = batch.tickets.filter((ticket) => ticket.outcome === "investigated").length;
    const pendingRetry = batch.tickets.filter((ticket) => ticket.outcome === "blocked" || ticket.outcome === "failed").length;
    console.error(`[incident-agent] Poll state updated: ${batch.tickets.length} considered, ${investigated} investigated, ${pendingRetry} pending retry`);
    if (batch.tickets.some((ticket) => ticket.outcome === "failed")) {
      throw new Error("One or more Jira candidates failed and remain uncheckpointed for retry");
    }
  });
}

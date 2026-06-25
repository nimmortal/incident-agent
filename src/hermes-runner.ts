import { spawn } from "node:child_process";

import { copilotAuthFailureHint } from "./runtime-preflight.ts";

const outputTailLimit = 8_000;

export class HermesRunner {
  constructor(
    private readonly binary: string,
    private readonly args: string[],
    private readonly timeoutSeconds: number,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  run(prompt: string, extraArgs: string[] = [], options: HermesRunOptions = {}): Promise<string> {
    return new Promise((resolve, reject) => {
      const baseArgs = withoutQueryFlag(options.streamOutput ? withoutQuietFlag(this.args) : this.args);
      const args = [...baseArgs, ...extraArgs, ...sessionArgs(options), "-q", prompt];
      console.error(`[incident-agent] Starting Hermes: ${displayCommand(this.binary, args)}`);

      const child = spawn(this.binary, args, {
        env: this.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`Hermes timed out after ${this.timeoutSeconds} seconds`));
      }, this.timeoutSeconds * 1000);

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      let outputTail = "";
      child.stdout.on("data", (chunk) => {
        process.stdout.write(chunk);
        outputTail = appendOutputTail(outputTail, chunk);
      });
      child.stderr.on("data", (chunk) => {
        process.stderr.write(chunk);
        outputTail = appendOutputTail(outputTail, chunk);
      });
      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error([`Hermes exited with code ${code}. Output was streamed above.`, copilotAuthFailureHint(outputTail)].filter(Boolean).join("\n\n")));
          return;
        }
        resolve("");
      });
    });
  }
}

export interface HermesRunOptions {
  continueSession?: boolean | string;
  resumeSessionId?: string;
  streamOutput?: boolean;
}

function sessionArgs(options: HermesRunOptions): string[] {
  if (options.resumeSessionId && options.continueSession) {
    throw new Error("Use either --session or --continue-session, not both");
  }
  if (options.resumeSessionId) {
    return ["--resume", options.resumeSessionId];
  }
  if (typeof options.continueSession === "string") {
    return ["--continue", options.continueSession];
  }
  if (options.continueSession) {
    return ["--continue"];
  }
  return [];
}

function appendOutputTail(current: string, chunk: string): string {
  const next = current + chunk;
  return next.length > outputTailLimit ? next.slice(-outputTailLimit) : next;
}

function withoutQueryFlag(args: string[]): string[] {
  const normalized: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "-q" || arg === "--query") {
      const next = args[index + 1];
      if (next && !next.startsWith("-")) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith("--query=")) {
      continue;
    }
    normalized.push(arg);
  }

  return normalized;
}

function withoutQuietFlag(args: string[]): string[] {
  return args.filter((arg) => arg !== "--quiet" && arg !== "-Q");
}

function displayCommand(binary: string, args: string[]): string {
  const redacted: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    redacted.push(arg);
    if (arg === "-q" || arg === "--query") {
      if (args[index + 1]) {
        redacted.push("<prompt>");
        index += 1;
      }
    }
  }

  return [binary, ...redacted].map(shellish).join(" ");
}

function shellish(value: string): string {
  return /^[A-Za-z0-9_./:=,@+-]+$/.test(value) ? value : JSON.stringify(value);
}

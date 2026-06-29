import { spawn } from "node:child_process";

import { copilotAuthFailureHint } from "./runtime-preflight.ts";

const outputTailLimit = 8_000;
const capturedOutputLimit = 64_000;

export class HermesRunner {
  constructor(
    private readonly binary: string,
    private readonly args: string[],
    private readonly maxRuntimeSeconds: number,
    private readonly heartbeatSeconds: number,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  run(prompt: string, extraArgs: string[] = [], options: HermesRunOptions = {}): Promise<string> {
    return new Promise((resolve, reject) => {
      const baseArgs = withoutQueryFlag(options.streamOutput ? withoutQuietFlag(this.args) : this.args);
      const args = [...baseArgs, ...extraArgs, ...sessionArgs(options), "-q", prompt];
      console.error(`[incident-agent] Starting Hermes: ${displayCommand(this.binary, args)}`);
      const startedAt = Date.now();
      let lastOutputAt = startedAt;
      let settled = false;
      let timedOut = false;
      let forceKillTimer: NodeJS.Timeout | undefined;

      const child = spawn(this.binary, args, {
        env: this.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let outputTail = "";
      let capturedOutput = "";

      const stopTimers = (): void => {
        clearTimeout(maxRuntimeTimer);
        clearInterval(heartbeatTimer);
        if (forceKillTimer) {
          clearTimeout(forceKillTimer);
        }
      };
      const rejectRun = (error: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        stopTimers();
        reject(error);
      };
      const resolveRun = (output: string): void => {
        if (settled) {
          return;
        }
        settled = true;
        stopTimers();
        resolve(output);
      };
      const observeOutput = (): void => {
        lastOutputAt = Date.now();
      };

      const maxRuntimeTimer = setTimeout(() => {
        timedOut = true;
        console.error(`[incident-agent] Hermes exceeded max runtime of ${this.maxRuntimeSeconds}s; stopping child process`);
        child.kill("SIGTERM");
        forceKillTimer = setTimeout(() => {
          child.kill("SIGKILL");
        }, 10_000);
      }, this.maxRuntimeSeconds * 1000);

      const heartbeatTimer = setInterval(() => {
        const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
        const idleSeconds = Math.floor((Date.now() - lastOutputAt) / 1000);
        console.error(`[incident-agent] Hermes still running after ${elapsedSeconds}s; last output ${idleSeconds}s ago`);
      }, this.heartbeatSeconds * 1000);

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        observeOutput();
        process.stdout.write(chunk);
        outputTail = appendOutputTail(outputTail, chunk);
        capturedOutput = appendCapturedOutput(capturedOutput, chunk);
      });
      child.stderr.on("data", (chunk) => {
        observeOutput();
        process.stderr.write(chunk);
        outputTail = appendOutputTail(outputTail, chunk);
      });
      child.on("error", (error) => {
        rejectRun(error);
      });
      child.on("close", (code) => {
        if (settled) {
          return;
        }
        if (timedOut) {
          rejectRun(
            new HermesRunError(`Hermes exceeded max runtime of ${this.maxRuntimeSeconds} seconds`, {
              timedOut: true,
              output: capturedOutput.trim(),
              outputTail,
            }),
          );
          return;
        }
        if (code !== 0) {
          rejectRun(
            new HermesRunError(
              [`Hermes exited with code ${code}. Output was streamed above.`, copilotAuthFailureHint(outputTail)]
                .filter(Boolean)
                .join("\n\n"),
              {
                exitCode: code ?? undefined,
                output: capturedOutput.trim(),
                outputTail,
              },
            ),
          );
          return;
        }
        resolveRun(capturedOutput.trim());
      });
    });
  }

  runInteractive(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      console.error(`[incident-agent] Starting Hermes: ${displayCommand(this.binary, args)}`);

      const child = spawn(this.binary, args, {
        env: this.env,
        stdio: "inherit",
      });

      child.on("error", (error) => {
        reject(error);
      });
      child.on("close", (code) => {
        if (code !== 0) {
          reject(
            new HermesRunError(`Hermes exited with code ${code}.`, {
              exitCode: code ?? undefined,
            }),
          );
          return;
        }
        resolve();
      });
    });
  }
}

export class HermesRunError extends Error {
  readonly exitCode?: number;
  readonly timedOut: boolean;
  readonly output: string;
  readonly outputTail: string;

  constructor(message: string, options: HermesRunErrorOptions = {}) {
    super(message);
    this.name = "HermesRunError";
    this.exitCode = options.exitCode;
    this.timedOut = options.timedOut ?? false;
    this.output = options.output ?? "";
    this.outputTail = options.outputTail ?? "";
  }
}

interface HermesRunErrorOptions {
  exitCode?: number;
  timedOut?: boolean;
  output?: string;
  outputTail?: string;
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

function appendCapturedOutput(current: string, chunk: string): string {
  const next = current + chunk;
  return next.length > capturedOutputLimit ? next.slice(-capturedOutputLimit) : next;
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

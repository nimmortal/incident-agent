import { spawn } from "node:child_process";

export class HermesRunner {
  constructor(
    private readonly binary: string,
    private readonly args: string[],
    private readonly timeoutSeconds: number,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  run(prompt: string, extraArgs: string[] = []): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [...withoutQueryFlag(this.args), ...extraArgs, "-q", prompt];
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
      child.stdout.on("data", (chunk) => {
        process.stdout.write(chunk);
      });
      child.stderr.on("data", (chunk) => {
        process.stderr.write(chunk);
      });
      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(`Hermes exited with code ${code}. Output was streamed above.`));
          return;
        }
        resolve("");
      });
    });
  }
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

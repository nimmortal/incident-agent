import { spawn } from "node:child_process";

export class HermesRunner {
  constructor(
    private readonly binary: string,
    private readonly args: string[],
    private readonly timeoutSeconds: number,
  ) {}

  run(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.binary, [...this.args, prompt], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`Hermes timed out after ${this.timeoutSeconds} seconds`));
      }, this.timeoutSeconds * 1000);

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(`Hermes exited with code ${code}.\n\nstderr:\n${stderr.trim()}\n\nstdout:\n${stdout.trim()}`));
          return;
        }
        resolve(stdout.trim() || stderr.trim());
      });
    });
  }
}

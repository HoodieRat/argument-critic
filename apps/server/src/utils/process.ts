import { spawn, spawnSync } from "node:child_process";
import type { StdioOptions } from "node:child_process";

export interface SpawnProcessOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly windowsHide?: boolean;
  readonly detached?: boolean;
  readonly stdio?: StdioOptions;
}

export function isProcessRunning(processId: number): boolean {
  if (process.platform === "win32") {
    const result = spawnSync("tasklist", ["/FI", `PID eq ${processId}`, "/FO", "CSV", "/NH"], {
      windowsHide: true,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });

    if (result.status !== 0) {
      return false;
    }

    const output = result.stdout.trim();
    if (!output || output.startsWith("INFO:")) {
      return false;
    }

    return output.split("\n").some((line) => line.startsWith("\"") && line.includes(`\"${processId}\"`));
  }

  try {
    process.kill(processId, 0);
    return true;
  } catch {
    return false;
  }
}

export async function waitForProcessExit(processId: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessRunning(processId)) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return !isProcessRunning(processId);
}

export async function terminateProcessTree(processId: number, force: boolean): Promise<void> {
  if (!isProcessRunning(processId)) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise<void>((resolve, reject) => {
      const taskkill = spawn("taskkill", ["/PID", String(processId), "/T", ...(force ? ["/F"] : [])], {
        windowsHide: true,
        stdio: "ignore"
      });

      taskkill.once("error", reject);
      taskkill.once("exit", (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        if ((code === 128 || code === 255) && !isProcessRunning(processId)) {
          resolve();
          return;
        }

        reject(new Error(`taskkill failed with exit code ${code ?? -1}`));
      });
    });
    return;
  }

  process.kill(processId, force ? "SIGKILL" : "SIGTERM");
}

export function spawnProcess(command: string, args: string[], options: SpawnProcessOptions = {}) {
  return spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    detached: options.detached ?? false,
    windowsHide: options.windowsHide ?? true,
    stdio: options.stdio ?? "ignore"
  });
}
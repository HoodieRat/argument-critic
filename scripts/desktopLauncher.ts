import { createRequire } from "node:module";
import type { ChildProcess } from "node:child_process";

import type { Logger } from "../apps/server/src/logger.js";
import type { ProcessSupervisor } from "../apps/server/src/services/runtime/ProcessSupervisor.js";

const desktopPackageRequire = createRequire(new URL("../apps/desktop/package.json", import.meta.url));

export interface DesktopLauncherOptions {
  readonly logger: Logger;
  readonly processSupervisor: ProcessSupervisor;
}

export interface LaunchDesktopOptions {
  readonly electronMainPath: string;
  readonly apiBaseUrl: string;
}

export interface DesktopLaunchResult {
  readonly launched: true;
  readonly process: ChildProcess;
  readonly readyConfirmed: boolean;
}

class DesktopLauncher {
  public constructor(private readonly options: DesktopLauncherOptions) {}

  private async waitForShellReady(child: ChildProcess): Promise<boolean> {
    return await new Promise<boolean>((resolve, reject) => {
      const readyMarker = "[argument-critic-desktop] Renderer loaded.";
      let settled = false;
      let bufferedStdout = "";

      const settle = (value: boolean): void => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        resolve(value);
      };

      const timeout = setTimeout(() => settle(false), 4_000);

      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");

      child.stdout?.on("data", (chunk: string) => {
        bufferedStdout += chunk;
        process.stdout.write(chunk);
        if (bufferedStdout.includes(readyMarker)) {
          settle(true);
        }
      });

      child.stderr?.on("data", (chunk: string) => {
        process.stderr.write(chunk);
      });

      child.once("error", (error) => {
        if (settled) {
          return;
        }

        clearTimeout(timeout);
        reject(error);
      });

      child.once("exit", (code, signal) => {
        if (settled) {
          return;
        }

        clearTimeout(timeout);
        reject(new Error(`The desktop shell exited before it finished loading (code=${code ?? "null"}, signal=${signal ?? "null"}).`));
      });
    });
  }

  private resolveElectronBinary(): string {
    try {
      const executable = desktopPackageRequire("electron");
      if (typeof executable !== "string" || !executable.trim()) {
        throw new Error("Electron did not resolve to an executable path.");
      }

      return executable;
    } catch {
      throw new Error("Electron is not installed. Run `Install Argument Critic.cmd` or `corepack pnpm install` first.");
    }
  }

  public async launch(options: LaunchDesktopOptions): Promise<DesktopLaunchResult> {
    const executable = this.resolveElectronBinary();
    const child = await this.options.processSupervisor.spawn({
      command: executable,
      args: [options.electronMainPath, `--api-base-url=${options.apiBaseUrl}`],
      role: "desktop-shell",
      stdio: ["ignore", "pipe", "pipe"]
    });
    const readyConfirmed = await this.waitForShellReady(child);

    this.options.logger.info("Desktop shell launched", {
      executable,
      electronMainPath: options.electronMainPath,
      apiBaseUrl: options.apiBaseUrl,
      readyConfirmed
    });

    return {
      launched: true,
      process: child,
      readyConfirmed
    };
  }
}

export function createDesktopLauncher(options: DesktopLauncherOptions): DesktopLauncher {
  return new DesktopLauncher(options);
}
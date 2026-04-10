import { join } from "node:path";
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";

import { MANAGED_CHROME_MARKER } from "../../config/constants.js";
import type { EnvironmentConfig } from "../../config/env.js";
import type { Logger } from "../../logger.js";
import { ensureDirectory, writeJsonFile } from "../../utils/fs.js";
import type { ProcessSupervisor } from "./ProcessSupervisor.js";

const WINDOWS_CHROME_PATHS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Chromium/Application/chrome.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe"
];

export interface ChromeLauncherOptions {
  readonly logger: Logger;
  readonly config: EnvironmentConfig;
  readonly processSupervisor: ProcessSupervisor;
}

export interface LaunchChromeOptions {
  readonly extensionDistDir: string;
  readonly startupUrl: string;
}

export interface ChromeLaunchResult {
  readonly launched: boolean;
  readonly reason?: "missing-executable";
}

class ChromeLauncher {
  public constructor(private readonly options: ChromeLauncherOptions) {}

  private async resolveExecutable(): Promise<string | null> {
    if (this.options.config.chromeExecutable) {
      return this.options.config.chromeExecutable;
    }

    for (const candidate of WINDOWS_CHROME_PATHS) {
      try {
        await access(candidate, fsConstants.X_OK);
        return candidate;
      } catch {
        continue;
      }
    }

    return null;
  }

  public async launch(options: LaunchChromeOptions): Promise<ChromeLaunchResult> {
    const executable = await this.resolveExecutable();
    if (!executable) {
      this.options.logger.warn("Managed Chrome launch skipped because no Chrome executable was found.");
      return {
        launched: false,
        reason: "missing-executable"
      };
    }

    const profileDir = join(this.options.config.dataDir, "runtime", "managed-chrome-profile");
    await ensureDirectory(profileDir);
    await writeJsonFile(join(profileDir, MANAGED_CHROME_MARKER), {
      executable,
      createdAt: new Date().toISOString(),
      managedBy: "argument-critic"
    });

    const args = [
      `--user-data-dir=${profileDir}`,
      `--disable-extensions-except=${options.extensionDistDir}`,
      `--load-extension=${options.extensionDistDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--new-window",
      options.startupUrl
    ];

    await this.options.processSupervisor.spawn({
      command: executable,
      args,
      role: "managed-chrome",
      managedProfileDir: profileDir
    });

    this.options.logger.info("Managed Chrome launched", { executable, profileDir, startupUrl: options.startupUrl });
    return { launched: true };
  }
}

export function createChromeLauncher(options: ChromeLauncherOptions): ChromeLauncher {
  return new ChromeLauncher(options);
}
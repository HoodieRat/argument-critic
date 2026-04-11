import { ChildProcess } from "node:child_process";
import type { StdioOptions } from "node:child_process";

import { GRACEFUL_SHUTDOWN_TIMEOUT_MS } from "../../config/constants.js";
import type { Logger } from "../../logger.js";
import { removePath } from "../../utils/fs.js";
import { readJsonFile, writeJsonFile } from "../../utils/fs.js";
import { isProcessRunning, spawnProcess, terminateProcessTree, waitForProcessExit } from "../../utils/process.js";

export interface OwnedProcessRecord {
  readonly pid: number;
  readonly role: string;
  readonly command: string;
  readonly args: string[];
  readonly startedAt: string;
  readonly safeToTerminate: boolean;
  readonly managedProfileDir?: string;
}

export interface CreateProcessSupervisorOptions {
  readonly registryPath: string;
  readonly logger: Logger;
}

export interface SpawnOwnedProcessOptions {
  readonly command: string;
  readonly args: string[];
  readonly role: string;
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly stdio?: StdioOptions;
  readonly managedProfileDir?: string;
  readonly safeToTerminate?: boolean;
}

class ProcessSupervisor {
  private readonly registry = new Map<number, OwnedProcessRecord>();

  public constructor(private readonly options: CreateProcessSupervisorOptions) {}

  public async hydrate(): Promise<void> {
    const savedRecords = await readJsonFile<OwnedProcessRecord[]>(this.options.registryPath);
    for (const record of savedRecords ?? []) {
      if (isProcessRunning(record.pid)) {
        this.registry.set(record.pid, record);
      }
    }

    await this.persist();
  }

  public list(): OwnedProcessRecord[] {
    return Array.from(this.registry.values()).sort((left, right) => left.startedAt.localeCompare(right.startedAt));
  }

  public async register(record: OwnedProcessRecord): Promise<void> {
    this.registry.set(record.pid, record);
    await this.persist();
  }

  public async unregister(processId: number): Promise<void> {
    this.registry.delete(processId);
    await this.persist();
  }

  public async spawn(options: SpawnOwnedProcessOptions): Promise<ChildProcess> {
    const child = spawnProcess(options.command, options.args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      stdio: options.stdio
    });

    if (child.pid == null) {
      throw new Error(`Failed to spawn ${options.role}.`);
    }

    const record: OwnedProcessRecord = {
      pid: child.pid,
      role: options.role,
      command: options.command,
      args: options.args,
      startedAt: new Date().toISOString(),
      safeToTerminate: options.safeToTerminate ?? true,
      managedProfileDir: options.managedProfileDir
    };

    await this.register(record);

    child.once("exit", () => {
      void this.unregister(record.pid);
    });

    return child;
  }

  public async shutdownAll(reason: string): Promise<void> {
    const records = this.list().reverse();
    for (const record of records) {
      if (!record.safeToTerminate) {
        continue;
      }

      try {
        await terminateProcessTree(record.pid, false);
        const exitedGracefully = await waitForProcessExit(record.pid, GRACEFUL_SHUTDOWN_TIMEOUT_MS);
        if (!exitedGracefully) {
          this.options.logger.warn("Escalating process shutdown", { pid: record.pid, role: record.role, reason });
          await terminateProcessTree(record.pid, true);
          await waitForProcessExit(record.pid, GRACEFUL_SHUTDOWN_TIMEOUT_MS * 2);
        }
      } catch (error) {
        this.options.logger.warn("Process shutdown failed", {
          pid: record.pid,
          role: record.role,
          reason,
          error: error instanceof Error ? error.message : String(error)
        });
        await terminateProcessTree(record.pid, true);
        await waitForProcessExit(record.pid, GRACEFUL_SHUTDOWN_TIMEOUT_MS * 2);
      } finally {
        if (record.managedProfileDir) {
          try {
            await removePath(record.managedProfileDir);
          } catch (error) {
            this.options.logger.warn("Managed browser profile cleanup failed", {
              pid: record.pid,
              role: record.role,
              managedProfileDir: record.managedProfileDir,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
      }
    }

    this.registry.clear();
    await this.persist();
  }

  public async persist(): Promise<void> {
    await writeJsonFile(this.options.registryPath, this.list());
  }
}

export function createProcessSupervisor(options: CreateProcessSupervisorOptions): ProcessSupervisor {
  return new ProcessSupervisor(options);
}

export type { ProcessSupervisor };
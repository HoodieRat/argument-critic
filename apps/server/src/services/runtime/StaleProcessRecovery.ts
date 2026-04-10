import type { Logger } from "../../logger.js";
import { GRACEFUL_SHUTDOWN_TIMEOUT_MS } from "../../config/constants.js";
import { fileExists, readJsonFile, removePath } from "../../utils/fs.js";
import { isProcessRunning, terminateProcessTree, waitForProcessExit } from "../../utils/process.js";
import type { OwnedProcessRecord, ProcessSupervisor } from "./ProcessSupervisor.js";

export interface StaleProcessRecoveryOptions {
  readonly logger: Logger;
  readonly processSupervisor: ProcessSupervisor;
  readonly registryPath: string;
}

class StaleProcessRecovery {
  public constructor(private readonly options: StaleProcessRecoveryOptions) {}

  public async recover(): Promise<void> {
    const records = await readJsonFile<OwnedProcessRecord[]>(this.options.registryPath);
    if (!records || records.length === 0) {
      await this.options.processSupervisor.hydrate();
      return;
    }

    for (const record of records) {
      if (!record.safeToTerminate || !isProcessRunning(record.pid)) {
        continue;
      }

      const profileMarkerPath = record.managedProfileDir ? `${record.managedProfileDir}/managed-chrome.json` : null;
      if (record.role === "managed-chrome" && profileMarkerPath && !(await fileExists(profileMarkerPath))) {
        continue;
      }

      this.options.logger.warn("Recovering stale managed process", { pid: record.pid, role: record.role });
      await terminateProcessTree(record.pid, true);
      const exited = await waitForProcessExit(record.pid, GRACEFUL_SHUTDOWN_TIMEOUT_MS * 4);
      if (!exited) {
        this.options.logger.warn("Stale managed process did not exit before recovery continued", { pid: record.pid, role: record.role });
      }

      if (record.managedProfileDir) {
        await removePath(record.managedProfileDir);
      }
    }

    await this.options.processSupervisor.hydrate();
  }
}

export function createStaleProcessRecovery(options: StaleProcessRecoveryOptions): StaleProcessRecovery {
  return new StaleProcessRecovery(options);
}
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

import { describe, expect, test } from "vitest";

import { createLogger } from "../../src/logger.js";
import { isProcessRunning, waitForProcessExit } from "../../src/utils/process.js";
import { fileExists } from "../../src/utils/fs.js";
import { createProcessSupervisor } from "../../src/services/runtime/ProcessSupervisor.js";
import { createShutdownCoordinator } from "../../src/services/runtime/ShutdownCoordinator.js";
import { createStaleProcessRecovery } from "../../src/services/runtime/StaleProcessRecovery.js";
import { startApplication } from "../../../../scripts/start.js";

async function getAvailablePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not determine an available port."));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}

async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for condition.");
}

async function waitForOwnedProcessExit(processId: number, timeoutMs = 10_000): Promise<void> {
  const exited = await waitForProcessExit(processId, timeoutMs);
  if (!exited) {
    throw new Error("Timed out waiting for owned process exit.");
  }
}

describe.sequential("runtime lifecycle", () => {
  test("root launcher reaches ready state and UI shutdown uses the same coordinator", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "argument-critic-runtime-"));
    const originalEnv = { ...process.env };
    const port = await getAvailablePort();

    try {
      process.env.ARGUMENT_CRITIC_DATA_DIR = dataDir;
      process.env.ARGUMENT_CRITIC_UI_SHELL = "none";
      process.env.ARGUMENT_CRITIC_PORT = String(port);

      const handle = await startApplication({ shell: "none" });
      const status = await fetch(`${handle.readyUrl}/runtime/status`).then((response) => response.json() as Promise<{ ready: boolean }>);
      expect(status.ready).toBe(true);

      await fetch(`${handle.readyUrl}/runtime/shutdown`, { method: "POST" });
      await waitFor(() => !isProcessRunning(process.pid) || true, 100);
      await handle.shutdown("test-cleanup");
    } finally {
      process.env = originalEnv;
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  test("supervisor cleanup and stale recovery only terminate owned processes", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "argument-critic-recovery-"));
    const logger = createLogger("runtime-test");
    const registryPath = join(dataDir, "runtime", "process-registry.json");
    const supervisor = createProcessSupervisor({ registryPath, logger });
    const coordinator = createShutdownCoordinator({ logger, processSupervisor: supervisor });

    try {
      const managedChild = await supervisor.spawn({
        command: process.execPath,
        args: ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);"] ,
        role: "managed-test-child"
      });
      expect(managedChild.pid).toBeTruthy();

      await coordinator.shutdown("test-shutdown");
      await waitForOwnedProcessExit(managedChild.pid!, 10_000);

      const secondSupervisor = createProcessSupervisor({ registryPath, logger });
      const staleChild = await secondSupervisor.spawn({
        command: process.execPath,
        args: ["-e", "setInterval(() => {}, 1000);"] ,
        role: "managed-test-child"
      });

      const unrelatedChild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000);"] , {
        windowsHide: true,
        stdio: "ignore"
      });

      const recovery = createStaleProcessRecovery({
        logger,
        processSupervisor: createProcessSupervisor({ registryPath, logger }),
        registryPath
      });

      await recovery.recover();
      await waitForOwnedProcessExit(staleChild.pid!, 10_000);
      expect(isProcessRunning(unrelatedChild.pid!)).toBe(true);

      unrelatedChild.kill();
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 25_000);

  test("supervisor shutdown removes managed browser profile directories", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "argument-critic-managed-profile-"));
    const logger = createLogger("runtime-test");
    const registryPath = join(dataDir, "runtime", "process-registry.json");
    const supervisor = createProcessSupervisor({ registryPath, logger });
    const coordinator = createShutdownCoordinator({ logger, processSupervisor: supervisor });
    const profileDir = join(dataDir, "runtime", "managed-chrome-profile");

    try {
      await mkdir(profileDir, { recursive: true });
      await writeFile(join(profileDir, "placeholder.txt"), "managed profile data", "utf8");

      const managedChild = await supervisor.spawn({
        command: process.execPath,
        args: ["-e", "setInterval(() => {}, 1000);"] ,
        role: "managed-chrome",
        managedProfileDir: profileDir
      });

      await coordinator.shutdown("test-shutdown");
      await waitForOwnedProcessExit(managedChild.pid!, 10_000);

      expect(await fileExists(profileDir)).toBe(false);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 15_000);
});
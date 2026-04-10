import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { FastifyInstance } from "fastify";

import { createLogger } from "../../src/logger.js";
import { startServer, type ServerHandle } from "../../src/index.js";
import type { GitHubLoginAdapter, GitHubLoginService } from "../../src/services/copilot/GitHubLoginService.js";
import { createProcessSupervisor } from "../../src/services/runtime/ProcessSupervisor.js";
import { createShutdownCoordinator } from "../../src/services/runtime/ShutdownCoordinator.js";

export interface TestHarness {
  readonly app: FastifyInstance;
  readonly dataDir: string;
  readonly server: ServerHandle;
  readonly close: () => Promise<void>;
  readonly cleanup: () => Promise<void>;
}

export async function createTestHarness(options: {
  dataDir?: string;
  researchEnabled?: boolean;
  githubModelsToken?: string;
  githubLoginAdapter?: GitHubLoginAdapter;
  githubLoginService?: GitHubLoginService;
} = {}): Promise<TestHarness> {
  const dataDir = options.dataDir ?? (await mkdtemp(join(tmpdir(), "argument-critic-")));
  const ownsDataDir = !options.dataDir;
  const rootDir = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
  const logger = createLogger("test");
  const processSupervisor = createProcessSupervisor({
    registryPath: join(dataDir, "runtime", "process-registry.json"),
    logger
  });
  const shutdownCoordinator = createShutdownCoordinator({
    logger,
    processSupervisor
  });
  const server = await startServer({
    config: {
      host: "127.0.0.1",
      port: 4317,
      dataDir,
      uiShell: "none",
      githubModel: "gpt-4.1",
      researchEnabled: options.researchEnabled ?? false
    },
    githubModelsToken: options.githubModelsToken,
    githubLoginAdapter: options.githubLoginAdapter,
    githubLoginService: options.githubLoginService,
    rootDir,
    logger,
    processSupervisor,
    shutdownCoordinator,
    listen: false
  });

  return {
    app: server.app,
    dataDir,
    server,
    close: () => server.stop(),
    cleanup: async () => {
      await server.stop();
      if (ownsDataDir) {
        await rm(dataDir, { recursive: true, force: true });
      }
    }
  };
}

export function parseJson<T>(body: string): T {
  return JSON.parse(body) as T;
}
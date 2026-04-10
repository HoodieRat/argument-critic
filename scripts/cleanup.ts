import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { getEnvironmentConfig } from "../apps/server/src/config/env.js";
import { createLogger } from "../apps/server/src/logger.js";
import { createProcessSupervisor } from "../apps/server/src/services/runtime/ProcessSupervisor.js";
import { createStaleProcessRecovery } from "../apps/server/src/services/runtime/StaleProcessRecovery.js";

const modulePath = fileURLToPath(import.meta.url);
const rootDir = resolve(dirname(modulePath), "..");

async function main(): Promise<void> {
  const config = getEnvironmentConfig(rootDir);
  const logger = createLogger("cleanup");
  const processSupervisor = createProcessSupervisor({
    registryPath: join(config.dataDir, "runtime", "process-registry.json"),
    logger
  });

  const recovery = createStaleProcessRecovery({
    logger,
    processSupervisor,
    registryPath: join(config.dataDir, "runtime", "process-registry.json")
  });

  await recovery.recover();
  process.stdout.write("Argument Critic cleanup finished.\n");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
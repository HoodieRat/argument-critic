import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { createChromeLauncher } from "../apps/server/src/services/runtime/ChromeLauncher.js";
import { createProcessSupervisor } from "../apps/server/src/services/runtime/ProcessSupervisor.js";
import { createShutdownCoordinator } from "../apps/server/src/services/runtime/ShutdownCoordinator.js";
import { createStaleProcessRecovery } from "../apps/server/src/services/runtime/StaleProcessRecovery.js";
import { getEnvironmentConfig, getEnvironmentSecrets, type UiShell } from "../apps/server/src/config/env.js";
import { createLogger } from "../apps/server/src/logger.js";
import { startServer } from "../apps/server/src/index.js";
import { createDesktopLauncher } from "./desktopLauncher.js";

const modulePath = fileURLToPath(import.meta.url);
const rootDir = resolve(dirname(modulePath), "..");

export interface ApplicationHandle {
  readonly readyUrl: string;
  readonly uiShell: UiShell;
  readonly shellLaunched: boolean;
  readonly shellReadyConfirmed: boolean;
  readonly reusedExistingServer: boolean;
  readonly shutdown: (reason?: string) => Promise<void>;
}

export interface StartApplicationOptions {
  readonly shell?: UiShell;
}

function hasBuiltExtension(extensionDistDir: string): boolean {
  return existsSync(join(extensionDistDir, "manifest.json")) && existsSync(join(extensionDistDir, "sidepanel.html"));
}

function hasBuiltDesktop(rootPath: string): boolean {
  return [
    join(rootPath, "apps", "desktop", "dist", "electron", "main.js"),
    join(rootPath, "apps", "desktop", "dist", "electron", "preload.js"),
    join(rootPath, "apps", "desktop", "dist", "renderer", "index.html"),
    join(rootPath, "apps", "desktop", "dist", "renderer", "crop-overlay.html")
  ].every((candidate) => existsSync(candidate));
}

async function ensureRuntimeDirectories(dataDir: string): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await mkdir(join(dataDir, "attachments"), { recursive: true });
  await mkdir(join(dataDir, "reports"), { recursive: true });
  await mkdir(join(dataDir, "research-imports"), { recursive: true });
  await mkdir(join(dataDir, "runtime"), { recursive: true });
}

function ensureShellBuildReady(shell: UiShell): { extensionDistDir?: string; electronMainPath?: string } {
  if (shell === "none") {
    return {};
  }

  if (shell === "desktop") {
    if (!hasBuiltDesktop(rootDir)) {
      throw new Error("The desktop build output is missing. Run `Install Argument Critic.cmd` or `corepack pnpm build` first.");
    }

    return {
      electronMainPath: join(rootDir, "apps", "desktop", "dist", "electron", "main.js")
    };
  }

  const extensionDistDir = join(rootDir, "apps", "extension", "dist");
  if (!hasBuiltExtension(extensionDistDir)) {
    throw new Error("The legacy extension build output is missing. Run `corepack pnpm run build:legacy-extension` first if you still need it.");
  }

  return { extensionDistDir };
}

function isAddressInUseError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("EADDRINUSE");
}

async function isArgumentCriticAlreadyRunning(readyUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${readyUrl}/health`, {
      signal: AbortSignal.timeout(1_000)
    });
    if (!response.ok) {
      return false;
    }

    const payload = (await response.json()) as { ok?: boolean; app?: string };
    return payload.ok === true && payload.app === "argument-critic";
  } catch {
    return false;
  }
}

export async function startApplication(options: StartApplicationOptions = {}): Promise<ApplicationHandle> {
  const logger = createLogger("launcher");
  const config = getEnvironmentConfig(rootDir);
  const environmentSecrets = getEnvironmentSecrets(rootDir);
  const readyUrl = `http://${config.host}:${config.port}`;
  const uiShell = options.shell ?? config.uiShell;

  await ensureRuntimeDirectories(config.dataDir);

  const processSupervisor = createProcessSupervisor({
    registryPath: join(config.dataDir, "runtime", "process-registry.json"),
    logger
  });
  const shutdownCoordinator = createShutdownCoordinator({
    logger,
    processSupervisor
  });
  const staleProcessRecovery = createStaleProcessRecovery({
    logger,
    processSupervisor,
    registryPath: join(config.dataDir, "runtime", "process-registry.json")
  });

  await staleProcessRecovery.recover();
  const shellBuild = ensureShellBuildReady(uiShell);
  let serverHandle: Awaited<ReturnType<typeof startServer>> | null = null;
  let reusedExistingServer = false;

  try {
    serverHandle = await startServer({
      config,
      githubModelsToken: environmentSecrets.githubModelsToken,
      rootDir,
      logger,
      processSupervisor,
      shutdownCoordinator
    });

    shutdownCoordinator.registerHook("server.close", async () => {
      await serverHandle?.stop();
    });
  } catch (error) {
    if (!isAddressInUseError(error)) {
      throw error;
    }

    if (!(await isArgumentCriticAlreadyRunning(readyUrl))) {
      throw new Error(
        `Argument Critic could not start because port ${config.port} is already in use by another process. Close the program using that port or set ARGUMENT_CRITIC_PORT to a different port.`
      );
    }

    reusedExistingServer = true;
    logger.info("Argument Critic is already running; reusing the existing local companion.", { readyUrl });
  }

  let shellLaunched = false;
  let shellReadyConfirmed = false;
  const startupUrl = serverHandle?.readyUrl ?? readyUrl;

  if (uiShell === "desktop") {
    const desktopLauncher = createDesktopLauncher({
      logger,
      processSupervisor
    });
    const result = await desktopLauncher.launch({
      electronMainPath: shellBuild.electronMainPath!,
      apiBaseUrl: startupUrl
    });
    shellLaunched = result.launched;
    shellReadyConfirmed = result.readyConfirmed;

    if (!reusedExistingServer) {
      result.process.once("exit", () => {
        void shutdownCoordinator.shutdown("desktop-shell-exit");
      });
    }
  }

  if (uiShell === "extension") {
    const chromeLauncher = createChromeLauncher({
      logger,
      config,
      processSupervisor
    });
    const result = await chromeLauncher.launch({
      extensionDistDir: shellBuild.extensionDistDir!,
      startupUrl
    });
    shellLaunched = result.launched;
    shellReadyConfirmed = result.launched;

    if (!result.launched && result.reason === "missing-executable") {
      process.stdout.write("The legacy browser helper was skipped because Chrome or Edge was not found. Install Chrome or Edge if you still need the extension-based helper flow.\n");
    }
  }

  const handleSignal = (signal: string): void => {
    void shutdownCoordinator.shutdown(`signal:${signal}`);
  };

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"] as const) {
    process.on(signal, handleSignal);
  }
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception", { error: error instanceof Error ? error.message : String(error) });
    void shutdownCoordinator.shutdown("uncaughtException");
  });
  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection", { reason: reason instanceof Error ? reason.message : String(reason) });
    void shutdownCoordinator.shutdown("unhandledRejection");
  });

  logger.info("Argument Critic is ready", {
    readyUrl: startupUrl,
    uiShell,
    shellLaunched,
    shellReadyConfirmed,
    reusedExistingServer
  });

  return {
    readyUrl: startupUrl,
    uiShell,
    shellLaunched,
    shellReadyConfirmed,
    reusedExistingServer,
    shutdown: async (reason?: string) => shutdownCoordinator.shutdown(reason ?? "manual")
  };
}

async function runCli(): Promise<void> {
  const handle = await startApplication();
  process.stdout.write(`Argument Critic ready at ${handle.readyUrl}\n`);
  if (handle.reusedExistingServer) {
    process.stdout.write("Argument Critic was already running, so this launch reused the existing local companion.\n");
  }
  if (handle.shellLaunched && handle.uiShell === "desktop" && handle.shellReadyConfirmed) {
    process.stdout.write("Argument Critic opened in the desktop drawer window.\n");
  }
  if (handle.shellLaunched && handle.uiShell === "desktop" && !handle.shellReadyConfirmed) {
    process.stdout.write("The desktop shell was started, but it did not confirm that the window finished loading yet. If the drawer did not appear, check the terminal for desktop-shell errors.\n");
  }
  if (handle.shellLaunched && handle.uiShell === "extension") {
    process.stdout.write("The legacy browser helper opened in a managed Chrome profile.\n");
  }
  await new Promise<void>((resolve) => {
    const onExit = (): void => resolve();
    process.once("beforeExit", onExit);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === modulePath) {
  runCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { app, BrowserWindow, clipboard, desktopCapturer, ipcMain, screen, shell } from "electron";

type CropBounds = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

type Bounds = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

type PendingCropSelection = {
  readonly overlay: BrowserWindow;
  readonly dataUrl: string;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly displayBounds: Bounds;
  readonly resolve: (bounds: CropBounds) => void;
  readonly reject: (error: Error) => void;
  completed: boolean;
};

type BundledRuntimeHandle = {
  readonly readyUrl: string;
  readonly shutdown: (reason: string) => Promise<void>;
};

const modulePath = fileURLToPath(import.meta.url);
const electronDistDir = dirname(modulePath);
const rendererDistDir = join(electronDistDir, "..", "renderer");
const preloadPath = join(electronDistDir, "preload.js");

let mainWindow: BrowserWindow | null = null;
let bundledRuntime: BundledRuntimeHandle | null = null;
let bundledRuntimeShutdownInProgress = false;

const pendingCropSelections = new Map<string, PendingCropSelection>();

function getLaunchArgument(name: string): string | null {
  const prefix = `${name}=`;
  for (const argument of process.argv.slice(2)) {
    if (argument.startsWith(prefix)) {
      return argument.slice(prefix.length);
    }
  }

  return null;
}

function resolveApplicationRootDir(): string {
  return resolve(electronDistDir, "..", "..", "..", "..");
}

function resolveWindowIconPath(): string | undefined {
  const candidates = [
    join(resolveApplicationRootDir(), "build", "icon.png"),
    join(process.resourcesPath, "icon.png"),
    join(process.resourcesPath, "build", "icon.png"),
    join(process.resourcesPath, "app.asar", "build", "icon.png")
  ];

  return candidates.find((candidate) => existsSync(candidate));
}

async function findAvailablePort(): Promise<number> {
  return await new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.unref();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not allocate a local port for the bundled runtime.")));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolvePort(address.port);
      });
    });
  });
}

async function startBundledRuntime(): Promise<BundledRuntimeHandle> {
  const rootDir = resolveApplicationRootDir();
  const dataDir = join(app.getPath("userData"), "data");
  const port = await findAvailablePort();

  process.env.ARGUMENT_CRITIC_UI_SHELL = "none";
  process.env.ARGUMENT_CRITIC_DATA_DIR = dataDir;
  process.env.ARGUMENT_CRITIC_PORT = String(port);

  const [envModule, indexModule, loggerModule, supervisorModule, shutdownModule, staleModule] = await Promise.all([
    import(pathToFileURL(join(rootDir, "apps", "server", "dist", "config", "env.js")).toString()),
    import(pathToFileURL(join(rootDir, "apps", "server", "dist", "index.js")).toString()),
    import(pathToFileURL(join(rootDir, "apps", "server", "dist", "logger.js")).toString()),
    import(pathToFileURL(join(rootDir, "apps", "server", "dist", "services", "runtime", "ProcessSupervisor.js")).toString()),
    import(pathToFileURL(join(rootDir, "apps", "server", "dist", "services", "runtime", "ShutdownCoordinator.js")).toString()),
    import(pathToFileURL(join(rootDir, "apps", "server", "dist", "services", "runtime", "StaleProcessRecovery.js")).toString())
  ]);

  const config = envModule.getEnvironmentConfig(rootDir);
  const secrets = envModule.getEnvironmentSecrets(rootDir);
  const logger = loggerModule.createLogger("desktop-runtime");
  const registryPath = join(config.dataDir, "runtime", "process-registry.json");
  const processSupervisor = supervisorModule.createProcessSupervisor({
    registryPath,
    logger
  });
  const shutdownCoordinator = shutdownModule.createShutdownCoordinator({
    logger,
    processSupervisor
  });
  const staleProcessRecovery = staleModule.createStaleProcessRecovery({
    logger,
    processSupervisor,
    registryPath
  });

  await staleProcessRecovery.recover();

  shutdownCoordinator.registerHook("desktop.app.quit", async () => {
    bundledRuntimeShutdownInProgress = true;
    app.quit();
  });

  const serverHandle = await indexModule.startServer({
    config,
    githubModelsToken: secrets.githubModelsToken,
    rootDir,
    logger,
    processSupervisor,
    shutdownCoordinator
  });

  shutdownCoordinator.registerHook("server.close", async () => {
    await serverHandle.stop();
  });

  return {
    readyUrl: serverHandle.readyUrl,
    shutdown: async (reason: string) => {
      await shutdownCoordinator.shutdown(reason);
    }
  };
}

async function resolveStartupApiBaseUrl(): Promise<string> {
  const explicit = getLaunchArgument("--api-base-url");
  if (explicit) {
    return explicit;
  }

  bundledRuntime ??= await startBundledRuntime();
  return bundledRuntime.readyUrl;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function buildDrawerBounds(): Bounds {
  const activeDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const workArea = activeDisplay.workArea;
  const width = Math.max(440, Math.min(560, Math.round(workArea.width * 0.29)));
  return {
    x: workArea.x + workArea.width - width,
    y: workArea.y,
    width,
    height: workArea.height
  };
}

async function loadRendererEntry(window: BrowserWindow, fileName: string, query: Record<string, string>): Promise<void> {
  const url = new URL(pathToFileURL(join(rendererDistDir, fileName)).toString());
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  await window.loadURL(url.toString());
}

function focusMainWindow(): void {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

async function createMainWindow(): Promise<BrowserWindow> {
  const bounds = buildDrawerBounds();
  const apiBaseUrl = await resolveStartupApiBaseUrl();
  const iconPath = resolveWindowIconPath();
  const window = new BrowserWindow({
    ...bounds,
    minWidth: 440,
    maxWidth: 640,
    minHeight: 640,
    show: true,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    backgroundColor: "#f6efe7",
    title: "Argument Critic",
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });

  window.focus();

  window.webContents.on("did-finish-load", () => {
    process.stdout.write("[argument-critic-desktop] Renderer loaded.\n");
    window.show();
    window.focus();
  });

  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    process.stderr.write(`[argument-critic-desktop] Failed to load ${validatedUrl}: ${errorCode} ${errorDescription}\n`);
  });

  window.webContents.on("render-process-gone", (_event, details) => {
    process.stderr.write(`[argument-critic-desktop] Renderer process exited: ${details.reason}\n`);
  });

  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  mainWindow = window;
  await loadRendererEntry(window, "index.html", { apiBaseUrl });
  return window;
}

async function captureCurrentDisplay(): Promise<{
  readonly dataUrl: string;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly displayBounds: Bounds;
}> {
  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);
  const captureWidth = Math.max(1, Math.round(display.bounds.width * display.scaleFactor));
  const captureHeight = Math.max(1, Math.round(display.bounds.height * display.scaleFactor));
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: {
      width: captureWidth,
      height: captureHeight
    }
  });
  const source = sources.find((candidate) => candidate.display_id === String(display.id)) ?? sources[0];
  if (!source) {
    throw new Error("No display is available for capture.");
  }

  const imageSize = source.thumbnail.getSize();
  if (!imageSize.width || !imageSize.height) {
    throw new Error("Desktop capture returned an empty image.");
  }

  return {
    dataUrl: source.thumbnail.toDataURL(),
    pixelWidth: imageSize.width,
    pixelHeight: imageSize.height,
    displayBounds: display.bounds
  };
}

function normalizeCropSelection(bounds: CropBounds, selection: PendingCropSelection): CropBounds {
  const offsetX = clamp(bounds.x, 0, Math.max(selection.displayBounds.width - 1, 0));
  const offsetY = clamp(bounds.y, 0, Math.max(selection.displayBounds.height - 1, 0));
  const width = clamp(bounds.width, 1, Math.max(selection.displayBounds.width - offsetX, 1));
  const height = clamp(bounds.height, 1, Math.max(selection.displayBounds.height - offsetY, 1));
  const scaleX = selection.pixelWidth / Math.max(selection.displayBounds.width, 1);
  const scaleY = selection.pixelHeight / Math.max(selection.displayBounds.height, 1);

  return {
    x: Math.round(offsetX * scaleX),
    y: Math.round(offsetY * scaleY),
    width: Math.max(1, Math.round(width * scaleX)),
    height: Math.max(1, Math.round(height * scaleY))
  };
}

async function promptForCropSelection(capture: {
  readonly dataUrl: string;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly displayBounds: Bounds;
}): Promise<CropBounds> {
  return await new Promise<CropBounds>((resolve, reject) => {
    const captureToken = randomUUID();
    const overlay = new BrowserWindow({
      x: capture.displayBounds.x,
      y: capture.displayBounds.y,
      width: capture.displayBounds.width,
      height: capture.displayBounds.height,
      show: false,
      frame: false,
      movable: false,
      resizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      backgroundColor: "#111111",
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false
      }
    });

    pendingCropSelections.set(captureToken, {
      overlay,
      dataUrl: capture.dataUrl,
      pixelWidth: capture.pixelWidth,
      pixelHeight: capture.pixelHeight,
      displayBounds: capture.displayBounds,
      resolve,
      reject,
      completed: false
    });

    overlay.once("ready-to-show", () => {
      overlay.show();
      overlay.focus();
    });

    overlay.on("closed", () => {
      const pending = pendingCropSelections.get(captureToken);
      if (!pending || pending.completed) {
        focusMainWindow();
        return;
      }

      pendingCropSelections.delete(captureToken);
      pending.reject(new Error("Crop selection cancelled."));
      focusMainWindow();
    });

    void loadRendererEntry(overlay, "crop-overlay.html", { captureToken }).catch((error: unknown) => {
      pendingCropSelections.delete(captureToken);
      if (!overlay.isDestroyed()) {
        overlay.destroy();
      }
      reject(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle("argument-critic-desktop:capture-visible", async () => {
    const capture = await captureCurrentDisplay();
    return { dataUrl: capture.dataUrl };
  });

  ipcMain.handle("argument-critic-desktop:capture-crop", async () => {
    const capture = await captureCurrentDisplay();
    const crop = await promptForCropSelection(capture);
    return {
      dataUrl: capture.dataUrl,
      crop
    };
  });

  ipcMain.handle("argument-critic-desktop:get-crop-payload", async (_event, captureToken: string) => {
    const pending = pendingCropSelections.get(captureToken);
    if (!pending) {
      throw new Error("No crop selection is pending.");
    }

    return {
      dataUrl: pending.dataUrl,
      pixelWidth: pending.pixelWidth,
      pixelHeight: pending.pixelHeight,
      displayBounds: pending.displayBounds
    };
  });

  ipcMain.handle("argument-critic-desktop:complete-crop", async (_event, captureToken: string, bounds: CropBounds) => {
    const pending = pendingCropSelections.get(captureToken);
    if (!pending) {
      throw new Error("No crop selection is pending.");
    }

    pending.completed = true;
    pendingCropSelections.delete(captureToken);
    pending.resolve(normalizeCropSelection(bounds, pending));
    if (!pending.overlay.isDestroyed()) {
      pending.overlay.close();
    }
    focusMainWindow();

    return { accepted: true };
  });

  ipcMain.handle("argument-critic-desktop:cancel-crop", async (_event, captureToken: string) => {
    const pending = pendingCropSelections.get(captureToken);
    if (!pending) {
      return { accepted: false };
    }

    pending.completed = true;
    pendingCropSelections.delete(captureToken);
    pending.reject(new Error("Crop selection cancelled."));
    if (!pending.overlay.isDestroyed()) {
      pending.overlay.close();
    }
    focusMainWindow();

    return { accepted: true };
  });

  ipcMain.handle("argument-critic-desktop:open-external", async (_event, targetUrl: string) => {
    const normalized = typeof targetUrl === "string" ? targetUrl.trim() : "";
    if (!normalized) {
      throw new Error("A URL is required.");
    }

    const parsed = new URL(normalized);
    if (!["https:", "http:"].includes(parsed.protocol)) {
      throw new Error("Only http and https URLs are supported.");
    }

    await shell.openExternal(parsed.toString());
    return { accepted: true };
  });

  ipcMain.handle("argument-critic-desktop:copy-text", async (_event, value: string) => {
    const normalized = typeof value === "string" ? value : "";
    clipboard.writeText(normalized);
    return { accepted: true };
  });
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("before-quit", (event) => {
    if (!bundledRuntime || bundledRuntimeShutdownInProgress) {
      return;
    }

    event.preventDefault();
    bundledRuntimeShutdownInProgress = true;
    void bundledRuntime.shutdown("desktop-app-quit").catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      app.exit(1);
    });
  });

  app.on("second-instance", () => {
    focusMainWindow();
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId("io.github.hoodierat.argumentcritic");
    registerIpcHandlers();
    await createMainWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createMainWindow();
        return;
      }

      focusMainWindow();
    });
  }).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    app.quit();
  });

  app.on("window-all-closed", () => {
    app.quit();
  });
}
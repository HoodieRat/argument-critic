import type { BackgroundCaptureResult } from "./types";

type CropBounds = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

type CropPayload = {
  readonly dataUrl: string;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly displayBounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
};

type DesktopBridge = {
  readonly captureVisible: () => Promise<BackgroundCaptureResult>;
  readonly captureCrop: () => Promise<BackgroundCaptureResult>;
  readonly getCropPayload: (captureToken: string) => Promise<CropPayload>;
  readonly completeCrop: (captureToken: string, bounds: CropBounds) => Promise<{ accepted: boolean }>;
  readonly cancelCrop: (captureToken: string) => Promise<{ accepted: boolean }>;
  readonly openExternal: (url: string) => Promise<{ accepted: boolean }>;
  readonly copyText: (value: string) => Promise<{ accepted: boolean }>;
};

const API_BASE_STORAGE_KEY = "argumentCriticApiBaseUrl";

function getChromeApi(): typeof chrome | undefined {
  return (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome;
}

function getDesktopBridge(): DesktopBridge | undefined {
  return (window as Window & { argumentCriticDesktop?: DesktopBridge }).argumentCriticDesktop;
}

function readLocalStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    return;
  }
}

async function sendBackgroundMessage<T>(type: string): Promise<T> {
  const chromeApi = getChromeApi();
  if (!chromeApi?.runtime?.sendMessage) {
    throw new Error("Capture is only available in the desktop drawer or the legacy browser helper.");
  }

  return await new Promise<T>((resolve, reject) => {
    chromeApi.runtime.sendMessage({ type }, (response) => {
      const runtimeError = chromeApi.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }

      if (!response) {
        reject(new Error("No response from the legacy browser helper."));
        return;
      }

      if (response.error) {
        reject(new Error(response.error));
        return;
      }

      resolve(response as T);
    });
  });
}

export function hasCaptureSupport(): boolean {
  return Boolean(getDesktopBridge() || getChromeApi()?.runtime?.sendMessage);
}

export function isCaptureCancellationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /crop selection cancelled/i.test(message);
}

export async function loadPersistedApiBaseUrl(defaultBaseUrl: string): Promise<string> {
  const chromeApi = getChromeApi();
  if (chromeApi?.storage?.local) {
    const value = await chromeApi.storage.local.get([API_BASE_STORAGE_KEY]);
    return typeof value[API_BASE_STORAGE_KEY] === "string" ? value[API_BASE_STORAGE_KEY] : defaultBaseUrl;
  }

  return readLocalStorage(API_BASE_STORAGE_KEY) ?? defaultBaseUrl;
}

export async function persistApiBaseUrl(url: string): Promise<void> {
  const chromeApi = getChromeApi();
  if (chromeApi?.storage?.local) {
    await chromeApi.storage.local.set({ [API_BASE_STORAGE_KEY]: url });
    return;
  }

  writeLocalStorage(API_BASE_STORAGE_KEY, url);
}

export async function captureVisible(): Promise<BackgroundCaptureResult> {
  const desktopBridge = getDesktopBridge();
  if (desktopBridge) {
    return await desktopBridge.captureVisible();
  }

  return await sendBackgroundMessage<BackgroundCaptureResult>("argument-critic:capture-visible");
}

export async function captureCrop(): Promise<BackgroundCaptureResult> {
  const desktopBridge = getDesktopBridge();
  if (desktopBridge) {
    return await desktopBridge.captureCrop();
  }

  return await sendBackgroundMessage<BackgroundCaptureResult>("argument-critic:capture-crop");
}

export async function openExternalUrl(url: string): Promise<void> {
  const normalized = url.trim();
  if (!normalized) {
    throw new Error("A URL is required.");
  }

  const desktopBridge = getDesktopBridge();
  if (desktopBridge) {
    await desktopBridge.openExternal(normalized);
    return;
  }

  if (typeof window !== "undefined") {
    window.open(normalized, "_blank", "noopener,noreferrer");
  }
}

export async function copyText(value: string): Promise<void> {
  const normalized = value ?? "";
  const desktopBridge = getDesktopBridge();
  if (desktopBridge) {
    await desktopBridge.copyText(normalized);
    return;
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(normalized);
  }
}
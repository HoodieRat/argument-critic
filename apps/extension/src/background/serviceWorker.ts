type CropBounds = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

const WELCOME_PAGE_URL = chrome.runtime.getURL("welcome.html");
const COMPANION_HOSTS = new Set(["127.0.0.1", "localhost"]);

const pendingCropRequests = new Map<number, { resolve: (bounds: CropBounds) => void; reject: (error: Error) => void; timeout: ReturnType<typeof setTimeout> }>();

function isCompanionStartupUrl(rawUrl?: string): boolean {
  if (!rawUrl) {
    return false;
  }

  try {
    const url = new URL(rawUrl);
    return url.protocol === "http:" && COMPANION_HOSTS.has(url.hostname) && (url.pathname === "/" || url.pathname === "");
  } catch {
    return false;
  }
}

async function redirectCompanionStartupTab(tabId: number, rawUrl?: string): Promise<void> {
  if (!isCompanionStartupUrl(rawUrl)) {
    return;
  }

  const tab = await chrome.tabs.get(tabId);
  if (tab.url === WELCOME_PAGE_URL) {
    return;
  }

  await chrome.tabs.update(tabId, { url: WELCOME_PAGE_URL });
}

async function redirectActiveStartupTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) {
    return;
  }

  await redirectCompanionStartupTab(tab.id, tab.url);
}

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null || tab.windowId == null) {
    throw new Error("No active tab is available for capture.");
  }

  return tab;
}

async function captureVisibleTab(): Promise<{ dataUrl: string; tabTitle?: string; tabUrl?: string }> {
  const tab = await getActiveTab();
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  return { dataUrl, tabTitle: tab.title, tabUrl: tab.url };
}

async function requestCropSelection(tabId: number): Promise<CropBounds> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingCropRequests.delete(tabId);
      reject(new Error("Crop selection timed out."));
    }, 45_000);

    pendingCropRequests.set(tabId, { resolve, reject, timeout });
    chrome.tabs.sendMessage(tabId, { type: "argument-critic:start-crop" }, () => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        clearTimeout(timeout);
        pendingCropRequests.delete(tabId);
        reject(new Error(lastError.message));
      }
    });
  });
}

async function captureCrop(): Promise<{ dataUrl: string; crop: CropBounds; tabTitle?: string; tabUrl?: string }> {
  const tab = await getActiveTab();
  const crop = await requestCropSelection(tab.id!);
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId!, { format: "png" });
  return { dataUrl, crop, tabTitle: tab.title, tabUrl: tab.url };
}

async function configureSidePanel(): Promise<void> {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

chrome.runtime.onInstalled.addListener(() => {
  void configureSidePanel();
  void redirectActiveStartupTab();
});

chrome.runtime.onStartup.addListener(() => {
  void configureSidePanel();
  void redirectActiveStartupTab();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const candidateUrl = changeInfo.url ?? tab.url;
  if (!candidateUrl) {
    return;
  }

  void redirectCompanionStartupTab(tabId, candidateUrl).catch(() => {
    return;
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "argument-critic:capture-visible") {
    void captureVisibleTab()
      .then(sendResponse)
      .catch((error: unknown) => sendResponse({ error: error instanceof Error ? error.message : String(error) }));
    return true;
  }

  if (message?.type === "argument-critic:capture-crop") {
    void captureCrop()
      .then(sendResponse)
      .catch((error: unknown) => sendResponse({ error: error instanceof Error ? error.message : String(error) }));
    return true;
  }

  if (message?.type === "argument-critic:crop-result") {
    const tabId = sender.tab?.id;
    if (!tabId) {
      return false;
    }

    const pending = pendingCropRequests.get(tabId);
    if (!pending) {
      return false;
    }

    clearTimeout(pending.timeout);
    pendingCropRequests.delete(tabId);

    if (message.cancelled) {
      pending.reject(new Error("Crop selection cancelled."));
      return false;
    }

    pending.resolve(message.bounds as CropBounds);
  }

  return false;
});
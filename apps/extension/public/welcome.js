const statusElement = document.getElementById("status");
const openButton = document.getElementById("open-side-panel");
const fullPageLink = document.getElementById("full-page-link");

const apiBaseUrl = new URLSearchParams(window.location.search).get("apiBaseUrl");

if (fullPageLink instanceof HTMLAnchorElement && apiBaseUrl) {
  fullPageLink.href = `sidepanel.html?apiBaseUrl=${encodeURIComponent(apiBaseUrl)}`;
}

async function closeCurrentTab() {
  const currentTab = await chrome.tabs.getCurrent();
  if (currentTab?.id != null) {
    await chrome.tabs.remove(currentTab.id);
    return;
  }

  window.close();
}

async function openArgumentCritic() {
  if (!(openButton instanceof HTMLButtonElement)) {
    return;
  }

  openButton.disabled = true;
  if (statusElement) {
    statusElement.textContent = "Opening the side panel...";
  }

  try {
    const currentTab = await chrome.tabs.getCurrent();
    if (!currentTab?.windowId) {
      throw new Error("Could not determine the current browser window.");
    }

    await chrome.sidePanel.open({ windowId: currentTab.windowId });
    if (statusElement) {
      statusElement.textContent = "Argument Critic is open in the side panel. This helper tab will close now.";
    }

    setTimeout(() => {
      void closeCurrentTab();
    }, 350);
  } catch (error) {
    openButton.disabled = false;
    if (statusElement) {
      statusElement.textContent = error instanceof Error ? error.message : String(error);
    }
  }
}

if (openButton instanceof HTMLButtonElement) {
  openButton.addEventListener("click", () => {
    void openArgumentCritic();
  });
}
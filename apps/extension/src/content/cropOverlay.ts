type CropState = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

let overlayRoot: HTMLDivElement | null = null;
let selectionBox: HTMLDivElement | null = null;
let cropState: CropState | null = null;

function destroyOverlay(): void {
  overlayRoot?.remove();
  overlayRoot = null;
  selectionBox = null;
  cropState = null;
  window.removeEventListener("keydown", handleEscape, true);
}

function handleEscape(event: KeyboardEvent): void {
  if (event.key !== "Escape") {
    return;
  }

  destroyOverlay();
  void chrome.runtime.sendMessage({ type: "argument-critic:crop-result", cancelled: true });
}

function updateSelectionBox(): void {
  if (!cropState || !selectionBox) {
    return;
  }

  const left = Math.min(cropState.startX, cropState.currentX);
  const top = Math.min(cropState.startY, cropState.currentY);
  const width = Math.abs(cropState.currentX - cropState.startX);
  const height = Math.abs(cropState.currentY - cropState.startY);

  selectionBox.style.left = `${left}px`;
  selectionBox.style.top = `${top}px`;
  selectionBox.style.width = `${width}px`;
  selectionBox.style.height = `${height}px`;
}

function buildOverlay(): void {
  if (overlayRoot) {
    return;
  }

  overlayRoot = document.createElement("div");
  overlayRoot.style.position = "fixed";
  overlayRoot.style.inset = "0";
  overlayRoot.style.background = "rgba(20, 20, 20, 0.22)";
  overlayRoot.style.cursor = "crosshair";
  overlayRoot.style.zIndex = "2147483647";
  overlayRoot.style.backdropFilter = "blur(1px)";

  const instruction = document.createElement("div");
  instruction.textContent = "Drag to select a crop region. Press Esc to cancel.";
  instruction.style.position = "absolute";
  instruction.style.top = "16px";
  instruction.style.left = "50%";
  instruction.style.transform = "translateX(-50%)";
  instruction.style.padding = "10px 14px";
  instruction.style.borderRadius = "999px";
  instruction.style.background = "rgba(255, 249, 242, 0.92)";
  instruction.style.color = "#352920";
  instruction.style.font = "600 13px Aptos, sans-serif";

  selectionBox = document.createElement("div");
  selectionBox.style.position = "absolute";
  selectionBox.style.border = "2px solid #ff7a45";
  selectionBox.style.background = "rgba(255, 122, 69, 0.18)";
  selectionBox.style.borderRadius = "10px";

  overlayRoot.append(instruction, selectionBox);
  document.documentElement.append(overlayRoot);
  window.addEventListener("keydown", handleEscape, true);

  overlayRoot.addEventListener("mousedown", (event) => {
    cropState = {
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY
    };
    updateSelectionBox();
  });

  overlayRoot.addEventListener("mousemove", (event) => {
    if (!cropState) {
      return;
    }
    cropState.currentX = event.clientX;
    cropState.currentY = event.clientY;
    updateSelectionBox();
  });

  overlayRoot.addEventListener("mouseup", (event) => {
    if (!cropState) {
      return;
    }
    cropState.currentX = event.clientX;
    cropState.currentY = event.clientY;
    const bounds = {
      x: Math.min(cropState.startX, cropState.currentX),
      y: Math.min(cropState.startY, cropState.currentY),
      width: Math.abs(cropState.currentX - cropState.startX),
      height: Math.abs(cropState.currentY - cropState.startY)
    };
    destroyOverlay();
    void chrome.runtime.sendMessage({ type: "argument-critic:crop-result", bounds });
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "argument-critic:start-crop") {
    buildOverlay();
  }
});
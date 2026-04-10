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
  readonly getCropPayload: (captureToken: string) => Promise<CropPayload>;
  readonly completeCrop: (captureToken: string, bounds: CropBounds) => Promise<{ accepted: boolean }>;
  readonly cancelCrop: (captureToken: string) => Promise<{ accepted: boolean }>;
};

type Point = {
  readonly x: number;
  readonly y: number;
};

const preview = document.getElementById("preview");
const selection = document.getElementById("selection");
const hud = document.getElementById("hud");

if (!preview || !selection || !hud) {
  throw new Error("Crop overlay UI could not be initialized.");
}

const bridge = (window as Window & { argumentCriticDesktop?: DesktopBridge }).argumentCriticDesktop;
if (!bridge) {
  throw new Error("Desktop bridge is not available.");
}

const captureToken = new URLSearchParams(window.location.search).get("captureToken");
if (!captureToken) {
  throw new Error("A capture token is required.");
}

let anchorPoint: Point | null = null;
let currentPoint: Point | null = null;
let submitting = false;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function toPoint(event: MouseEvent): Point {
  return {
    x: clamp(event.clientX, 0, window.innerWidth),
    y: clamp(event.clientY, 0, window.innerHeight)
  };
}

function getSelectionBounds(): CropBounds | null {
  if (!anchorPoint || !currentPoint) {
    return null;
  }

  const x = Math.min(anchorPoint.x, currentPoint.x);
  const y = Math.min(anchorPoint.y, currentPoint.y);
  const width = Math.abs(currentPoint.x - anchorPoint.x);
  const height = Math.abs(currentPoint.y - anchorPoint.y);

  if (width < 4 || height < 4) {
    return null;
  }

  return { x, y, width, height };
}

function renderSelection(): void {
  const bounds = getSelectionBounds();
  if (!bounds) {
    selection.setAttribute("style", "display: none;");
    return;
  }

  selection.setAttribute(
    "style",
    [
      "display: block",
      `left: ${bounds.x}px`,
      `top: ${bounds.y}px`,
      `width: ${bounds.width}px`,
      `height: ${bounds.height}px`
    ].join(";")
  );
}

function cancelSelection(message: string): void {
  if (submitting) {
    return;
  }

  submitting = true;
  hud.textContent = message;
  void bridge.cancelCrop(captureToken);
}

async function confirmSelection(): Promise<void> {
  const bounds = getSelectionBounds();
  if (!bounds || submitting) {
    return;
  }

  submitting = true;
  hud.textContent = "Saving crop...";
  await bridge.completeCrop(captureToken, bounds);
}

window.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    cancelSelection("Cancelling crop...");
  }
});

window.addEventListener("mousedown", (event) => {
  if (event.button !== 0 || submitting) {
    return;
  }

  anchorPoint = toPoint(event);
  currentPoint = anchorPoint;
  renderSelection();
});

window.addEventListener("mousemove", (event) => {
  if (!anchorPoint || submitting) {
    return;
  }

  currentPoint = toPoint(event);
  renderSelection();
});

window.addEventListener("mouseup", () => {
  if (!anchorPoint || submitting) {
    return;
  }

  void confirmSelection();
});

void bridge.getCropPayload(captureToken).then((payload) => {
  preview.setAttribute("style", `background-image: url(${payload.dataUrl});`);
}).catch((error: unknown) => {
  hud.textContent = error instanceof Error ? error.message : String(error);
  setTimeout(() => cancelSelection("Cancelling crop..."), 250);
});
import { contextBridge, ipcRenderer } from "electron";

type CropBounds = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

contextBridge.exposeInMainWorld("argumentCriticDesktop", {
  captureVisible: () => ipcRenderer.invoke("argument-critic-desktop:capture-visible"),
  captureCrop: () => ipcRenderer.invoke("argument-critic-desktop:capture-crop"),
  getCropPayload: (captureToken: string) => ipcRenderer.invoke("argument-critic-desktop:get-crop-payload", captureToken),
  completeCrop: (captureToken: string, bounds: CropBounds) => ipcRenderer.invoke("argument-critic-desktop:complete-crop", captureToken, bounds),
  cancelCrop: (captureToken: string) => ipcRenderer.invoke("argument-critic-desktop:cancel-crop", captureToken),
  openExternal: (url: string) => ipcRenderer.invoke("argument-critic-desktop:open-external", url),
  copyText: (value: string) => ipcRenderer.invoke("argument-critic-desktop:copy-text", value)
});
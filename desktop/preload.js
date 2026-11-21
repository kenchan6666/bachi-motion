"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bachiDesktop", {
  startBatch(payload) {
    return ipcRenderer.invoke("bachi:start-batch", payload);
  },
  onBatchEvent(callback) {
    const listener = (_event, snap) => callback(snap);
    ipcRenderer.on("bachi:batch-event", listener);
    return () => ipcRenderer.removeListener("bachi:batch-event", listener);
  },
  openPath(filePath) {
    return ipcRenderer.invoke("bachi:open-path", filePath);
  },
});

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("compages", {
  list: () => ipcRenderer.invoke("compages:list"),
  start: (id) => ipcRenderer.invoke("compages:start", id),
  stop: (id) => ipcRenderer.invoke("compages:stop", id),
  open: (id) => ipcRenderer.invoke("compages:open", id),
  openLogs: (id) => ipcRenderer.invoke("compages:open-logs", id),
  openData: (id) => ipcRenderer.invoke("compages:open-data", id),
  onStatus: (callback) => {
    const listener = (_event, snapshots) => callback(snapshots);
    ipcRenderer.on("compages:status", listener);
    return () => ipcRenderer.removeListener("compages:status", listener);
  },
});

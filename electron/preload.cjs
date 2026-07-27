const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("curia", {
  list: () => ipcRenderer.invoke("curia:list"),
  show: (id) => ipcRenderer.invoke("curia:show", id),
  start: (id) => ipcRenderer.invoke("curia:start", id),
  stop: (id) => ipcRenderer.invoke("curia:stop", id),
  openLogs: (id) => ipcRenderer.invoke("curia:open-logs", id),
  openData: (id) => ipcRenderer.invoke("curia:open-data", id),
  getSettings: () => ipcRenderer.invoke("curia:get-settings"),
  saveSettings: (input) => ipcRenderer.invoke("curia:save-settings", input),
  restart: (id) => ipcRenderer.invoke("curia:restart", id),
  onStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("curia:status", listener);
    return () => ipcRenderer.removeListener("curia:status", listener);
  },
});

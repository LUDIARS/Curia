/**
 * Curia メインプロセス — 起動メニュー + Vo/Di サーバプロセス管理。
 * 方式と決定事項は DESIGN.md。サーバコード (submodule) は無改変。
 */

import { app, BrowserWindow, Menu, shell, utilityProcess } from "electron";
import { ipcMain } from "electron/main";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRegistry } from "./registry.mjs";
import { ServerManager } from "./manager.mjs";

const here = dirname(fileURLToPath(import.meta.url));

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

/** @type {Map<string, ServerManager>} */
const managers = new Map();
/** @type {Map<string, BrowserWindow>} */
const appWindows = new Map();
let menuWindow = null;

function broadcast() {
  const snapshots = [...managers.values()].map((m) => m.snapshot());
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("curia:status", snapshots);
  }
}

function createManagers() {
  const ctx = {
    appRoot: app.getAppPath(),
    dataRoot: app.getPath("userData"),
    fork: utilityProcess.fork.bind(utilityProcess),
    onChange: () => broadcast(),
  };
  for (const def of buildRegistry()) {
    managers.set(def.id, new ServerManager(def, ctx));
  }
}

function createMenuWindow() {
  menuWindow = new BrowserWindow({
    width: 760,
    height: 560,
    title: "Curia — LUDIARS スイート",
    webPreferences: {
      preload: join(here, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  void menuWindow.loadFile(join(here, "..", "ui", "menu.html"));
  menuWindow.on("closed", () => {
    menuWindow = null;
  });
}

/** アプリの BrowserWindow を開く (既存があればフォーカス)。外部リンクは OS ブラウザへ。 */
function openAppWindow(id) {
  const manager = managers.get(id);
  if (!manager || manager.state !== "running" || !manager.url) return;
  const existing = appWindows.get(id);
  if (existing && !existing.isDestroyed()) {
    existing.focus();
    return;
  }
  const baseUrl = manager.url.replace(/\/$/, "");
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: manager.def.name,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  const isInternal = (url) => url === baseUrl || url.startsWith(`${baseUrl}/`);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isInternal(url)) {
      void shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!isInternal(url)) {
      e.preventDefault();
      void shell.openExternal(url);
    }
  });
  void win.loadURL(`${baseUrl}/`);
  win.on("closed", () => appWindows.delete(id));
  appWindows.set(id, win);
}

function registerIpc() {
  ipcMain.handle("curia:list", () => [...managers.values()].map((m) => m.snapshot()));
  ipcMain.handle("curia:start", (_e, id) => managers.get(id)?.start());
  ipcMain.handle("curia:stop", (_e, id) => {
    managers.get(id)?.stop();
    appWindows.get(id)?.close();
  });
  ipcMain.handle("curia:open", (_e, id) => openAppWindow(id));
  ipcMain.handle("curia:open-logs", (_e, id) => {
    const m = managers.get(id);
    if (m) void shell.openPath(m.logPath);
  });
  ipcMain.handle("curia:open-data", (_e, id) => {
    const dir = managers.get(id)?.snapshot().dataDir;
    if (dir) void shell.openPath(dir);
  });
}

app.on("second-instance", () => {
  if (menuWindow) {
    if (menuWindow.isMinimized()) menuWindow.restore();
    menuWindow.focus();
  } else {
    createMenuWindow();
  }
});

// 全ウィンドウを閉じたらサーバごと終了 (常駐しない。DESIGN.md §4)。
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  for (const m of managers.values()) m.stop();
});

if (gotLock) {
  app
    .whenReady()
    .then(() => {
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          {
            label: "表示",
            submenu: [
              { role: "reload" },
              { role: "toggleDevTools" },
              { type: "separator" },
              { role: "togglefullscreen" },
            ],
          },
        ])
      );
      createManagers();
      registerIpc();
      createMenuWindow();
    })
    .catch((err) => {
      console.error("[curia] startup failed:", err);
      app.exit(1);
    });
}

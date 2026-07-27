/**
 * Curia メインプロセス — 統合 hub shell + Vo/Di サーバプロセス管理。
 * バックエンドはサービスごとに独立プロセス (utilityProcess)、フロントエンドは
 * 1 ウィンドウ (左レール + WebContentsView タブ) に統合する。DESIGN.md §3-§4。
 */

import { app, BrowserWindow, Menu, shell, utilityProcess, WebContentsView } from "electron";
import { ipcMain } from "electron/main";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRegistry } from "./registry.mjs";
import { ServerManager } from "./manager.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const RAIL_WIDTH = 232; // ui/shell.html の左レール幅と一致させる

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

/** @type {Map<string, ServerManager>} */
const managers = new Map();
/** @type {Map<string, WebContentsView>} */
const views = new Map();
let shellWindow = null;
let activeId = "menu";

function broadcast() {
  if (!shellWindow || shellWindow.isDestroyed()) return;
  shellWindow.webContents.send("curia:status", {
    active: activeId,
    apps: [...managers.values()].map((m) => m.snapshot()),
  });
}

function createManagers() {
  const ctx = {
    appRoot: app.getAppPath(),
    dataRoot: app.getPath("userData"),
    fork: utilityProcess.fork.bind(utilityProcess),
    onChange: (manager) => {
      // タブ選択済みのサービスが running に達したら、その場でビューを出す。
      if (manager.state === "running" && activeId === manager.def.id) ensureView(manager.def.id);
      if (manager.state !== "running") dropView(manager.def.id);
      broadcast();
    },
  };
  for (const def of buildRegistry()) {
    managers.set(def.id, new ServerManager(def, ctx));
  }
}

function contentBounds() {
  const [width, height] = shellWindow.getContentSize();
  return { x: RAIL_WIDTH, y: 0, width: Math.max(0, width - RAIL_WIDTH), height };
}

function layoutViews() {
  if (!shellWindow || shellWindow.isDestroyed()) return;
  for (const [id, view] of views) {
    const active = id === activeId;
    view.setVisible(active);
    if (active) view.setBounds(contentBounds());
  }
}

/** running 中のサービスの WebContentsView を用意して現在のタブに合わせて表示する。 */
function ensureView(id) {
  const manager = managers.get(id);
  if (!manager || manager.state !== "running" || !manager.url) return;
  let view = views.get(id);
  if (!view) {
    view = new WebContentsView({
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
    });
    const baseUrl = manager.url.replace(/\/$/, "");
    const isInternal = (url) => url === baseUrl || url.startsWith(`${baseUrl}/`);
    view.webContents.setWindowOpenHandler(({ url }) => {
      if (!isInternal(url)) {
        void shell.openExternal(url);
        return { action: "deny" };
      }
      return { action: "allow" };
    });
    view.webContents.on("will-navigate", (e, url) => {
      if (!isInternal(url)) {
        e.preventDefault();
        void shell.openExternal(url);
      }
    });
    void view.webContents.loadURL(`${baseUrl}/`);
    shellWindow.contentView.addChildView(view);
    views.set(id, view);
  }
  layoutViews();
}

function dropView(id) {
  const view = views.get(id);
  if (!view) return;
  views.delete(id);
  if (shellWindow && !shellWindow.isDestroyed()) shellWindow.contentView.removeChildView(view);
  view.webContents.close();
  if (activeId === id) {
    activeId = "menu";
    broadcast();
  }
}

/** タブ切替。停止中のサービスタブを選んだら起動も仕掛ける (統合フロントの入口一本化)。 */
function showTab(id) {
  activeId = id;
  if (id !== "menu") {
    const manager = managers.get(id);
    if (manager) {
      if (manager.state === "stopped" || manager.state === "error") void manager.start();
      ensureView(id);
    }
  }
  layoutViews();
  broadcast();
}

function createShellWindow() {
  shellWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: "Curia — LUDIARS スイート",
    webPreferences: {
      preload: join(here, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  void shellWindow.loadFile(join(here, "..", "ui", "shell.html"));
  shellWindow.on("resize", layoutViews);
  shellWindow.on("closed", () => {
    shellWindow = null;
  });
}

function registerIpc() {
  ipcMain.handle("curia:list", () => ({
    active: activeId,
    apps: [...managers.values()].map((m) => m.snapshot()),
  }));
  ipcMain.handle("curia:show", (_e, id) => showTab(id));
  ipcMain.handle("curia:start", (_e, id) => managers.get(id)?.start());
  ipcMain.handle("curia:stop", (_e, id) => {
    dropView(id);
    managers.get(id)?.stop();
  });
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
  if (shellWindow) {
    if (shellWindow.isMinimized()) shellWindow.restore();
    shellWindow.focus();
  } else {
    createShellWindow();
  }
});

// ウィンドウを閉じたらサーバごと終了 (常駐しない。DESIGN.md §4)。
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
      createShellWindow();
    })
    .catch((err) => {
      console.error("[curia] startup failed:", err);
      app.exit(1);
    });
}

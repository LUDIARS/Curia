/**
 * ServerManager — アプリ 1 つ分のサーバプロセスのライフサイクル管理。
 * 状態: stopped → starting → running → (stopped | error)。
 * stdout/stderr は <dataRoot>/logs/<id>.log へ tee する (packaged で stdout が見えないため)。
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const READY_TIMEOUT_MS = 60_000;
const SHUTDOWN_GRACE_MS = 5_000;

export class ServerManager {
  /**
   * @param {import('./registry.mjs').AppDef} def
   * @param {{appRoot: string, dataRoot: string, fork: Function, onChange: (m: ServerManager) => void}} ctx
   */
  constructor(def, ctx) {
    this.def = def;
    this.ctx = ctx;
    this.child = null;
    this.state = "stopped";
    this.url = null;
    this.lastError = null;
    this.manifest = null;
    this.logPath = join(ctx.dataRoot, "logs", `${def.id}.log`);
  }

  snapshot() {
    return {
      id: this.def.id,
      name: this.def.name,
      description: this.def.description,
      state: this.state,
      url: this.url,
      lastError: this.lastError,
      manifest: this.manifest,
      logPath: this.logPath,
      dataDir: this.def.dataDir(this.ctx),
    };
  }

  /**
   * Corpus service manifest (/.well-known/corpus-service.json) の検出。
   * あれば表示名と corpusApi をダッシュボードに出す (無くても何も壊れない)。
   * Corpus プラグインパック化 (DESIGN.md §10) の下準備。
   */
  async #probeManifest(baseUrl) {
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/.well-known/corpus-service.json`);
      if (!res.ok) return;
      const body = await res.json();
      if (body && typeof body === "object" && typeof body.service === "string") {
        this.manifest = {
          service: body.service,
          displayName: typeof body.displayName === "string" ? body.displayName : body.service,
          corpusApi: typeof body.corpusApi === "number" ? body.corpusApi : null,
        };
        this.ctx.onChange(this);
      }
    } catch {
      /* manifest 無しは正常系 (Di は未対応) */
    }
  }

  #log(line) {
    try {
      mkdirSync(join(this.ctx.dataRoot, "logs"), { recursive: true });
      appendFileSync(this.logPath, `${new Date().toISOString()} ${line}\n`);
    } catch {
      /* ログ失敗でアプリを止めない */
    }
  }

  #setState(state, { url = this.url, error = null } = {}) {
    this.state = state;
    this.url = url;
    this.lastError = error;
    this.ctx.onChange(this);
  }

  async start() {
    if (this.state === "starting" || this.state === "running") return;
    this.#setState("starting", { url: null, error: null });
    let spec;
    try {
      spec = this.def.forkSpec(this.ctx);
    } catch (err) {
      this.#setState("error", { error: err.message });
      return;
    }
    this.#log(`[curia] fork ${spec.modulePath}`);
    const child = this.ctx.fork(spec.modulePath, [], spec.options);
    this.child = child;
    child.stdout?.on("data", (d) => this.#log(String(d).trimEnd()));
    child.stderr?.on("data", (d) => this.#log(`[err] ${String(d).trimEnd()}`));
    child.once("exit", (code) => {
      if (this.child !== child) return; // 明示 stop 済み
      this.child = null;
      const unexpected = this.state === "starting" || this.state === "running";
      this.#log(`[curia] exited code=${code}`);
      this.#setState(unexpected ? "error" : "stopped", {
        url: null,
        error: unexpected ? `プロセスが終了しました (code=${code})。ログを確認してください` : null,
      });
    });

    try {
      const url = await this.#waitReady(child);
      if (this.child !== child) return; // 待機中に stop された
      this.#setState("running", { url, error: null });
      void this.#probeManifest(url);
    } catch (err) {
      if (this.child === child) {
        this.#log(`[curia] ready wait failed: ${err.message}`);
        this.stop();
        this.#setState("error", { url: null, error: err.message });
      }
    }
  }

  #waitReady(child) {
    if (this.def.readyKind === "message") {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("起動がタイムアウトしました")),
          READY_TIMEOUT_MS
        );
        child.once("message", (message) => {
          clearTimeout(timer);
          if (message?.type === "ready" && typeof message.url === "string") resolve(message.url);
          else reject(new Error(`予期しない起動メッセージ: ${JSON.stringify(message)}`));
        });
      });
    }
    return this.#pollHealth();
  }

  async #pollHealth() {
    const healthUrl = this.def.healthUrl(this.ctx);
    if (!healthUrl) throw new Error("health URL を解決できません");
    const deadline = Date.now() + READY_TIMEOUT_MS;
    let lastErr = null;
    while (Date.now() < deadline) {
      if (!this.child) throw new Error("起動中にプロセスが終了しました。ログを確認してください");
      try {
        const res = await fetch(healthUrl);
        if (res.ok) return healthUrl.replace(/\/health$/, "/");
        lastErr = new Error(`health check: HTTP ${res.status}`);
      } catch (err) {
        lastErr = err;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`起動がタイムアウトしました (${healthUrl}): ${lastErr?.message ?? "timeout"}`);
  }

  stop() {
    const child = this.child;
    if (!child) {
      if (this.state !== "stopped") this.#setState("stopped", { url: null, error: null });
      return;
    }
    this.child = null; // exit ハンドラに「意図した停止」と伝える
    this.#setState("stopped", { url: null, error: null });
    if (this.def.shutdownByMessage) {
      try {
        child.postMessage({ type: "shutdown" });
      } catch {
        /* postMessage 不能なら kill に進む */
      }
      setTimeout(() => child.kill(), SHUTDOWN_GRACE_MS);
    } else {
      child.kill();
    }
  }
}

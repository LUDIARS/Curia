/**
 * Curia セットアップ: submodule init → 両アプリの deps/build →
 * Discutere better-sqlite3 の Electron ABI rebuild (DESIGN.md §3)。
 * どのステップで失敗したか分かるよう逐次実行・即時失敗。
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(label, command, args, cwd = root) {
  console.log(`\n== ${label}\n   ${command} ${args.join(" ")} (cwd: ${cwd})`);
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    console.error(`setup failed at: ${label}`);
    process.exit(result.status ?? 1);
  }
}

function electronVersion() {
  const pkg = JSON.parse(
    readFileSync(join(root, "node_modules", "electron", "package.json"), "utf8")
  );
  return pkg.version;
}

const manifest = JSON.parse(readFileSync(join(root, "curia.apps.json"), "utf8"));
const enabled = new Set(
  (manifest.apps ?? []).filter((a) => a?.enabled !== false).map((a) => a.id)
);

const voRoot = join(root, "apps", "voluptas", "player-profile-server");
const diRoot = join(root, "apps", "discutere");
const anRoot = join(root, "apps", "anatomia");
const pfRoot = join(root, "apps", "praeforma");
const thRoot = join(root, "apps", "thaleia");

/** optional アプリ: manifest で無効 or submodule 未取得ならスキップ (エラーにしない)。 */
function optionalApp(id, dir, steps) {
  if (!enabled.has(id)) return console.log(`\n== ${id}: manifest で無効のためスキップ`);
  if (!existsSync(join(dir, "package.json"))) {
    return console.log(`\n== ${id}: submodule 未取得のためスキップ (git submodule update --init apps/${id})`);
  }
  steps();
}

run("submodule init", "git", ["submodule", "update", "--init", "--recursive"]);
run("Voluptas deps", "npm", ["ci"], voRoot);
run("Discutere deps", "npm", ["ci"], diRoot);
// checkout 済みでも各パッケージの build が要るので常に実行 (Di 側スクリプトは冪等)。
run("Discutere submodules (init + build)", "npm", ["run", "setup:submodules"], diRoot);
run("Discutere build", "npm", ["run", "build"], diRoot);
run(
  "Discutere better-sqlite3 rebuild (Electron ABI)",
  "npx",
  ["electron-rebuild", "-f", "-w", "better-sqlite3", "-v", electronVersion()],
  diRoot
);

optionalApp("anatomia", anRoot, () => {
  run("Anatomia deps", "npm", ["ci"], anRoot);
  run("Anatomia build", "npm", ["run", "build"], anRoot);
});
optionalApp("praeforma", pfRoot, () => {
  run("Praeforma deps", "npm", ["ci"], pfRoot);
  run("Praeforma web build", "npm", ["run", "build:web"], pfRoot);
  run(
    "Praeforma better-sqlite3 rebuild (Electron ABI)",
    "npx",
    ["electron-rebuild", "-f", "-w", "better-sqlite3", "-v", electronVersion()],
    pfRoot
  );
});
optionalApp("thaleia", thRoot, () => {
  run("Thaleia deps", "npm", ["ci"], thRoot);
});

console.log("\nsetup done — `npm run dev` で起動メニューを開けます");

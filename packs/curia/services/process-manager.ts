// Vo/Di 子プロセス管理 (Corpus サーバプロセス内で動く)。
// electron/manager.mjs の ServerManager と同じライフサイクル観
// (stopped → starting → running → stopped/error) をサーバ側に移したもの。
//
// 状態: スケルトン (T9b)。spawn の実配線は
//   - Discutere: dist/index.js + DISCUTERE_CONFIG + cwd=CORPUS_DATA/discutere (実装可能・未配線)
//   - Voluptas: ローカルサーバエントリが feat/dual-mode-persona-ui マージ待ち
// このままでも listServices/connector は down を返し、Corpus shell は正常に動く。

import type { ServiceConnector } from '../../../apps/corpus/server/hub/types.ts';

export type ManagedServiceId = 'voluptas' | 'discutere';

export interface ManagedServiceState {
  id: ManagedServiceId;
  state: 'stopped' | 'starting' | 'running' | 'error';
  url: string | null;
  lastError: string | null;
}

const states = new Map<ManagedServiceId, ManagedServiceState>([
  ['voluptas', { id: 'voluptas', state: 'stopped', url: null, lastError: null }],
  ['discutere', { id: 'discutere', state: 'stopped', url: null, lastError: null }],
]);

export function listServices(): ManagedServiceState[] {
  return [...states.values()];
}

export async function startService(id: ManagedServiceId): Promise<ManagedServiceState> {
  const s = states.get(id);
  if (!s) throw new Error(`unknown service: ${id}`);
  // TODO(T9b): spawn 実装。Di = process.execPath + dist/index.js (ELECTRON_RUN_AS_NODE 継承)、
  // Vo = dual-mode-persona-ui マージ後にローカルエントリを spawn。
  s.state = 'error';
  s.lastError = 'spawn 未配線 (DESIGN.md §10 T9b)';
  return s;
}

export async function stopService(id: ManagedServiceId): Promise<ManagedServiceState> {
  const s = states.get(id);
  if (!s) throw new Error(`unknown service: ${id}`);
  s.state = 'stopped';
  s.lastError = null;
  return s;
}

/** 稼働していれば health up / fetch proxy、未稼働なら down を返す connector。 */
export function serviceConnector(
  id: ManagedServiceId,
  title: string,
  scope: 'local' | 'multi'
): ServiceConnector {
  return {
    id,
    title,
    scope,
    async health() {
      const s = states.get(id);
      if (s?.state !== 'running' || !s.url) return { status: 'down' as const };
      try {
        const res = await fetch(`${s.url.replace(/\/$/, '')}/health`);
        return { status: res.ok ? ('up' as const) : ('down' as const) };
      } catch {
        return { status: 'down' as const };
      }
    },
    async fetch(path: string, init?: RequestInit) {
      const s = states.get(id);
      if (s?.state !== 'running' || !s.url) {
        return new Response(JSON.stringify({ error: 'service_down' }), { status: 503 });
      }
      return fetch(`${s.url.replace(/\/$/, '')}${path}`, init);
    },
  };
}

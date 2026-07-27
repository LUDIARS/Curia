// Curia ダッシュボードパネル — サービス状態 + 起動/停止 (self-contained、panel-kit 非依存)。
// フル UI (Vo React SPA / Di サーバ描画) は稼働後に iframe タブで開く (T9b で拡張)。

interface PanelContext {
  apiBase: string; // /api/x/services
}

interface ServiceView {
  id: string;
  state: string;
  url: string | null;
  lastError: string | null;
}

const LABEL: Record<string, string> = {
  stopped: '停止中', starting: '起動中…', running: '稼働中', error: 'エラー',
};

async function getServices(apiBase: string): Promise<ServiceView[]> {
  const res = await fetch(`${apiBase}/`);
  if (!res.ok) throw new Error(`services API: HTTP ${res.status}`);
  return (await res.json()).services;
}

export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  container.innerHTML = '';
  const h = document.createElement('h2');
  h.textContent = '🏛️ Curia サービス';
  container.appendChild(h);
  const host = document.createElement('div');
  container.appendChild(host);

  async function render(): Promise<void> {
    const services = await getServices(ctx.apiBase);
    host.innerHTML = '';
    for (const s of services) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid rgba(128,128,128,.25)';
      const name = document.createElement('strong');
      name.textContent = s.id;
      const state = document.createElement('span');
      state.textContent = LABEL[s.state] ?? s.state;
      const spacer = document.createElement('span');
      spacer.style.flex = '1';
      const err = document.createElement('span');
      if (s.lastError) { err.textContent = s.lastError; err.style.opacity = '.7'; }
      const btn = document.createElement('button');
      const running = s.state === 'running' || s.state === 'starting';
      btn.textContent = running ? '停止' : '起動';
      btn.addEventListener('click', async () => {
        await fetch(`${ctx.apiBase}/${s.id}/${running ? 'stop' : 'start'}`, { method: 'POST' });
        void render();
      });
      row.append(name, state, err, spacer, btn);
      if (s.url && s.state === 'running') {
        const open = document.createElement('a');
        open.href = s.url;
        open.target = '_blank';
        open.textContent = '開く';
        row.append(open);
      }
      host.appendChild(row);
    }
  }

  await render();
  setInterval(() => void render(), 3000);
}

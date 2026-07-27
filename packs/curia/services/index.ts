// Curia services モジュール — Vo/Di をローカル子プロセスとして管理し、
// connector (health/fetch) と操作 API (/api/x/services/*) を登録する。
//
// 状態: スケルトン (DESIGN.md §10 の T9b)。配線には以下のマージが前提:
//   - Corpus feat/enterprise-electron-capability-base (このパックの実行基盤)
//   - Voluptas feat/dual-mode-persona-ui (ローカルモードのサーバエントリ。
//     main にはまだ無いため、Voluptas の spawn は未実装で down 表示になる)

import { Hono } from '../../../apps/corpus/server/hub/sdk.ts';
import type { CorpusModule, CorpusContext } from '../../../apps/corpus/server/hub/sdk.ts';
import {
  listServices,
  startService,
  stopService,
  serviceConnector,
  type ManagedServiceId,
} from './process-manager.ts';

const services: CorpusModule = {
  id: 'services',
  title: 'Curia サービス',
  icon: '🏛️',
  setup(ctx: CorpusContext) {
    // Vo/Di の connector: 稼働していれば health up、未稼働なら down (Corpus は起動し続ける)。
    ctx.registerConnector(serviceConnector('voluptas', 'Voluptas', 'local'));
    ctx.registerConnector(serviceConnector('discutere', 'Discutere', 'local'));

    const api = new Hono();
    api.get('/', (c) => c.json({ services: listServices() }));
    api.post('/:id/start', async (c) => {
      const id = c.req.param('id') as ManagedServiceId;
      return c.json(await startService(id));
    });
    api.post('/:id/stop', async (c) => {
      const id = c.req.param('id') as ManagedServiceId;
      return c.json(await stopService(id));
    });
    ctx.registerRoute(api);

    ctx.registerPanel({ title: 'Curia', icon: '🏛️' });
  },
};

export default services;

// R2 物件的代送端點。
//
// ⚠️ 免費方案下這是最主要的 request 消耗來源：每一張圖都算一次 Worker request。
//    綁定 R2 自訂網域後圖片完全不經 Worker（見 docs/10-cost.md），這個端點
//    就只剩本機開發用途。在那之前，這裡盡量把成本壓低：
//      • 先查 Cloudflare 邊緣快取，命中就直接回，CPU 幾乎為零
//      • 回應帶 immutable 長快取，瀏覽器不會重複請求
//      • 支援 If-None-Match，回 304 不傳 body
//    快取命中仍然計入 request 數（Cloudflare 的計費規則），但 CPU 時間
//    只有 miss 才算 —— 這正是免費方案 10ms CPU 上限的主要保護。

import type { APIRoute } from 'astro';
import { getObject } from '../../lib/media';

export const prerender = false;

const IMMUTABLE = 'public, max-age=31536000, immutable';

export const GET: APIRoute = async ({ params, request }) => {
  const key = params.key;
  // 只允許車輛圖片前綴，避免這個端點變成整個 bucket 的任意讀取介面
  if (!key || !key.startsWith('vehicles/') || key.includes('..')) {
    return new Response('Not Found', { status: 404 });
  }

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' });

  // 檔名是時間戳記、內容不會就地改寫，所以 etag 相符即可回 304 不傳 body
  const inm = request.headers.get('if-none-match');
  const notModified = (etag: string) =>
    new Response(null, { status: 304, headers: { etag, 'cache-control': IMMUTABLE } });

  const cached = await cache.match(cacheKey);
  if (cached) {
    const etag = cached.headers.get('etag');
    if (inm && etag && inm === etag) return notModified(etag);
    // 回傳可寫副本 —— 快取取出的 Response 標頭唯讀，middleware 還要加安全標頭
    return new Response(cached.body, cached);
  }

  const object = await getObject(key);
  if (!object) return new Response('Not Found', { status: 404 });

  if (inm && inm === object.httpEtag) return notModified(object.httpEtag);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', IMMUTABLE);

  const response = new Response(object.body, { headers });
  // 放進邊緣快取供後續請求使用；不阻塞回應
  await cache.put(cacheKey, response.clone());
  return response;
};

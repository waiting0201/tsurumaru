// 舊網址的 301 導轉。
//
// 舊詳情頁把 VehicleID 放在 query string，新版放在路徑上。Workers 的靜態
// redirect 規則讀不到 query string，所以這一段必須在 Worker 內處理。
// 對照表見 docs/07-migration.md#網址對應與-seo
//
// ⚠️ 舊連結中的 GUID 可能是大寫，導轉時一律轉小寫 —— 新版路由用小寫。

import { defineMiddleware } from 'astro:middleware';

/** 舊路徑 → 新路徑的直接對應（不需要 query string）*/
const SIMPLE: Record<string, string> = {
  '/home': '/',
  '/home/index': '/',
  '/home/cars': '/cars',
  '/home/bikes': '/bikes',
  '/home/about': '/about',
  '/home/map': '/map',
  '/home/privacy': '/privacy',
};

/** 舊詳情頁 → 新詳情頁。VehicleID 從 query string 搬到路徑 */
const DETAIL: Record<string, string> = {
  '/home/cardetail': '/cars',
  '/home/bikedetail': '/bikes',
};

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const onRequest = defineMiddleware(async (context, next) => {
  const url = context.url;
  const path = url.pathname.toLowerCase().replace(/\/+$/, '') || '/';

  // 舊後台一律導到新後台登入頁；深層網址不需要保留
  if (path === '/backend' || path.startsWith('/backend/')) {
    return context.redirect('/admin/login', 301);
  }

  const detailBase = DETAIL[path];
  if (detailBase) {
    const id = url.searchParams.get('VehicleID')?.toLowerCase();
    // 認不出 id 就退回列表頁，不要丟 404 給搜尋引擎
    return context.redirect(id && GUID.test(id) ? `${detailBase}/${id}` : detailBase, 301);
  }

  const simple = SIMPLE[path];
  if (simple) {
    // 保留篩選參數（K / Year / Exterior 等沿用舊名，仍然有效）
    const qs = url.searchParams.toString();
    return context.redirect(qs ? `${simple}?${qs}` : simple, 301);
  }

  // 舊 Ajax 端點
  if (path === '/ajaxf/getvehiclemodelsbyvehiclemakeid') {
    const makeId = url.searchParams.get('VehicleMakeID') ?? '';
    return context.redirect(`/api/models?makeId=${encodeURIComponent(makeId)}`, 301);
  }

  let response = await next();

  // ⚠️ 從 Cache API 取出的 Response 標頭是唯讀的，直接 set 會丟
  //    "Can't modify immutable headers"。用 new Response(body, res) 產生可寫的副本，
  //    這只是複製 metadata、不會複製 body。
  const setHeaders = (res: Response): Response => {
    const apply = (r: Response) => {
      if (url.pathname.startsWith('/admin')) {
        r.headers.set('cache-control', 'no-store');
        r.headers.set('x-robots-tag', 'noindex, nofollow');
      }
      r.headers.set('x-content-type-options', 'nosniff');
      r.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
      return r;
    };
    try {
      return apply(res);
    } catch {
      return apply(new Response(res.body, res));
    }
  };

  response = setHeaders(response);
  return response;
});

// 後台頁面的共用守門邏輯。
//
// 🔴 每個後台頁面與 endpoint 都必須呼叫這裡，不能只靠版型或選單隱藏。
// 見 docs/08-security.md#授權

import type { APIContext } from 'astro';
import { getSessionAdmin, can, canView, checkCsrf, CSRF_FIELD, type AuthedAdmin, type ResourceKey, type Action } from './auth';

export class Redirect {
  constructor(public response: Response) {}
}

/** 取得已登入的管理員；未登入則丟出導向登入頁的 Response */
export async function requireAdmin(context: APIContext): Promise<AuthedAdmin> {
  const admin = await getSessionAdmin(context.request.headers.get('cookie'));
  if (!admin) {
    const next = encodeURIComponent(context.url.pathname + context.url.search);
    throw new Redirect(context.redirect(`/admin/login?next=${next}`, 302));
  }
  return admin;
}

/** 需要對某資源有讀取權；沒有就 403（不是藏起按鈕了事）*/
export async function requireView(context: APIContext, resource: ResourceKey): Promise<AuthedAdmin> {
  const admin = await requireAdmin(context);
  if (!(await canView(admin, resource))) throw new Redirect(forbidden());
  return admin;
}

/** 需要對某資源有指定的異動權限 */
export async function requireCan(context: APIContext, resource: ResourceKey, action: Action): Promise<AuthedAdmin> {
  const admin = await requireAdmin(context);
  if (!(await can(admin, resource, action))) throw new Redirect(forbidden());
  return admin;
}

function forbidden(): Response {
  return new Response('403 — 沒有執行這項操作的權限。', {
    status: 403,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

/** 異動操作必須是 POST 且帶有效 CSRF token */
export async function requirePost(context: APIContext, admin: AuthedAdmin): Promise<FormData> {
  if (context.request.method !== 'POST') {
    throw new Redirect(new Response('405 — 異動操作必須用 POST。', { status: 405 }));
  }
  const form = await context.request.formData();
  const token = form.get(CSRF_FIELD);
  if (!(await checkCsrf(admin.sessionId, typeof token === 'string' ? token : null))) {
    throw new Redirect(new Response('403 — CSRF token 無效，請重新整理後再試。', { status: 403 }));
  }
  return form;
}

/** 把守門丟出的 Redirect 轉回 Response，其餘錯誤照常往外拋 */
export function handleGuard(err: unknown): Response {
  if (err instanceof Redirect) return err.response;
  throw err;
}

export const str = (f: FormData, k: string): string => {
  const v = f.get(k);
  return typeof v === 'string' ? v.trim() : '';
};

export const int = (f: FormData, k: string): number | null => {
  const v = str(f, k);
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

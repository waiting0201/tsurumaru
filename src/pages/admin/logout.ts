// 登出。舊版只把 Session["IsLogin"] 設為 false 而沒有真正撤銷，
// 這裡刪除資料庫紀錄，舊 session id 立即失效。
import type { APIRoute } from 'astro';
import { getSessionAdmin, destroySession, clearCookie, checkCsrf, CSRF_FIELD } from '../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, url }) => {
  const admin = await getSessionAdmin(request.headers.get('cookie'));
  if (admin) {
    const form = await request.formData();
    const token = form.get(CSRF_FIELD);
    if (!(await checkCsrf(admin.sessionId, typeof token === 'string' ? token : null))) {
      return new Response('403 — CSRF token 無效。', { status: 403 });
    }
    await destroySession(admin.sessionId);
  }
  return new Response(null, {
    status: 302,
    headers: { location: '/admin/login', 'set-cookie': clearCookie(url.protocol === 'https:') },
  });
};

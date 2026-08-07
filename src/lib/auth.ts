// 後台認證與授權。
//
// 相對於舊版（docs/08-security.md）的改變：
//   • 移除寫死的後門帳號 weypro / AdminID=888
//   • 密碼改存 PBKDF2 雜湊，不再明碼
//   • 比對改為固定時間，且帳號不存在時仍執行一次雜湊運算
//   • session 存 D1 可真正撤銷，登出不只是清 cookie
//   • 權限以明確的 (resource, action) 宣告，不從 URL 或函式名推導
//   • 一律 fail closed

import { env } from 'cloudflare:workers';
import type { AdminRow } from './types';

// ── 密碼雜湊 ────────────────────────────────────────────
// Workers 沒有原生 bcrypt/argon2，用 WebCrypto 的 PBKDF2-SHA256。
//
// 🔴 這個數字受 Workers 免費方案的「每次呼叫 10ms CPU」硬上限約束。
//    密碼雜湊本來就是刻意耗 CPU 的，兩者直接衝突：
//      210,000 次 → 實測 21.6ms → 登入必定 500（曾實際發生）
//       25,000 次 → 實測  2.4ms → 留約 7ms 餘裕給其餘處理
//
//    調高之前務必先實測，並確認方案是否已升級（付費方案上限 30 秒）。
//    改動後既有的雜湊仍可驗證（迭代次數存在雜湊字串裡），登入成功時會
//    自動以新參數重新雜湊 —— 但如果調高到超過 CPU 預算，舊雜湊會連驗證
//    都跑不完，使用者會被鎖在外面。見 docs/08-security.md#密碼
//    與 docs/10-cost.md#最大的風險cpu-上限
export const ITERATIONS = 25_000;
const KEY_LEN = 32;

const b64 = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' }, key, KEY_LEN * 8);
}

/** 格式：pbkdf2$sha256$<iterations>$<salt_b64>$<hash_b64>，含參數以便日後升級 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2$sha256$${ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') return false;
  const iterations = Number(parts[2]);
  if (!Number.isInteger(iterations) || iterations < 1000) return false;
  const salt = unb64(parts[3]);
  const expected = unb64(parts[4]);
  const actual = new Uint8Array(await pbkdf2(password, salt, iterations));
  return timingSafeEqual(actual, expected);
}

/**
 * 帳號不存在時也跑一次，避免用回應時間推測帳號是否存在。
 * ⚠️ 迭代次數必須跟著 ITERATIONS 走 —— 寫死舊值的話，「帳號打錯」這條路徑
 *    會用舊的高迭代次數運算，一樣會撞破 CPU 上限。
 */
const DUMMY_HASH =
  `pbkdf2$sha256$${ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`;

// ── Session ─────────────────────────────────────────────
export const SESSION_COOKIE = 'tsurumaru_admin';
const SESSION_TTL_HOURS = 12;

const nowIso = () => new Date().toISOString().slice(0, 19) + 'Z';
const plusHoursIso = (h: number) =>
  new Date(Date.now() + h * 3600_000).toISOString().slice(0, 19) + 'Z';

const newToken = () => b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c] as string));

export async function createSession(adminId: number): Promise<{ id: string; expiresAt: string }> {
  const id = newToken();
  const expiresAt = plusHoursIso(SESSION_TTL_HOURS);
  await env.DB.prepare('INSERT INTO sessions (id, admin_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, adminId, expiresAt, nowIso())
    .run();
  return { id, expiresAt };
}

export async function destroySession(id: string): Promise<void> {
  await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
}

export interface AuthedAdmin {
  id: number;
  name: string | null;
  username: string;
  isSuper: boolean;
  sessionId: string;
}

export async function getSessionAdmin(cookieHeader: string | null): Promise<AuthedAdmin | null> {
  const sid = readCookie(cookieHeader, SESSION_COOKIE);
  if (!sid) return null;

  const row = await env.DB.prepare(`
      SELECT s.id AS sid, s.expires_at, a.id, a.name, a.username, a.is_super
      FROM sessions s JOIN admins a ON a.id = s.admin_id
      WHERE s.id = ?`)
    .bind(sid)
    .first<{ sid: string; expires_at: string; id: number; name: string | null; username: string; is_super: number }>();

  if (!row) return null;
  if (row.expires_at <= nowIso()) {
    await destroySession(sid);
    return null;
  }
  return { id: row.id, name: row.name, username: row.username, isSuper: row.is_super === 1, sessionId: row.sid };
}

export function sessionCookie(id: string, secure: boolean): string {
  const attrs = [`${SESSION_COOKIE}=${id}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${SESSION_TTL_HOURS * 3600}`];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

export function clearCookie(secure: boolean): string {
  const attrs = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=') || null;
  }
  return null;
}

// ── 登入 ────────────────────────────────────────────────
export async function login(username: string, password: string): Promise<AdminRow | null> {
  const admin = await env.DB.prepare('SELECT * FROM admins WHERE username = ?')
    .bind(username)
    .first<AdminRow>();

  // 帳號不存在也要跑一次雜湊，讓回應時間一致
  const ok = await verifyPassword(password, admin?.password_hash ?? DUMMY_HASH);
  if (!admin || !ok) return null;

  // 雜湊參數若與現行設定不同，趁手上有明文時就地升級。
  // 這讓日後調整 ITERATIONS 不需要所有人重設密碼。
  const storedIterations = Number(admin.password_hash.split('$')[2]);
  if (storedIterations !== ITERATIONS) {
    const rehashed = await hashPassword(password);
    await env.DB.prepare('UPDATE admins SET password_hash = ? WHERE id = ?')
      .bind(rehashed, admin.id)
      .run();
  }

  return admin;
}

// ── 授權 ────────────────────────────────────────────────
/**
 * 受保護的資源。權限節點的 key 直接對應這裡的值 —— 明確宣告，
 * 不像舊版從 action 名稱字串推導（改個名字就靜默失去控管）。
 */
export const RESOURCES = {
  MAKES: 'CarMakes',      // 車廠（汽機車共用同一節點群）
  MODELS: 'CarModels',
  VEHICLES: 'Cars',
  PHOTOS: 'Photos',       // 舊版權限樹缺這個節點，已於搬遷時補上
  ADMINS: 'Admins',
} as const;

export type ResourceKey = (typeof RESOURCES)[keyof typeof RESOURCES];
export type Action = 'add' | 'update' | 'delete';

/**
 * 查詢某管理員對某資源的權限。查不到一律視為無權限（fail closed）。
 * 超級管理員以資料庫的 is_super 旗標決定，不再硬編碼 ID。
 */
export async function can(admin: AuthedAdmin, resource: ResourceKey, action: Action): Promise<boolean> {
  if (admin.isSuper) return true;

  const col = { add: 'can_add', update: 'can_update', delete: 'can_delete' }[action];
  const row = await env.DB.prepare(`
      SELECT ap.${col} AS allowed
      FROM admin_permissions ap
      JOIN permissions p ON p.id = ap.permission_id
      WHERE ap.admin_id = ? AND p.key = ?`)
    .bind(admin.id, resource)
    .first<{ allowed: number }>();

  return row?.allowed === 1;
}

/** 可讀取（進得了列表頁）：有該資源的任一權限即可 */
export async function canView(admin: AuthedAdmin, resource: ResourceKey): Promise<boolean> {
  if (admin.isSuper) return true;
  const row = await env.DB.prepare(`
      SELECT 1 AS ok FROM admin_permissions ap
      JOIN permissions p ON p.id = ap.permission_id
      WHERE ap.admin_id = ? AND p.key = ?`)
    .bind(admin.id, resource)
    .first<{ ok: number }>();
  return !!row;
}

// ── CSRF ────────────────────────────────────────────────
// 所有異動操作都必須帶 token。舊版連刪除都用 GET，完全沒有防護。
export const CSRF_FIELD = 'csrf';

export async function csrfToken(sessionId: string): Promise<string> {
  const secret = (env as unknown as Record<string, unknown>).SESSION_SECRET;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(typeof secret === 'string' && secret ? secret : 'dev-only-insecure-secret'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(sessionId));
  return b64(sig);
}

export async function checkCsrf(sessionId: string, submitted: string | null): Promise<boolean> {
  if (!submitted) return false;
  const expected = await csrfToken(sessionId);
  return timingSafeEqual(new TextEncoder().encode(expected), new TextEncoder().encode(submitted));
}

#!/usr/bin/env node
// 設定管理員密碼（產生 PBKDF2 雜湊後寫進 D1）。
//
// 搬遷後所有管理員的 password_hash 都是停用佔位值 —— 舊版是明碼，刻意不搬。
// 見 docs/07-migration.md#管理員密碼
//
// 用法：
//   node scripts/set-admin-password.mjs <username> <password>            # 本地
//   node scripts/set-admin-password.mjs <username> <password> --remote   # 正式
//   node scripts/set-admin-password.mjs <username> <password> --super    # 一併設為超級管理員

import { execFileSync } from 'node:child_process';
import { webcrypto as crypto } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const remote = args.includes('--remote');
const makeSuper = args.includes('--super');
const [username, password] = args.filter((a) => !a.startsWith('--'));

if (!username || !password) {
  console.error('用法：node scripts/set-admin-password.mjs <username> <password> [--remote] [--super]');
  process.exit(1);
}
// 依業主決定，不設最短長度限制（2026-08-07）。空字串仍然拒絕 ——
// 那不是「短密碼」而是「沒有密碼」。見 docs/08-security.md#密碼

// 與 src/lib/auth.ts 的 hashPassword 完全相同的參數與格式
const ITERATIONS = 210_000;
const b64 = (buf) => Buffer.from(new Uint8Array(buf)).toString('base64');

const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
const bits = await crypto.subtle.deriveBits(
  { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, key, 256);
const hash = `pbkdf2$sha256$${ITERATIONS}$${b64(salt)}$${b64(bits)}`;

const esc = (s) => s.replace(/'/g, "''");
const sql = makeSuper
  ? `UPDATE admins SET password_hash='${esc(hash)}', is_super=1 WHERE username='${esc(username)}';`
  : `UPDATE admins SET password_hash='${esc(hash)}' WHERE username='${esc(username)}';`;

execFileSync('npx', ['wrangler', 'd1', 'execute', 'tsurumaru', remote ? '--remote' : '--local',
  '--command', sql], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });

const check = execFileSync('npx', ['wrangler', 'd1', 'execute', 'tsurumaru', remote ? '--remote' : '--local',
  '--json', '--command', `SELECT username, is_super, substr(password_hash,1,14) AS hash_prefix FROM admins WHERE username='${esc(username)}'`],
  { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

const rows = JSON.parse(check)[0].results;
if (!rows.length) {
  console.error(`❌ 找不到帳號「${username}」。可用的帳號請查 admins 資料表。`);
  process.exit(1);
}
console.log(`✅ 已更新 ${remote ? '正式' : '本地'} 環境的「${username}」`);
console.log(`   is_super=${rows[0].is_super}　hash=${rows[0].hash_prefix}…`);

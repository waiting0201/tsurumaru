#!/usr/bin/env node
// 設定管理員密碼（產生 PBKDF2 雜湊後寫進 D1）。
//
// 搬遷後所有管理員的 password_hash 都是停用佔位值 —— 舊版是明碼，刻意不搬。
// 見 docs/07-migration.md#管理員密碼
//
// 用法（密碼會互動輸入，不顯示在畫面上）：
//   node scripts/set-admin-password.mjs <username>            # 本地
//   node scripts/set-admin-password.mjs <username> --remote   # 正式
//   node scripts/set-admin-password.mjs <username> --super    # 一併設為超級管理員
//
// 密碼刻意「不」從命令列參數讀取：
//   • 含 ! $ ` " 空白等字元時很容易被 shell 吃掉或改寫，導致設進去的密碼
//     與你以為的不同（而且要等到登入失敗才會發現）
//   • 命令列參數會留在 shell 歷史與行程列表裡

import { execFileSync } from 'node:child_process';
import { webcrypto as crypto } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const remote = args.includes('--remote');
const makeSuper = args.includes('--super');
const positional = args.filter((a) => !a.startsWith('--'));
const username = positional[0];

if (!username) {
  console.error('用法：node scripts/set-admin-password.mjs <username> [--remote] [--super]');
  console.error('（密碼會在執行後互動輸入，不放在命令列上）');
  process.exit(1);
}

/** 隱藏輸入的提示。回傳原始字串，不做任何 trim —— 密碼的頭尾空白也是密碼的一部分 */
function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const onData = (char) => {
      if (['\n', '\r', ''].includes(String(char))) process.stdin.removeListener('data', onData);
      else process.stdout.write('\x1B[2K\x1B[200D' + question + '*'.repeat(rl.line.length));
    };
    process.stdout.write(question);
    process.stdin.on('data', onData);
    rl.question('', (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

let password = positional[1];
if (password) {
  console.warn('⚠️ 偵測到密碼寫在命令列上。特殊字元可能已被 shell 改寫，且會留在 shell 歷史裡。');
  console.warn('   建議改為：node scripts/set-admin-password.mjs ' + username + (remote ? ' --remote' : '') + (makeSuper ? ' --super' : ''));
} else {
  password = await promptHidden('請輸入新密碼：');
  const again = await promptHidden('再輸入一次確認：');
  if (password !== again) {
    console.error('❌ 兩次輸入不一致，未做任何變更。');
    process.exit(1);
  }
}

if (!password) {
  console.error('❌ 密碼不可為空。');
  process.exit(1);
}
// 依業主決定，不設最短長度限制（2026-08-07）。空字串仍然拒絕 ——
// 那不是「短密碼」而是「沒有密碼」。見 docs/08-security.md#密碼

// 必須與 src/lib/auth.ts 的 ITERATIONS 相同 —— 那邊受 Workers 免費方案的
// 10ms CPU 上限約束（見該檔註解）。這裡設得比較高不會報錯，但產生的雜湊
// 在正式環境會驗證不完，使用者會被鎖在外面。
const ITERATIONS = 25_000;
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
  '--json', '--command', `SELECT username, is_super, substr(password_hash,1,22) AS hash_prefix FROM admins WHERE username='${esc(username)}'`],
  { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

const rows = JSON.parse(check)[0].results;
if (!rows.length) {
  console.error(`❌ 找不到帳號「${username}」。`);
  console.error('   目前資料庫裡的帳號：');
  const all = execFileSync('npx', ['wrangler', 'd1', 'execute', 'tsurumaru', remote ? '--remote' : '--local',
    '--json', '--command', 'SELECT username FROM admins'],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  for (const r of JSON.parse(all)[0].results) console.error('     - ' + r.username);
  process.exit(1);
}

// 確認實際寫進去的迭代次數就是我們預期的。寫入失敗、或改了常數卻沒重新部署，
// 都會在這裡被抓到，而不是等到使用者登入失敗。
const written = Number(String(rows[0].hash_prefix).split('$')[2]);
if (written !== ITERATIONS) {
  console.error(`❌ 寫入的迭代次數是 ${written}，預期 ${ITERATIONS}。密碼可能未實際更新。`);
  process.exit(1);
}

console.log(`✅ 已更新 ${remote ? '正式' : '本地'} 環境的「${username}」`);
console.log(`   is_super=${rows[0].is_super}　迭代次數=${written}`);
console.log(`\n   登入網址：${remote ? 'https://www.tsurumarucorp.com/admin/login' : 'http://localhost:4321/admin/login'}`);

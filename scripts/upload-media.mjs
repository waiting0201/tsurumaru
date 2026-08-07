#!/usr/bin/env node
// 把舊系統的上傳圖片搬到 R2。
//
//   舊：reference/old/Tsurumaru/Upload/{Cars,Motors}/{VehicleID}/{檔名}
//   新：R2 key  vehicles/{vehicle_id}/{檔名}
//
// 汽車與機車合併到同一前綴（vehicle_id 全域唯一）。見 docs/07-migration.md#圖片搬遷
//
// ⚠️ 目錄名大小寫：來源檔案系統用小寫、資料庫存大寫。R2 的 key 與 D1 的字串
//    比較都分大小寫，因此一律正規化為小寫。
//
// 用法：
//   node scripts/upload-media.mjs            # 只對帳，不上傳
//   node scripts/upload-media.mjs --upload   # 實際上傳（本地模擬）
//   node scripts/upload-media.mjs --upload --remote   # 上傳到正式 R2

import { readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const UPLOAD_DIR = join(ROOT, 'reference/old/Tsurumaru/Upload');
const BUCKET = 'tsurumaru-media';

const doUpload = process.argv.includes('--upload');
const remote = process.argv.includes('--remote');

if (!existsSync(UPLOAD_DIR)) {
  console.error(`❌ 找不到 ${UPLOAD_DIR}`);
  console.error('   reference/ 未進版控，新複製的工作副本不會有這個目錄。');
  process.exit(1);
}

// ── 掃描檔案系統 ────────────────────────────────────────
const onDisk = new Map();   // key: "vehicleId/檔名" → 完整路徑
for (const kind of ['Cars', 'Motors']) {
  const base = join(UPLOAD_DIR, kind);
  if (!existsSync(base)) continue;
  for (const vid of readdirSync(base)) {
    const vdir = join(base, vid);
    if (!statSync(vdir).isDirectory()) continue;
    for (const file of readdirSync(vdir)) {
      if (file === '.DS_Store') continue;
      onDisk.set(`${vid.toLowerCase()}/${file}`, join(vdir, file));
    }
  }
}

// ── 讀資料庫紀錄 ────────────────────────────────────────
const d1 = (sql) => {
  const args = ['wrangler', 'd1', 'execute', 'tsurumaru', remote ? '--remote' : '--local',
                '--json', '--command', sql];
  const out = execFileSync('npx', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out)[0].results;
};

const inDb = new Map();     // key: "vehicleId/檔名"
for (const r of d1('SELECT id, photo FROM vehicles')) inDb.set(`${r.id}/${r.photo}`, '主圖');
for (const r of d1('SELECT vehicle_id, photo FROM vehicle_photos')) inDb.set(`${r.vehicle_id}/${r.photo}`, '相簿');

// ── 對帳 ────────────────────────────────────────────────
const missingFile = [...inDb.keys()].filter((k) => !onDisk.has(k));   // 有紀錄無檔案
const orphanFile = [...onDisk.keys()].filter((k) => !inDb.has(k));    // 有檔案無紀錄

console.log(`檔案系統 ${onDisk.size} 個檔案　資料庫 ${inDb.size} 筆紀錄`);
if (missingFile.length) {
  console.log(`\n❌ 有紀錄但找不到檔案（${missingFile.length}）— 這些會在前台變成破圖：`);
  for (const k of missingFile) console.log(`   ${k}  [${inDb.get(k)}]`);
}
if (orphanFile.length) {
  console.log(`\n⚠️ 有檔案但無紀錄（${orphanFile.length}）— 不會上傳：`);
  for (const k of orphanFile) console.log(`   ${k}`);
}
if (!missingFile.length && !orphanFile.length) console.log('✅ 雙向完全對應，零孤兒');

// ── 上傳 ────────────────────────────────────────────────
if (!doUpload) {
  console.log('\n（僅對帳。加上 --upload 才會實際上傳，再加 --remote 上傳到正式環境）');
  process.exit(missingFile.length ? 1 : 0);
}

const target = remote ? '正式 R2' : '本地模擬';
console.log(`\n上傳到 ${target}…`);
let ok = 0;
for (const [key, path] of onDisk) {
  if (!inDb.has(key)) continue;                       // 孤兒檔案不上傳
  const objectKey = `vehicles/${key}`;                // key 已正規化為小寫
  execFileSync('npx', [
    'wrangler', 'r2', 'object', 'put', `${BUCKET}/${objectKey}`,
    '--file', path, remote ? '--remote' : '--local',
  ], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  console.log(`  ✅ ${objectKey}`);
  ok++;
}
console.log(`\n完成：${ok} 個物件已上傳到 ${target}`);

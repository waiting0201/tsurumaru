#!/usr/bin/env node
// 把 scripts/src/*.json（舊 SQL Server 匯出）轉成 D1 可匯入的 SQL。
//
// 轉檔規則見 docs/07-migration.md#轉檔規則務必逐條套用
// 型別對照見 docs/03-data-model.md#型別對照sql-server--d1sqlite
//
// 用法：node scripts/transform.mjs  →  scripts/out/seed.sql

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, 'src');
const OUT = join(HERE, 'out');

const read = (name) => {
  const p = join(SRC, `${name}.json`);
  if (!existsSync(p)) throw new Error(`找不到 ${p} — 請先執行 scripts/export-legacy.sh`);
  const raw = readFileSync(p, 'utf8').trim();
  return raw ? JSON.parse(raw) : [];
};

// ── 值的正規化 ──────────────────────────────────────────
// GUID 一律小寫。來源資料庫存大寫、檔案系統用小寫，
// 而 R2 的 key 與 D1 的字串比較都分大小寫 → 兩邊都必須統一。
const guid = (v) => (v == null ? null : String(v).trim().toLowerCase());

// SQL Server datetime → ISO-8601 UTC。
// 來源沒有時區資訊，視為 UTC+8（台灣）後轉 UTC。
const TZ_OFFSET_HOURS = 8;
const isoUtc = (v) => {
  if (v == null) return null;
  const s = String(v).trim().replace(' ', 'T');
  const d = new Date(`${s}Z`);                       // 先當成 UTC 解析
  if (Number.isNaN(d.getTime())) throw new Error(`無法解析日期：${v}`);
  d.setUTCHours(d.getUTCHours() - TZ_OFFSET_HOURS);  // 再扣掉當地時區
  return `${d.toISOString().slice(0, 19)}Z`;
};

const bit = (v) => (v === true || v === 1 || v === '1' ? 1 : 0);
const trimOrNull = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;   // 空字串轉 NULL — 篩選邏輯依賴 NULL 判斷
};
const intOrNull = (v) => (v == null || v === '' ? null : Number(v));

// ── SQL 產生 ────────────────────────────────────────────
const lit = (v) => {
  if (v == null) return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
};

const insert = (table, cols, rows) => {
  if (!rows.length) return `-- ${table}：0 筆\n`;
  const lines = rows.map((r) => `  (${cols.map((c) => lit(r[c])).join(', ')})`);
  return `-- ${table}：${rows.length} 筆\n` +
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES\n${lines.join(',\n')};\n`;
};

// ── 轉換 ────────────────────────────────────────────────
const problems = [];

const makes = read('vehicle_makes').map((r) => ({
  id: r.VehicleMakeID,
  type: r.Type,
  code: trimOrNull(r.Code) ?? '',
  title: trimOrNull(r.Title) ?? '',
  sort: r.Sort ?? 0,
}));

const models = read('vehicle_models').map((r) => ({
  id: r.VehicleModelID,
  vehicle_make_id: r.VehicleMakeID,
  code: trimOrNull(r.Code) ?? '',
  // ⚠️ 不要 trim Title：舊資料用開頭的 " - " 表示階層（見 03-data-model）
  title: r.Title ?? '',
  sort: r.Sort ?? 0,
}));

const vehicles = read('vehicles').map((r) => ({
  id: guid(r.VehicleID),
  vehicle_model_id: r.VehicleModelID,
  type: r.Type,
  year: intOrNull(r.Year),
  fuel: intOrNull(r.Fuel),
  mileage: intOrNull(r.Mileage),
  vehicle_type: trimOrNull(r.VehicleType),
  driveline: trimOrNull(r.Driveline),
  exterior: trimOrNull(r.Exterior),
  interior: trimOrNull(r.Interior),
  engine: trimOrNull(r.Engine),
  transmission: trimOrNull(r.Transmission),
  cc: intOrNull(r.Cc),
  location: trimOrNull(r.Location),
  vin: trimOrNull(r.VIN),
  summary: r.Summary ?? null,          // 長文本原樣保留（含 HTML）
  description: r.Description ?? null,
  photo: trimOrNull(r.Photo) ?? '',
  price: r.Price ?? 0,
  created_at: isoUtc(r.Createdate),
  views: r.Views ?? 0,
  sort: r.Sort ?? 0,
}));

const photos = read('vehicle_photos').map((r) => ({
  id: guid(r.VehiclePhotoID),
  vehicle_id: guid(r.VehicleID),
  photo: trimOrNull(r.Photo) ?? '',
  title: trimOrNull(r.Title),
  sort: r.Sort ?? 0,
}));

// 密碼不搬遷（舊版明碼）。填入不可能匹配的佔位值，上線後走重設流程。
// 見 docs/07-migration.md#管理員密碼
const NO_LOGIN = '!disabled-no-password-set';
const admins = read('admins').map((r) => ({
  id: r.AdminID,
  name: trimOrNull(r.Name),
  username: trimOrNull(r.Username) ?? '',
  password_hash: NO_LOGIN,
  email: trimOrNull(r.Email),
  is_super: 0,
  created_at: new Date().toISOString().slice(0, 19) + 'Z',
}));

const permissions = read('permissions').map((r) => ({
  id: r.LimID,
  key: trimOrNull(r.Key) ?? '',
  value: trimOrNull(r.Value),
  icon: trimOrNull(r.Icon),
  sort: r.Sort ?? 0,
  parent_id: intOrNull(r.ParentID),
}));

// 舊版權限樹缺相簿節點，導致相簿管理對一般管理員完全不可用。
// 見 docs/08-security.md#相簿管理對一般管理員完全不可用
const webMs = permissions.find((p) => p.key === 'WebMs');
const maxId = permissions.reduce((m, p) => Math.max(m, p.id), 0);
if (webMs && !permissions.some((p) => p.key === 'Photos')) {
  permissions.push({
    id: maxId + 1,
    key: 'Photos',
    value: '車輛相簿維護',
    icon: null,
    sort: 30,
    parent_id: webMs.id,
  });
  problems.push('已補上舊版缺少的「Photos」權限節點（修正相簿管理不可用的缺陷）');
}

const adminPerms = read('admin_perms').map((r) => ({
  id: guid(r.AdminLimID),
  admin_id: r.AdminID,
  permission_id: r.LimID,
  can_add: bit(r.IsAdd),
  can_update: bit(r.IsUpdate),
  can_delete: bit(r.IsDelete),
}));

// ── 完整性檢查（產出前就擋下問題）────────────────────────
const makeIds = new Set(makes.map((m) => m.id));
const modelIds = new Set(models.map((m) => m.id));
const vehicleIds = new Set(vehicles.map((v) => v.id));
const permIds = new Set(permissions.map((p) => p.id));
const adminIds = new Set(admins.map((a) => a.id));

for (const m of models) if (!makeIds.has(m.vehicle_make_id)) problems.push(`車型 ${m.id} 指向不存在的車廠 ${m.vehicle_make_id}`);
for (const v of vehicles) if (!modelIds.has(v.vehicle_model_id)) problems.push(`車輛 ${v.id} 指向不存在的車型 ${v.vehicle_model_id}`);
for (const p of photos) if (!vehicleIds.has(p.vehicle_id)) problems.push(`相片 ${p.id} 指向不存在的車輛 ${p.vehicle_id}`);
for (const ap of adminPerms) {
  if (!adminIds.has(ap.admin_id)) problems.push(`權限指派 ${ap.id} 指向不存在的管理員 ${ap.admin_id}`);
  if (!permIds.has(ap.permission_id)) problems.push(`權限指派 ${ap.id} 指向不存在的權限節點 ${ap.permission_id}`);
}
for (const v of vehicles) {
  if (![1, 2].includes(v.type)) problems.push(`車輛 ${v.id} 的 type=${v.type} 不在 {1,2}`);
  if (!v.photo) problems.push(`車輛 ${v.id} 沒有主圖檔名`);
}

// ── 輸出 ────────────────────────────────────────────────
mkdirSync(OUT, { recursive: true });

const sql = [
  '-- 由 scripts/transform.mjs 產生，請勿手改。',
  '-- 重跑前請先清空資料表（本檔開頭已含 DELETE）。',
  '',
  'PRAGMA defer_foreign_keys = ON;',
  '',
  'DELETE FROM admin_permissions;',
  'DELETE FROM sessions;',
  'DELETE FROM vehicle_photos;',
  'DELETE FROM vehicles;',
  'DELETE FROM vehicle_models;',
  'DELETE FROM vehicle_makes;',
  'DELETE FROM permissions;',
  'DELETE FROM admins;',
  '',
  insert('vehicle_makes', ['id', 'type', 'code', 'title', 'sort'], makes),
  insert('vehicle_models', ['id', 'vehicle_make_id', 'code', 'title', 'sort'], models),
  insert('vehicles', ['id', 'vehicle_model_id', 'type', 'year', 'fuel', 'mileage', 'vehicle_type',
    'driveline', 'exterior', 'interior', 'engine', 'transmission', 'cc', 'location', 'vin',
    'summary', 'description', 'photo', 'price', 'created_at', 'views', 'sort'], vehicles),
  insert('vehicle_photos', ['id', 'vehicle_id', 'photo', 'title', 'sort'], photos),
  insert('admins', ['id', 'name', 'username', 'password_hash', 'email', 'is_super', 'created_at'], admins),
  insert('permissions', ['id', 'key', 'value', 'icon', 'sort', 'parent_id'], permissions),
  insert('admin_permissions', ['id', 'admin_id', 'permission_id', 'can_add', 'can_update', 'can_delete'], adminPerms),
].join('\n');

writeFileSync(join(OUT, 'seed.sql'), sql);

console.log('轉檔完成：');
console.log(`  車廠 ${makes.length}　車型 ${models.length}　車輛 ${vehicles.length}　相片 ${photos.length}`);
console.log(`  管理員 ${admins.length}　權限節點 ${permissions.length}　權限指派 ${adminPerms.length}`);
console.log(`  → ${join(OUT, 'seed.sql')}`);
if (problems.length) {
  console.log('\n注意事項：');
  for (const p of problems) console.log(`  • ${p}`);
}
console.log('\n⚠️ 所有管理員密碼皆為停用佔位值，上線後需走重設流程。');

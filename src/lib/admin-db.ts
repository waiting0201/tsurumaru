// 後台的資料存取。前台查詢在 db.ts，這裡只放需要寫入或跨類型讀取的操作。
// 🔴 一律 prepared statement 綁參數。

import { env } from 'cloudflare:workers';
import type {
  AdminRow, PermissionRow, Paged, VehicleMakeRow, VehicleModelRow,
  VehiclePhotoRow, VehicleRow, VehicleWithNames,
} from './types';

const db = () => env.DB;
export const PAGE_SIZE = 20;

const paged = <T>(items: T[], page: number, total: number): Paged<T> => ({
  items, page, pageSize: PAGE_SIZE, total,
  totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
});

const offset = (page: number) => (Math.max(1, page) - 1) * PAGE_SIZE;

// ── 車廠 ────────────────────────────────────────────────
export async function listMakes(type: number, page: number): Promise<Paged<VehicleMakeRow>> {
  const c = await db().prepare('SELECT COUNT(*) AS n FROM vehicle_makes WHERE type = ?').bind(type).first<{ n: number }>();
  const r = await db().prepare('SELECT * FROM vehicle_makes WHERE type = ? ORDER BY sort ASC, id ASC LIMIT ? OFFSET ?')
    .bind(type, PAGE_SIZE, offset(page)).all<VehicleMakeRow>();
  return paged(r.results ?? [], page, c?.n ?? 0);
}

export const getMake = (id: number) =>
  db().prepare('SELECT * FROM vehicle_makes WHERE id = ?').bind(id).first<VehicleMakeRow>();

export const createMake = (type: number, code: string, title: string, sort: number) =>
  db().prepare('INSERT INTO vehicle_makes (type, code, title, sort) VALUES (?, ?, ?, ?)').bind(type, code, title, sort).run();

export const updateMake = (id: number, code: string, title: string, sort: number) =>
  db().prepare('UPDATE vehicle_makes SET code = ?, title = ?, sort = ? WHERE id = ?').bind(code, title, sort, id).run();

export const deleteMake = (id: number) =>
  db().prepare('DELETE FROM vehicle_makes WHERE id = ?').bind(id).run();

/** 刪除前檢查是否還有車型掛在底下 */
export async function makeInUse(id: number): Promise<number> {
  const r = await db().prepare('SELECT COUNT(*) AS n FROM vehicle_models WHERE vehicle_make_id = ?').bind(id).first<{ n: number }>();
  return r?.n ?? 0;
}

export async function allMakes(type: number): Promise<VehicleMakeRow[]> {
  const r = await db().prepare('SELECT * FROM vehicle_makes WHERE type = ? ORDER BY sort ASC, title ASC').bind(type).all<VehicleMakeRow>();
  return r.results ?? [];
}

// ── 車型 ────────────────────────────────────────────────
export interface ModelWithMake extends VehicleModelRow { make_title: string; make_type: number }

export async function listModels(type: number, makeId: number | null, page: number): Promise<Paged<ModelWithMake>> {
  const where = makeId ? 'mk.type = ? AND md.vehicle_make_id = ?' : 'mk.type = ?';
  const binds: unknown[] = makeId ? [type, makeId] : [type];
  const c = await db().prepare(`SELECT COUNT(*) AS n FROM vehicle_models md JOIN vehicle_makes mk ON mk.id = md.vehicle_make_id WHERE ${where}`)
    .bind(...binds).first<{ n: number }>();
  const r = await db().prepare(`
      SELECT md.*, mk.title AS make_title, mk.type AS make_type
      FROM vehicle_models md JOIN vehicle_makes mk ON mk.id = md.vehicle_make_id
      WHERE ${where} ORDER BY md.sort ASC, md.id ASC LIMIT ? OFFSET ?`)
    .bind(...binds, PAGE_SIZE, offset(page)).all<ModelWithMake>();
  return paged(r.results ?? [], page, c?.n ?? 0);
}

export const getModelRow = (id: number) =>
  db().prepare('SELECT * FROM vehicle_models WHERE id = ?').bind(id).first<VehicleModelRow>();

export const createModel = (makeId: number, code: string, title: string, sort: number) =>
  db().prepare('INSERT INTO vehicle_models (vehicle_make_id, code, title, sort) VALUES (?, ?, ?, ?)').bind(makeId, code, title, sort).run();

export const updateModel = (id: number, makeId: number, code: string, title: string, sort: number) =>
  db().prepare('UPDATE vehicle_models SET vehicle_make_id = ?, code = ?, title = ?, sort = ? WHERE id = ?').bind(makeId, code, title, sort, id).run();

export const deleteModel = (id: number) =>
  db().prepare('DELETE FROM vehicle_models WHERE id = ?').bind(id).run();

export async function modelInUse(id: number): Promise<number> {
  const r = await db().prepare('SELECT COUNT(*) AS n FROM vehicles WHERE vehicle_model_id = ?').bind(id).first<{ n: number }>();
  return r?.n ?? 0;
}

export async function modelsForType(type: number): Promise<ModelWithMake[]> {
  const r = await db().prepare(`
      SELECT md.*, mk.title AS make_title, mk.type AS make_type
      FROM vehicle_models md JOIN vehicle_makes mk ON mk.id = md.vehicle_make_id
      WHERE mk.type = ? ORDER BY mk.sort ASC, md.sort ASC`).bind(type).all<ModelWithMake>();
  return r.results ?? [];
}

// ── 車輛 ────────────────────────────────────────────────
export async function listVehiclesAdmin(type: number, page: number): Promise<Paged<VehicleWithNames>> {
  const c = await db().prepare('SELECT COUNT(*) AS n FROM vehicles WHERE type = ?').bind(type).first<{ n: number }>();
  const r = await db().prepare(`
      SELECT v.*, md.title AS model_title, mk.title AS make_title, mk.id AS make_id
      FROM vehicles v
      JOIN vehicle_models md ON md.id = v.vehicle_model_id
      JOIN vehicle_makes  mk ON mk.id = md.vehicle_make_id
      WHERE v.type = ? ORDER BY v.sort ASC, v.created_at DESC LIMIT ? OFFSET ?`)
    .bind(type, PAGE_SIZE, offset(page)).all<VehicleWithNames>();
  return paged(r.results ?? [], page, c?.n ?? 0);
}

export const getVehicleRow = (id: string) =>
  db().prepare('SELECT * FROM vehicles WHERE id = ?').bind(id.toLowerCase()).first<VehicleRow>();

export type VehicleInput = Omit<VehicleRow, 'created_at' | 'views'>;

export function insertVehicle(v: VehicleInput, createdAt: string) {
  return db().prepare(`
      INSERT INTO vehicles (id, vehicle_model_id, type, year, fuel, mileage, vehicle_type, driveline,
        exterior, interior, engine, transmission, cc, location, vin, summary, description, photo,
        price, created_at, views, sort)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)`)
    .bind(v.id, v.vehicle_model_id, v.type, v.year, v.fuel, v.mileage, v.vehicle_type, v.driveline,
      v.exterior, v.interior, v.engine, v.transmission, v.cc, v.location, v.vin, v.summary,
      v.description, v.photo, v.price, createdAt, v.sort).run();
}

export function updateVehicle(v: VehicleInput) {
  return db().prepare(`
      UPDATE vehicles SET vehicle_model_id=?, year=?, fuel=?, mileage=?, vehicle_type=?, driveline=?,
        exterior=?, interior=?, engine=?, transmission=?, cc=?, location=?, vin=?, summary=?,
        description=?, photo=?, price=?, sort=? WHERE id=?`)
    .bind(v.vehicle_model_id, v.year, v.fuel, v.mileage, v.vehicle_type, v.driveline, v.exterior,
      v.interior, v.engine, v.transmission, v.cc, v.location, v.vin, v.summary, v.description,
      v.photo, v.price, v.sort, v.id).run();
}

export const deleteVehicle = (id: string) =>
  db().prepare('DELETE FROM vehicles WHERE id = ?').bind(id.toLowerCase()).run();

// ── 相簿 ────────────────────────────────────────────────
export async function listPhotos(vehicleId: string): Promise<VehiclePhotoRow[]> {
  const r = await db().prepare('SELECT * FROM vehicle_photos WHERE vehicle_id = ? ORDER BY sort ASC')
    .bind(vehicleId.toLowerCase()).all<VehiclePhotoRow>();
  return r.results ?? [];
}

export const getPhoto = (id: string) =>
  db().prepare('SELECT * FROM vehicle_photos WHERE id = ?').bind(id).first<VehiclePhotoRow>();

/**
 * 下一張相片該用的 sort 值 = 目前最大值 + 5。
 *
 * 用 MAX 而不是「現有張數 × 5」—— 既有相片的 sort 是店員手改過的，
 * 不保證還是 0/5/10 這種規律，用張數推算會撞到已經存在的值。
 */
export async function nextPhotoSort(vehicleId: string): Promise<number> {
  const row = await db()
    .prepare('SELECT COALESCE(MAX(sort), -5) + 5 AS next FROM vehicle_photos WHERE vehicle_id = ?')
    .bind(vehicleId.toLowerCase())
    .first<{ next: number }>();
  return row?.next ?? 0;
}

export const insertPhoto = (p: VehiclePhotoRow) =>
  db().prepare('INSERT INTO vehicle_photos (id, vehicle_id, photo, title, sort) VALUES (?,?,?,?,?)')
    .bind(p.id, p.vehicle_id.toLowerCase(), p.photo, p.title, p.sort).run();

export const updatePhotoMeta = (id: string, title: string | null, sort: number) =>
  db().prepare('UPDATE vehicle_photos SET title = ?, sort = ? WHERE id = ?').bind(title, sort, id).run();

export const deletePhotoRow = (id: string) =>
  db().prepare('DELETE FROM vehicle_photos WHERE id = ?').bind(id).run();

// ── 排序 ────────────────────────────────────────────────
/** 批次更新排序值。用 batch() 一次原子執行（D1 沒有互動式交易）*/
export function updateSorts(table: 'vehicle_makes' | 'vehicle_models' | 'vehicles' | 'vehicle_photos',
                            pairs: { id: string | number; sort: number }[]) {
  if (!pairs.length) return Promise.resolve([]);
  return db().batch(pairs.map((p) =>
    db().prepare(`UPDATE ${table} SET sort = ? WHERE id = ?`).bind(p.sort, p.id)));
}

// ── 管理員與權限 ────────────────────────────────────────
export async function listAdmins(): Promise<AdminRow[]> {
  const r = await db().prepare('SELECT * FROM admins ORDER BY id ASC').all<AdminRow>();
  return r.results ?? [];
}

export const getAdmin = (id: number) =>
  db().prepare('SELECT * FROM admins WHERE id = ?').bind(id).first<AdminRow>();

export const insertAdmin = (name: string | null, username: string, hash: string, email: string | null, isSuper: number) =>
  db().prepare('INSERT INTO admins (name, username, password_hash, email, is_super, created_at) VALUES (?,?,?,?,?,?)')
    .bind(name, username, hash, email, isSuper, new Date().toISOString().slice(0, 19) + 'Z').run();

export const updateAdminInfo = (id: number, name: string | null, email: string | null, isSuper: number) =>
  db().prepare('UPDATE admins SET name = ?, email = ?, is_super = ? WHERE id = ?').bind(name, email, isSuper, id).run();

export const updateAdminPassword = (id: number, hash: string) =>
  db().prepare('UPDATE admins SET password_hash = ? WHERE id = ?').bind(hash, id).run();

export const deleteAdmin = (id: number) =>
  db().prepare('DELETE FROM admins WHERE id = ?').bind(id).run();

export async function allPermissions(): Promise<PermissionRow[]> {
  const r = await db().prepare('SELECT * FROM permissions ORDER BY COALESCE(parent_id, 0) ASC, sort ASC').all<PermissionRow>();
  return r.results ?? [];
}

export async function adminPermissionMap(adminId: number): Promise<Map<number, { add: boolean; update: boolean; delete: boolean }>> {
  const r = await db().prepare('SELECT permission_id, can_add, can_update, can_delete FROM admin_permissions WHERE admin_id = ?')
    .bind(adminId).all<{ permission_id: number; can_add: number; can_update: number; can_delete: number }>();
  const m = new Map<number, { add: boolean; update: boolean; delete: boolean }>();
  for (const row of r.results ?? []) {
    m.set(row.permission_id, { add: row.can_add === 1, update: row.can_update === 1, delete: row.can_delete === 1 });
  }
  return m;
}

export async function setAdminPermissions(adminId: number,
    perms: { permissionId: number; add: boolean; update: boolean; delete: boolean }[]) {
  const stmts = [db().prepare('DELETE FROM admin_permissions WHERE admin_id = ?').bind(adminId)];
  for (const p of perms) {
    if (!p.add && !p.update && !p.delete) continue;
    stmts.push(db().prepare(
      'INSERT INTO admin_permissions (id, admin_id, permission_id, can_add, can_update, can_delete) VALUES (?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), adminId, p.permissionId, p.add ? 1 : 0, p.update ? 1 : 0, p.delete ? 1 : 0));
  }
  return db().batch(stmts);
}

// ── 總覽統計 ────────────────────────────────────────────
export async function dashboardStats() {
  return db().prepare(`
    SELECT
      (SELECT COUNT(*) FROM vehicles WHERE type = 1) AS cars,
      (SELECT COUNT(*) FROM vehicles WHERE type = 2) AS bikes,
      (SELECT COUNT(*) FROM vehicle_makes)  AS makes,
      (SELECT COUNT(*) FROM vehicle_models) AS models,
      (SELECT COUNT(*) FROM vehicle_photos) AS photos,
      (SELECT COUNT(*) FROM admins)         AS admins`)
    .first<{ cars: number; bikes: number; makes: number; models: number; photos: number; admins: number }>();
}

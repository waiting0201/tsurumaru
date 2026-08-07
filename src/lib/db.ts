// D1 查詢層。
//
// 🔴 只有 src/lib/ 可以直接使用 env.DB。頁面與元件一律透過這裡取資料。
// 🔴 一律用 prepared statement 綁參數，禁止字串拼接 SQL。
// 見 docs/04-conventions.md#資料存取

import { env } from 'cloudflare:workers';
import type {
  Paged, VehicleMakeRow, VehicleModelRow, VehiclePhotoRow, VehicleWithNames,
} from './types';
import { buildWhere, type VehicleFilters } from './filters';

const db = () => env.DB;

/** 前台每頁 8 筆、後台每頁 20 筆（docs/03-data-model.md#業務規則）*/
export const PAGE_SIZE_SITE = 8;
export const PAGE_SIZE_ADMIN = 20;

const VEHICLE_SELECT = `
  SELECT v.*, md.title AS model_title, mk.title AS make_title, mk.id AS make_id
  FROM vehicles v
  JOIN vehicle_models md ON md.id = v.vehicle_model_id
  JOIN vehicle_makes  mk ON mk.id = md.vehicle_make_id`;

/** 首頁：某類型 sort 最小的 N 台 */
export async function getFeatured(type: number, limit: number): Promise<VehicleWithNames[]> {
  const r = await db()
    .prepare(`${VEHICLE_SELECT} WHERE v.type = ? ORDER BY v.sort ASC LIMIT ?`)
    .bind(type, limit)
    .all<VehicleWithNames>();
  return r.results ?? [];
}

/** 列表頁：篩選 + 分頁。一律依 sort 遞增，沒有其他排序選項 */
export async function listVehicles(
  type: number,
  filters: VehicleFilters,
  page: number,
  includeCarOnly: boolean,
  pageSize = PAGE_SIZE_SITE,
): Promise<Paged<VehicleWithNames>> {
  const { sql, binds } = buildWhere(type, filters, includeCarOnly);

  const countRow = await db()
    .prepare(`SELECT COUNT(*) AS n FROM vehicles v
              JOIN vehicle_models md ON md.id = v.vehicle_model_id
              JOIN vehicle_makes  mk ON mk.id = md.vehicle_make_id
              WHERE ${sql}`)
    .bind(...binds)
    .first<{ n: number }>();

  const total = countRow?.n ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const r = await db()
    .prepare(`${VEHICLE_SELECT} WHERE ${sql} ORDER BY v.sort ASC LIMIT ? OFFSET ?`)
    .bind(...binds, pageSize, (safePage - 1) * pageSize)
    .all<VehicleWithNames>();

  return { items: r.results ?? [], page: safePage, pageSize, total, totalPages };
}

export async function getVehicle(id: string): Promise<VehicleWithNames | null> {
  return db()
    .prepare(`${VEHICLE_SELECT} WHERE v.id = ?`)
    .bind(id.toLowerCase())
    .first<VehicleWithNames>();
}

export async function getVehiclePhotos(vehicleId: string): Promise<VehiclePhotoRow[]> {
  const r = await db()
    .prepare('SELECT * FROM vehicle_photos WHERE vehicle_id = ? ORDER BY sort ASC')
    .bind(vehicleId.toLowerCase())
    .all<VehiclePhotoRow>();
  return r.results ?? [];
}

/** 非阻塞地累加瀏覽次數。舊版其實從未累加（docs/03-data-model.md#業務規則）*/
export function bumpViews(id: string): Promise<unknown> {
  return db().prepare('UPDATE vehicles SET views = views + 1 WHERE id = ?').bind(id.toLowerCase()).run();
}

export async function getMakes(type: number): Promise<VehicleMakeRow[]> {
  const r = await db()
    .prepare('SELECT * FROM vehicle_makes WHERE type = ? ORDER BY sort ASC, title ASC')
    .bind(type)
    .all<VehicleMakeRow>();
  return r.results ?? [];
}

/** 車型連動下拉。車型本身沒有 type，要透過 vehicle_makes.type 判斷 */
export async function getModelsByMake(makeId: number): Promise<VehicleModelRow[]> {
  const r = await db()
    .prepare('SELECT * FROM vehicle_models WHERE vehicle_make_id = ? ORDER BY sort ASC, id ASC')
    .bind(makeId)
    .all<VehicleModelRow>();
  return r.results ?? [];
}

export async function getModel(id: number): Promise<VehicleModelRow | null> {
  return db().prepare('SELECT * FROM vehicle_models WHERE id = ?').bind(id).first<VehicleModelRow>();
}

/** sitemap 用：所有車輛的 id 與類型 */
export async function getAllVehicleIds(): Promise<{ id: string; type: number }[]> {
  const r = await db()
    .prepare('SELECT id, type FROM vehicles ORDER BY sort ASC')
    .all<{ id: string; type: number }>();
  return r.results ?? [];
}

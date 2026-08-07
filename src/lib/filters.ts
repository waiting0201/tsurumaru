// 前台列表的篩選條件 → SQL 片段。
//
// 行為對照 docs/03-data-model.md#業務規則：
//   同欄位多選 = OR，跨欄位 = AND，一律 ORDER BY sort 遞增。
//
// query 參數名沿用舊版（K / VehicleModelID / Year / PriceFrom / PriceTo /
// Driveline / Fuel / Transmission / Exterior），讓既有分享連結繼續有效。
// 見 docs/07-migration.md#篩選參數

import { yearRangeToBounds, YEAR_RANGES } from './enums';

export interface VehicleFilters {
  k: string | null;
  vehicleModelId: number | null;
  year: string | null;
  priceFrom: number | null;
  priceTo: number | null;
  driveline: string[];
  fuel: string[];
  transmission: string[];
  exterior: string[];
}

const num = (v: string | null): number | null => {
  if (v == null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function parseFilters(params: URLSearchParams): VehicleFilters {
  const list = (name: string) => params.getAll(name).filter((s) => s !== '');
  // 認不出來的 Year 代碼在這裡就丟掉，而不是留給 buildWhere 靜默略過 ——
  // 否則「條件存在但沒有作用」，畫面顯示未篩選、結果卻是全部車輛，
  // 使用者會以為這些車都落在他選的年份區間內。舊的分享連結若帶著已調整過
  // 的代碼就會踩到。見 docs/03-data-model.md#年份篩選區間
  const yearCode = params.get('Year')?.trim() || null;
  return {
    k: params.get('K')?.trim() || null,
    vehicleModelId: num(params.get('VehicleModelID')),
    year: yearCode && YEAR_RANGES[yearCode] ? yearCode : null,
    priceFrom: num(params.get('PriceFrom')),
    priceTo: num(params.get('PriceTo')),
    driveline: list('Driveline'),
    fuel: list('Fuel'),
    transmission: list('Transmission'),
    exterior: list('Exterior'),
  };
}

export function parsePage(params: URLSearchParams): number {
  const p = num(params.get('p')) ?? 1;
  return p >= 1 ? Math.floor(p) : 1;
}

export interface WhereClause {
  sql: string;
  binds: unknown[];
}

/**
 * 組出 WHERE 片段。片段與參數保持一一對應，全程用 prepared statement 綁參數。
 *
 * @param type          1=汽車 2=機車
 * @param includeCarOnly 機車列表沒有傳動／燃料／變速器三個條件（舊版行為）
 */
export function buildWhere(type: number, f: VehicleFilters, includeCarOnly: boolean): WhereClause {
  const parts: string[] = ['v.type = ?'];
  const binds: unknown[] = [type];

  // ⚠️ 舊版拿自由文字比對只存代碼的 vehicle_type，任何真實關鍵字都回傳零筆。
  // 這裡改為比對車廠與車型名稱 —— 使用者一直以為會發生的行為。
  // 見 docs/03-data-model.md#關鍵字搜尋已失效
  if (f.k) {
    parts.push('(mk.title LIKE ? OR md.title LIKE ?)');
    binds.push(`%${f.k}%`, `%${f.k}%`);
  }

  if (f.vehicleModelId != null) {
    parts.push('v.vehicle_model_id = ?');
    binds.push(f.vehicleModelId);
  }

  if (f.year) {
    const bounds = yearRangeToBounds(f.year);
    if (bounds) {
      parts.push('v.year BETWEEN ? AND ?');
      binds.push(bounds[0], bounds[1]);
    }
  }

  // 舊版只在兩端都有值時才套用價格條件，這裡保留該行為
  if (f.priceFrom != null && f.priceTo != null) {
    parts.push('v.price BETWEEN ? AND ?');
    binds.push(f.priceFrom, f.priceTo);
  }

  const multi = (col: string, values: string[]) => {
    if (!values.length) return;
    parts.push(`v.${col} IN (${values.map(() => '?').join(', ')})`);
    binds.push(...values);
  };

  multi('exterior', f.exterior);
  if (includeCarOnly) {
    multi('driveline', f.driveline);
    multi('fuel', f.fuel);
    multi('transmission', f.transmission);
  }

  return { sql: parts.join(' AND '), binds };
}

/** 保留現有篩選條件、只換頁碼的連結 */
export function pageHref(basePath: string, params: URLSearchParams, page: number): string {
  const q = new URLSearchParams(params);
  q.set('p', String(page));
  return `${basePath}?${q.toString()}`;
}

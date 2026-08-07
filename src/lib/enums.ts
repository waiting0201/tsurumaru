// 列舉字典 —— 唯一權威版本。
// 任何頁面都不得自行硬寫這些數字。來源與交叉驗證見 docs/03-data-model.md#列舉字典

export const VEHICLE_TYPE = { CAR: 1, BIKE: 2 } as const;
export type VehicleTypeValue = (typeof VEHICLE_TYPE)[keyof typeof VEHICLE_TYPE];

/** 車種／車體型式。資料庫欄位 vehicle_type，存的是「字串」形式的數字 */
export const VEHICLE_BODY: Record<string, string> = {
  '1': '轎車/跑車',
  '2': '休旅車',
  '3': '貨車',
  '4': '吉普車',
  '5': '其他車型',
};

/** 燃料。資料庫欄位 fuel，存 INTEGER */
export const FUEL: Record<string, string> = {
  '1': '汽油',
  '2': '柴油',
  '3': '油電',
  '4': '純電',
};

/** 傳動系統。資料庫存「字串」形式的數字 */
export const DRIVELINE: Record<string, string> = {
  '1': 'AWD/4WD',
  '2': '前驅',
  '3': '後驅',
};

/** 變速器。資料庫存「字串」形式的數字 */
export const TRANSMISSION: Record<string, string> = {
  '1': '手排',
  '2': '自排',
  '3': '自手排',
  '4': '手自排',
};

/** 外觀顏色。資料庫直接存中文，非代碼 */
export const EXTERIOR_COLORS = [
  '白色', '紅色', '銀色', '灰色', '黑色', '黃色',
  '橙色', '綠色', '藍色', '紫色', '棕色', '粉色',
] as const;

/**
 * 年份區間代碼。
 *
 * ⚠️ 舊版的區間邊界用嚴格大於／小於，區間之間有縫 —— 以 2026 年為例，
 * 2023 年出廠的車不屬於任何區間，會從所有篩選結果中消失。
 * 這裡修正為連續且不重疊：下界含、上界不含。
 * 見 docs/03-data-model.md#年份篩選區間
 */
export const YEAR_RANGES: Record<string, { label: string; minAge: number; maxAge: number | null }> = {
  '1': { label: '今年', minAge: 0, maxAge: 1 },
  '2': { label: '1～3 年', minAge: 1, maxAge: 3 },
  '3': { label: '3～5 年', minAge: 3, maxAge: 5 },
  '4': { label: '5～10 年', minAge: 5, maxAge: 10 },
  '5': { label: '10 年以上', minAge: 10, maxAge: null },
};

/**
 * 把年份區間代碼轉成出廠年份的閉區間 [起始年, 結束年]（兩端皆含）。
 *
 * 車齡以 [minAge, maxAge) 定義，換算成年份後兩端都含。以 Y=今年驗算：
 *   '1' → [Y,    Y   ]   車齡 0
 *   '2' → [Y-2,  Y-1 ]   車齡 1–2
 *   '3' → [Y-4,  Y-3 ]   車齡 3–4
 *   '4' → [Y-9,  Y-5 ]   車齡 5–9
 *   '5' → [-9999, Y-10]  車齡 10 以上
 * 五個區間相連且不重疊，沒有任何年份會落空。
 */
export function yearRangeToBounds(code: string, now = new Date()): [number, number] | null {
  const r = YEAR_RANGES[code];
  if (!r) return null;
  const y = now.getUTCFullYear();
  const from = r.maxAge === null ? -9999 : y - r.maxAge + 1;
  const to = y - r.minAge;
  return [from, to];
}

export const label = (dict: Record<string, string>, v: string | number | null | undefined) =>
  v == null ? '' : (dict[String(v)] ?? '');

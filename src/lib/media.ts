// R2 圖片的網址組裝與存取。
//
// 物件 key：vehicles/{vehicle_id}/{檔名}（vehicle_id 全小寫）
// 見 docs/07-migration.md#圖片搬遷
//
// ⚠️ 網址組裝集中在這個檔案。日後若改用 Cloudflare Images 做變體轉換
//    （ADR-0003 目前刻意不做），只需要改這裡一處。

import { env } from 'cloudflare:workers';

/**
 * 圖片的公開網域。設定 MEDIA_BASE_URL 後走 R2 自訂網域（不經 Worker，
 * 自動走 Cloudflare 快取）；未設定則回退到 /media/* 由 Worker 代送，
 * 方便本機開發與尚未綁定網域的階段。
 */
const base = (): string | null => {
  const v = (env as unknown as Record<string, unknown>).MEDIA_BASE_URL;
  return typeof v === 'string' && v ? v.replace(/\/$/, '') : null;
};

export function photoUrl(vehicleId: string, filename: string | null | undefined): string {
  if (!filename) return '';
  const key = `vehicles/${vehicleId.toLowerCase()}/${encodeURIComponent(filename)}`;
  const b = base();
  return b ? `${b}/${key}` : `/media/${key}`;
}

/** 由 Worker 代送 R2 物件（僅在未綁定自訂網域時使用） */
export async function getObject(key: string) {
  return env.BUCKET.get(key);
}

/**
 * 物件的快取標頭。R2 自訂網域是把物件存的 httpMetadata 原樣送出 ——
 * 沒設就完全不會被快取（cf-cache-status: DYNAMIC），每次瀏覽都回源。
 * 檔名是時間戳記、內容不會就地改寫，所以可以安全地用 immutable 長快取。
 */
export const OBJECT_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** 後台上傳：檔名重新產生，不沿用使用者輸入。見 docs/08-security.md#輸入處理 */
export async function putVehiclePhoto(
  vehicleId: string,
  filename: string,
  body: ArrayBuffer,
  contentType: string,
): Promise<void> {
  const key = `vehicles/${vehicleId.toLowerCase()}/${filename}`;
  await env.BUCKET.put(key, body, {
    httpMetadata: { contentType, cacheControl: OBJECT_CACHE_CONTROL },
  });
}

export async function deleteVehiclePhoto(vehicleId: string, filename: string): Promise<void> {
  await env.BUCKET.delete(`vehicles/${vehicleId.toLowerCase()}/${filename}`);
}

/** 產生上傳用檔名：沿用舊系統的時間戳記格式 yyyyMMddHHmmss.ext */
export function newPhotoFilename(originalName: string): string {
  const ext = (originalName.match(/\.([A-Za-z0-9]+)$/)?.[1] ?? 'jpg').toLowerCase();
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  const stamp = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
                `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
  return `${stamp}.${ext}`;
}

/**
 * 上傳白名單。
 * ⚠️ 必須包含 gif —— 舊資料裡有 .gif 主圖，見 docs/03-data-model.md#資料格式觀察
 */
export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** 驗證 magic bytes，不信任 Content-Type。見 docs/08-security.md#輸入處理 */
export function sniffImageType(buf: ArrayBuffer): string | null {
  const b = new Uint8Array(buf.slice(0, 12));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

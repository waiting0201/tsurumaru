// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// 架構說明見 docs/02-architecture.md
export default defineConfig({
  // SSR：列表與詳情頁需依 query string 與資料庫即時渲染。
  // 靜態頁（about / map / privacy）於各自檔案內設 `export const prerender = true`。
  output: 'server',
  adapter: cloudflare({
    // adapter 預設會啟用 Cloudflare Images 並要求 IMAGES binding。
    // 本專案刻意不做即時變體轉換（ADR-0003），改為原樣送出 R2 上的圖片。
    imageService: 'passthrough',
  }),

  // adapter 預設會為 Astro sessions 佈建 KV namespace（SESSION binding）。
  // 後台 session 走 D1（docs/08-security.md），不需要 Astro 的 session API。
  session: false,

  // canonical 與 sitemap 的基準網址。
  // 必須固定成正式網址 —— 若留空會回退成請求的來源，導致 apex、www、
  // workers.dev 各自宣告自己是 canonical，對搜尋引擎變成重複內容。
  site: 'https://www.tsurumarucorp.com',

  // 前台 markup 與樣式原樣沿用舊站（紅線一，見 docs/04-conventions.md）。
  // theme.css 與 vendor 資產放在 public/ 直接送出，不經 Vite 處理。
  build: {
    // 資產檔名不加 hash，維持與舊站一致的路徑
    assets: '_astro',
  },
});

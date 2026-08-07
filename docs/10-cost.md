# 10 — 成本與免費方案

**決定：使用 Workers 免費方案。** 這一頁記錄該方案的實際限制、本專案為此做的取捨，以及超標時的處理順序。

定價數字為 2026-08-07 查證，會變動 —— 引用前請以 [Cloudflare 官方定價](https://developers.cloudflare.com/workers/platform/pricing/) 複驗。

## 免費方案的額度

| 項目 | 免費額度 | 本專案的實際用量 |
|---|---|---|
| Workers requests | 100,000／天 | 每次頁面瀏覽 1 次（＋每張圖 1 次，見下） |
| **Workers CPU** | **每次呼叫 10ms** | ⚠️ 未實測，見[風險](#最大的風險cpu-上限) |
| 靜態資產 | **免費且無限，不計入 request** | `theme.css`、vendor JS、14 MB 圖片全走這條 |
| D1 讀 | 500 萬列／天 | 列表頁約 20–30 列／次 |
| D1 寫 | 100,000 列／天 | 只有後台編輯與瀏覽計數 |
| D1 儲存 | 5 GB | 目前 188 KB |
| R2 儲存 | 10 GB | 目前 3.2 MB |
| R2 Class B（讀） | 1000 萬／月 | 每張未快取的圖 1 次 |
| R2 流量 | **完全免費** | — |

以資料量推算，D1 與 R2 離上限有三個數量級以上。**真正的限制是 Workers 的兩項。**

## 什麼會計費、什麼不會

這是最容易誤解的地方：

| 請求 | 是否計入 Worker request |
|---|---|
| `/`、`/cars`、`/cars/{id}` 等 SSR 頁面 | ✅ 計入 |
| `/about`、`/map`、`/privacy`（預渲染） | ❌ 免費（靜態資產） |
| `/content/**`、`/scripts/**`、`/robots.txt` | ❌ 免費（靜態資產） |
| `/media/**`（R2 代送） | ✅ **計入** ← 主要消耗來源 |
| `/api/models` | ✅ 計入 |
| Worker 發出的 subrequest（D1、R2 binding） | ❌ 不計費 |

**邊緣快取命中仍然計入 request 數**，但 CPU 時間只有 miss 才算。所以快取保護的是 CPU 上限，不是 request 額度。

## 最大的槓桿：把圖片移出 Worker

目前 `photoUrl()` 在未設定 `MEDIA_BASE_URL` 時回傳 `/media/...`，**每張圖都算一次 Worker request**。一個顯示 8 台車的列表頁 = 1（HTML）+ 8（圖）= 9 次。

100,000/天 ÷ 9 ≈ **每天約 11,000 次列表頁瀏覽**才會到頂。對一家車行仍然充裕，但綁定 R2 自訂網域後可以直接變成 1 次／頁：

```bash
npx wrangler r2 bucket domain add tsurumaru-media --domain=img.<正式網域>
npx wrangler secret put MEDIA_BASE_URL     # 填 https://img.<正式網域>
```

綁定後圖片完全不經 Worker（也不計 R2 Class B，因為走 Cloudflare 快取），且只需要改 [`src/lib/media.ts`](../src/lib/media.ts) 讀取的那一個環境變數 —— 這正是當初把 URL 組裝集中在該模組的理由（[ADR-0003](adr/0003-r2-object-storage.md)）。

**前置條件：正式網域必須在 Cloudflare 上。**

## 最大的風險：CPU 上限

免費方案**每次呼叫的 CPU 時間上限是 10ms，超過會直接中斷該請求**。這是免費方案唯一會造成使用者看到錯誤的限制。

要點：

- **等待 D1／R2 的時間不算 CPU** —— 那是 I/O。算的是 JS 執行與渲染。
- 本專案的 SSR 頁面只做少量查詢與字串渲染，正常應遠低於 10ms。
- ⚠️ **但尚未實測。** 本機 `wrangler dev` 量不到真實的 CPU 時間。

`wrangler.jsonc` 已啟用 `observability`。**上線第一週務必去看一次**：

```
Cloudflare Dashboard → Workers & Pages → tsurumaru → Logs / Metrics
```

看 CPU time 的 p99。若貼近 10ms，依下方順序處理。

## 超標時的處理順序

由便宜到昂貴，先做上面的：

1. **綁定 R2 自訂網域** —— 直接砍掉大部分的 request 數。零成本。
2. **確認圖片有 lazy loading** —— 已實作（`loading="lazy"`），列表頁未捲動到的圖不會發出請求。
3. **給 SSR 頁面加邊緣快取** —— 用 Cache API 對 `/`、`/cars`、`/bikes` 加短 TTL（例如 60 秒）。快取命中時 CPU 幾乎為零，能直接解決 CPU 上限問題。
   ⚠️ 代價是後台編輯後最多 60 秒才反映到前台。**這會引入使用者看得到的延遲，實作前要先確認業主接受。**
4. **升級到付費方案（$5/月）** —— CPU 上限變成 30 秒，等於不會再撞到；含 1000 萬 requests/月。

前三項都不必花錢。第 4 項是最後手段，但 $5/月也不貴 —— 如果第 3 項的快取延遲業主不能接受，直接升級反而更單純。

## 已經為免費方案做的事

| 措施 | 位置 | 效果 |
|---|---|---|
| 靜態頁預渲染 | `about` / `map` / `privacy` 的 `prerender = true` | 這三頁完全不計 request |
| 圖片 lazy loading | `VehicleCard.astro`、列表與後台 | 減少未捲動到的圖片請求 |
| 媒體端點邊緣快取 | [`src/pages/media/[...key].ts`](../src/pages/media/[...key].ts) | 命中時 CPU 近乎零，並省下 R2 讀取 |
| `immutable` 長快取 + 304 | 同上 | 回訪者的瀏覽器不再請求 |
| 資產不經 Worker | `assets.directory` 指向 `dist/client` | 14 MB 的 CSS/JS/圖全部免費 |
| 消除多餘的 307 轉址 | `html_handling: drop-trailing-slash`、logo 路徑預先編碼 | 每次頁面載入少兩次往返 |

## 相關文件

- 架構與圖片投遞 → [02-architecture.md](02-architecture.md#圖片投遞)
- 為什麼不做圖片變體轉換 → [ADR-0003](adr/0003-r2-object-storage.md)
- 部署與觀測 → [09-cicd.md](09-cicd.md)

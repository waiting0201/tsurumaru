# 02 — 目標架構

## 全貌

```
                         ┌──────────────────────────────┐
   訪客 ────────────────▶│  Cloudflare Workers          │
                         │  Astro SSR (@astrojs/cloudflare)
   店員 ──/admin/*──────▶│                              │
                         │  ├─ 前台頁面（照搬舊 markup） │
                         │  ├─ 後台頁面（重新設計）      │
                         │  └─ API endpoints            │
                         └───┬──────────────┬───────────┘
                             │ DB binding   │ BUCKET binding
                             ▼              ▼
                      ┌────────────┐  ┌────────────┐
                      │ D1         │  │ R2         │
                      │ (SQLite)   │  │ 車輛圖片    │
                      └────────────┘  └─────┬──────┘
                                            │ 自訂網域公開讀取
   訪客圖片請求 ────────────────────────────┘
```

單一 Worker 同時服務前台、後台與 API。靜態資產（`theme.css`、vendor JS、字型）由 Workers Static Assets 直接送出，不進 Worker 計費。

## 技術選型

| 層 | 選擇 | ADR |
|---|---|---|
| 框架／渲染 | Astro，SSR（`output: 'server'`），部署於 Workers | [ADR-0001](adr/0001-astro-ssr-on-workers.md) |
| 資料庫 | Cloudflare D1（SQLite） | [ADR-0002](adr/0002-d1-as-database.md) |
| 圖片 | Cloudflare R2，純物件儲存（不做即時變體） | [ADR-0003](adr/0003-r2-object-storage.md) |
| 前台視覺 | 原樣沿用舊 markup 與 theme.css | [ADR-0004](adr/0004-preserve-frontend-markup.md) |
| 後台視覺 | 重新設計，不沿用 SmartAdmin | [ADR-0005](adr/0005-rebuild-admin-ui.md) |

## 渲染策略

| 頁面 | 策略 | 理由 |
|---|---|---|
| 首頁 `/` | SSR | 顯示最新 6 台車，內容會變 |
| 列表 `/cars`、`/bikes` | SSR | 篩選條件來自 query string |
| 詳情 `/cars/[id]`、`/bikes/[id]` | SSR | 需計 `views`；資料可能隨時更新 |
| `/about`、`/map`、`/privacy` | 預渲染 `prerender = true` | 純靜態內容 |
| `/admin/*` | SSR，全部禁止快取 | 需登入 |

> 詳情頁若日後成為流量瓶頸，再考慮加 Cache API 並於後台更新時清除 — 目前資料量與流量不需要。

## Cloudflare 資源

### wrangler.jsonc（目標形狀）

實際檔案見 [wrangler.jsonc](../wrangler.jsonc)。關鍵欄位：

```jsonc
{
  "name": "tsurumaru",
  // ⚠️ 不能指向 dist/_worker.js/index.js —— adapter v14 走 @cloudflare/vite-plugin，
  //    會在建置「之前」解析 main，指向尚未存在的產物會直接建置失敗
  "main": "@astrojs/cloudflare/entrypoints/server",
  "compatibility_date": "2026-08-07",
  "compatibility_flags": ["nodejs_compat"],
  // ⚠️ 必須是 dist/client。指向 dist 會把 dist/server/ 的伺服器程式碼公開送出
  "assets": {
    "binding": "ASSETS",
    "directory": "./dist/client"
  },
  "observability": { "enabled": true },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "tsurumaru",
      "database_id": "<建立後填入>",
      "migrations_dir": "migrations"
    }
  ],
  "r2_buckets": [
    {
      "binding": "BUCKET",
      "bucket_name": "tsurumaru-media"
    }
  ]
}
```

祕密（如後台 session 簽章金鑰）用 `wrangler secret put`，**不寫進本檔**。本地開發放 `.dev.vars`（已列入 `.gitignore`）。

### astro.config.mjs（目標形狀）

實際檔案見 [astro.config.mjs](../astro.config.mjs)。兩個**必須明確關掉**的預設值：

```js
export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    // 預設會啟用 Cloudflare Images 並要求 IMAGES binding。
    // 本專案不做即時變體轉換（ADR-0003）
    imageService: 'passthrough',
  }),
  // 預設會為 Astro sessions 佈建 KV namespace（SESSION binding）。
  // 後台 session 走 D1，不需要
  session: false,
});
```

不關掉的話，建置時 adapter 會自行宣告 `IMAGES` 與 `SESSION` binding，等於在架構裡多出兩個我們沒有決定要用的資源。

`platformProxy` 自 adapter v12 起預設啟用，因此 `astro dev` 就能存取 D1／R2 的本地模擬，通常不需額外設定。

### 建置產物結構

```
dist/
├── server/     Worker 程式碼（entry.mjs、chunks/）＋ adapter 產生的 wrangler.json
└── client/     靜態資產 ← assets.directory 指這裡
```

## Bindings 存取方式

⚠️ **這是最容易寫錯的一點。** `@astrojs/cloudflare` v13 起（Astro 6+）**移除了 `Astro.locals.runtime`**。現行版本（本專案為 adapter 14.x / Astro 7.x）改為直接從 Workers runtime 匯入：

```ts
import { env } from 'cloudflare:workers';

const rows = await env.DB.prepare('SELECT * FROM vehicles WHERE type = ?')
  .bind(1)
  .all();

const object = await env.BUCKET.get(key);
```

網路上與舊教學裡大量 `Astro.locals.runtime.env.DB` 的寫法**在本專案無效**，看到請直接改掉。

其他 runtime 能力：

```ts
const country = Astro.request.cf?.country;   // 地理資訊
Astro.locals.cfContext.waitUntil(promise);   // 背景工作（如非同步累加 views）
```

型別以 `npx wrangler types` 產生，不要手寫 `interface Env`。

> 📌 首次 scaffold 時，請以實際安裝版本的 [Astro Cloudflare adapter 官方文件](https://docs.astro.build/en/guides/integrations-guide/cloudflare/) 複驗上述 API，並回頭更新本節。

## 目錄配置

```
src/
├── pages/
│   ├── index.astro              前台首頁
│   ├── cars/index.astro         汽車列表
│   ├── cars/[id].astro          汽車詳情
│   ├── bikes/index.astro        機車列表
│   ├── bikes/[id].astro         機車詳情
│   ├── about.astro  map.astro  privacy.astro
│   ├── api/
│   │   └── models.ts            車型連動下拉（取代 AjaxF）
│   └── admin/
│       ├── login.astro  index.astro
│       ├── makes/  models/  vehicles/  photos/  admins/
│       └── api/                 後台的資料異動 endpoint
├── layouts/
│   ├── Site.astro               ← _Layout.cshtml
│   └── Admin.astro              後台版型（全新）
├── components/
│   ├── site/                    Header / Footer / VehicleCard / FilterPanel …
│   └── admin/
├── lib/
│   ├── db.ts                    D1 查詢（唯一可直接碰 env.DB 的地方）
│   ├── media.ts                 R2 存取與圖片 URL 組裝
│   ├── auth.ts                  密碼雜湊、session、權限檢查
│   ├── enums.ts                 列舉字典（見 03-data-model）
│   └── filters.ts               列表篩選條件 → SQL
└── styles/
public/
├── content/css/theme.css        ← 原樣自舊專案複製
├── content/img/ …
└── scripts/vendor/ …            ← 原樣自舊專案複製
```

**規則**：只有 `src/lib/` 內的模組可以直接使用 `env.DB` / `env.BUCKET`。頁面與元件一律透過 `lib` 取資料，方便日後替換與測試。

## 圖片投遞

R2 走**自訂網域公開讀取**，不經 Worker：

```bash
npx wrangler r2 bucket domain add tsurumaru-media --domain=img.<正式網域>
```

物件 key 規則見 [07-migration.md](07-migration.md#圖片搬遷)。上傳一律經後台 endpoint 用 `BUCKET` binding 寫入，**不對外開放寫入權限**。

## 相關文件

- 資料模型 → [03-data-model.md](03-data-model.md)
- 指令與流程 → [05-workflows.md](05-workflows.md)
- 安全基線 → [08-security.md](08-security.md)

# Tsurumaru — 專案索引

中古車／重機買賣網站。舊版是 ASP.NET MVC 5 + Azure SQL，正在改寫為 **Astro SSR on Cloudflare Workers + D1 + R2**。

> **目前狀態：已上線** — https://www.tsurumarucorp.com
> 前台 8 頁、後台全功能、資料與圖片搬遷、CI/CD 皆已完成並驗證。逐項狀態見 [docs/README.md](docs/README.md#現況)。
> 尚未處理：正式後台密碼（見 [docs/07-migration.md](docs/07-migration.md#管理員密碼)）、R2 圖片自訂網域（見 [docs/10-cost.md](docs/10-cost.md)）。

> **舊資料來源**：資料庫在本機 Docker 容器 `sqlserver`（資料庫 `tsurumaru`），圖片在 `reference/old/Tsurumaru/Upload/`。連線方式見 [docs/07-migration.md](docs/07-migration.md#來源資料庫本機-docker)，實際內容見 [docs/03-data-model.md](docs/03-data-model.md#實際資料快照)。**一律唯讀存取**，且該容器同時放著其他專案的資料庫。

---

## 🚦 先讀這個：任務 → 文件路由表

| 你要做的事 | 先讀 |
|---|---|
| 剛接手，完全不懂這專案 | [docs/01-context.md](docs/01-context.md) → [docs/02-architecture.md](docs/02-architecture.md) |
| 建立專案骨架、裝 adapter、設定 wrangler | [docs/02-architecture.md](docs/02-architecture.md)、[docs/05-workflows.md](docs/05-workflows.md) |
| 寫／改資料查詢，需要知道欄位與列舉值 | [docs/03-data-model.md](docs/03-data-model.md) |
| 移植前台頁面（Razor → Astro） | [docs/04-conventions.md](docs/04-conventions.md)、[docs/legacy-map.md](docs/legacy-map.md) |
| 做後台 CRUD / 權限 | [docs/03-data-model.md](docs/03-data-model.md)、[docs/08-security.md](docs/08-security.md) |
| 搬資料、搬圖片、處理舊網址 | [docs/07-migration.md](docs/07-migration.md) |
| 跑指令（dev / migrate / deploy） | [docs/05-workflows.md](docs/05-workflows.md) |
| 改 CI／部署管線、設定 secret | [docs/09-cicd.md](docs/09-cicd.md) |
| 擔心費用、遇到額度或 CPU 上限 | [docs/10-cost.md](docs/10-cost.md) |
| 想確認「我改對了嗎」 | [docs/06-verification.md](docs/06-verification.md) |
| 想改變技術選型 | [docs/adr/](docs/adr/) — 先看為什麼是現在這樣 |
| 找舊系統某個功能在哪 | [docs/legacy-map.md](docs/legacy-map.md) |

完整導覽：[docs/README.md](docs/README.md)

---

## 🔴 紅線（違反即為錯誤，不需討論）

1. **前台視覺零變更。** `Content/css/theme.css` 與 `Scripts/vendor/*` 原封不動搬過去，class 名稱、DOM 結構、vendor 初始化順序都不可改。判準見 [docs/06-verification.md](docs/06-verification.md#前台樣式零差異)。理由見 [ADR-0004](docs/adr/0004-preserve-frontend-markup.md)。
2. **絕不把 `reference/old/` 的任何憑證帶進新版。** 舊 config 內含明碼 Azure SQL 帳密、寫死的後門帳號、明碼密碼欄位。細節與必改清單見 [docs/08-security.md](docs/08-security.md)。
3. **`reference/old/` 唯讀。** 它是行為的真相來源，不修改、不建置、不納入 tsconfig／建置流程。
4. **祕密只進 `wrangler secret` 或 `.dev.vars`。** `.dev.vars` 必須在 `.gitignore` 內。任何 key 都不得寫進 `wrangler.jsonc`。
5. **不新增前台 UI 相依套件。** 需要互動就用既有的 vendor 套件（tiny-slider / nouislider / lightgallery / simplebar / jarallax）。
6. **Tailwind 只給後台。** `src/styles/admin.css` 只能被 `src/layouts/Admin.astro` 與 `src/pages/admin/login.astro` import。它的 preflight 會重置 `*`／`img`／`table`／表單元素 —— 前台載到就直接違反紅線一。檢查指令見 [docs/06-verification.md](docs/06-verification.md#b2-tailwind-沒有洩漏到前台)，設計語彙見 [ADR-0005](docs/adr/0005-rebuild-admin-ui.md)。
6. **本專案跑在 Workers 免費方案。** 每次呼叫 CPU 上限 **10ms**，超過會中斷請求。新增 SSR 頁面或迴圈運算前先讀 [docs/10-cost.md](docs/10-cost.md#最大的風險cpu-上限)。

---

## 專案結構（目標）

```
tsurumaru/
├── CLAUDE.md                 ← 本檔（索引）
├── docs/                     ← harness 文件集，見上方路由表
├── .github/workflows/        ← CI/CD（push 到 master 即部署）
├── reference/old/            ← 舊 ASP.NET MVC 原始碼（唯讀真相來源）
├── src/
│   ├── pages/                ← 前台路由（照搬 Razor markup）
│   ├── pages/admin/          ← 後台（重新設計 UI，Tailwind）
│   ├── layouts/              ← Site.astro（前台）／Admin.astro（後台外框）
│   ├── components/site/      ← _Header / _Footer 等 partial 對應
│   ├── components/admin/     ← Panel / Field / Flash / Pager / ScopeTabs
│   ├── lib/                  ← D1 查詢、R2 存取、auth、列舉字典
│   └── styles/admin.css      ← Tailwind 進入點＋後台設計語彙（僅後台，紅線六）
├── public/                   ← theme.css 與 vendor 資產（原樣）
├── migrations/               ← D1 SQL migrations
├── scripts/                  ← 一次性搬遷腳本
├── astro.config.mjs
└── wrangler.jsonc
```

---

## 常用指令

```bash
npm run dev                                        # 本地開發（含 D1/R2 模擬）
npm run build                                      # astro check + build
npx wrangler d1 migrations apply tsurumaru --local # 套用 migration（本地）
npm run deploy                                     # 建置並部署到 Workers
```

完整指令與前置條件見 [docs/05-workflows.md](docs/05-workflows.md)。

---

## 版本基準（2026-08-07 實裝）

| 套件 | 版本 |
|---|---|
| astro | 7.2.0 |
| @astrojs/cloudflare | 14.2.0 |
| tailwindcss ＋ @tailwindcss/vite | 4.3.3（**只給後台**，見紅線六） |
| wrangler | 4.119.0 |
| Node | 24.x |
| typescript | 5.9.x（**不可升 7** — `@astrojs/check` 的 peer 是 ^5 \|\| ^6） |

⚠️ **Adapter 已移除 `Astro.locals.runtime`**，binding 一律用 `import { env } from 'cloudflare:workers'`。
⚠️ **`wrangler.jsonc` 的 `main` 不可指向 `dist/_worker.js`**，`assets.directory` 必須是 `./dist/client`（指向 `./dist` 會把伺服器程式碼當靜態檔案公開）。詳見 [docs/02-architecture.md](docs/02-architecture.md#bindings-存取方式)。

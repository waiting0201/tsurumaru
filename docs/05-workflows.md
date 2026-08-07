# 05 — 工作流程 Runbook

所有指令的執行位置都是專案根目錄 `/Users/tim/webapps/tsurumaru`。

> ⚠️ 本頁指令在專案骨架建立前**尚未實測**。首次執行時若與實際不符，請當場修正本頁 — 過期的 runbook 比沒有 runbook 更浪費時間。

## 前置需求

| 項目 | 需求 | 檢查 |
|---|---|---|
| Node | 22+（目前 24.13.1） | `node -v` |
| Cloudflare 帳號 | 已登入 wrangler | `npx wrangler whoami` |
| Git | 專案目前**不是** git repo | `git status` |

## 0. 一次性：建立專案骨架

✅ **已完成（2026-08-07）。** 實際建立的內容與過程中發現的陷阱記錄如下，重建環境時參考。

| 項目 | 值 |
|---|---|
| D1 資料庫 | `tsurumaru`，id `a2cb1fe4-10b5-4ddc-aa3d-207afa402c8b`，region APAC |
| R2 bucket | `tsurumaru-media`，region APAC |
| 已驗證 | `npm run build` 0 errors／`wrangler deploy --dry-run` 三個 binding 正確／`astro dev` 回 200 |

**三個與官方文件範例不同的地方**（都已反映在實際設定檔中）：

1. `main` 不能指向 `dist/_worker.js/index.js` — adapter v14 會在建置前解析它。改用 `@astrojs/cloudflare/entrypoints/server`。
2. `assets.directory` 必須是 `./dist/client`，不是 `./dist` — 否則伺服器程式碼會被當靜態檔案公開。
3. `typescript` 必須鎖 5.x — `@astrojs/check`（`npm run build` 的第一步）的 peer 是 `^5 || ^6`，裝 TypeScript 7 會讓建置失敗。

<details>
<summary>原始步驟（供重建參考）</summary>

```bash
# 1. 建立 Astro + Cloudflare 專案
npm create cloudflare@latest -- tsurumaru-app --framework=astro
# 產出後把內容移至專案根目錄，保留既有的 docs/ reference/ CLAUDE.md .vscode/

# 2. 確認 adapter 已裝且 output: 'server'
npx astro add cloudflare

# 3. 建立 D1
npx wrangler d1 create tsurumaru
#   → 把回傳的 database_id 填進 wrangler.jsonc

# 4. 建立 R2
npx wrangler r2 bucket create tsurumaru-media

# 5. 產生 binding 型別
npx wrangler types
```

完成後 `wrangler.jsonc` 與 `astro.config.mjs` 應與 [02-architecture.md](02-architecture.md#cloudflare-資源) 所列形狀一致。

</details>

## 1. 日常開發

```bash
npm run dev
```

`platformProxy` 預設啟用，`env.DB` / `env.BUCKET` 會連到 `.wrangler/state/` 下的本地模擬資源。本地資料**不會**動到正式環境。

修改 `wrangler.jsonc` 的 binding 後要重跑 `npx wrangler types` 並重啟 dev server。

## 2. 資料庫 migration

```bash
# 建立新的 migration 檔
npx wrangler d1 migrations create tsurumaru add_vehicles_table
#   → 產生 migrations/0001_add_vehicles_table.sql

# 套用到本地
npx wrangler d1 migrations apply tsurumaru --local

# 套用到正式（會改動線上資料，請先確認）
npx wrangler d1 migrations apply tsurumaru --remote

# 查詢已套用清單
npx wrangler d1 migrations list tsurumaru --remote
```

臨時查詢：

```bash
npx wrangler d1 execute tsurumaru --local  --command="SELECT COUNT(*) FROM vehicles"
npx wrangler d1 execute tsurumaru --remote --command="SELECT COUNT(*) FROM vehicles"
```

也可以直接開本地 SQLite 檔：

```bash
sqlite3 .wrangler/state/v3/d1/<database-id>.sqlite
```

**規則**：schema 變更一律走 migration 檔，不用 `d1 execute` 直接改正式資料庫結構 — 後者不會被 `d1_migrations` 記錄，會讓環境之間悄悄分歧。

## 3. R2 操作

```bash
npx wrangler r2 object put tsurumaru-media/vehicles/<id>/<file>.jpg --file=./local.jpg
npx wrangler r2 object get tsurumaru-media/vehicles/<id>/<file>.jpg
npx wrangler r2 bucket list

# 綁定公開讀取網域（一次性）
npx wrangler r2 bucket domain add tsurumaru-media --domain=img.<正式網域>
```

## 4. 祕密管理

```bash
# 正式環境
npx wrangler secret put SESSION_SECRET
npx wrangler secret list

# 本地：寫進 .dev.vars（已在 .gitignore）
# SESSION_SECRET="..."
```

**永遠不要**把祕密寫進 `wrangler.jsonc`、原始碼或文件。

## 5. 建置與部署

**正式部署由 CI 負責** — push 到 `master` 即自動建置、套用 migration 並部署，見 [09-cicd.md](09-cicd.md)。以下指令用於本機驗證或緊急手動部署：

```bash
npm run build     # astro check（型別）+ astro build
npm run deploy    # 建置後 wrangler deploy
```

首次部署前的檢查清單：

- [ ] `npm run build` 無錯誤
- [ ] `wrangler.jsonc` 的 `database_id` 已填入真實值
- [ ] 正式 D1 已套用所有 migration（`d1 migrations list --remote`）
- [ ] `SESSION_SECRET` 等祕密已用 `wrangler secret put` 設定
- [ ] R2 公開網域已綁定，且圖片實際可取得
- [ ] 舊網址的 301 導轉已設定（見 [07-migration.md](07-migration.md#網址對應與-seo)）
- [ ] 走過 [06-verification.md](06-verification.md) 的驗收流程
- [ ] GitHub secrets `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` 已設定（[09-cicd.md](09-cicd.md#設定)）

回滾：

```bash
npx wrangler deployments list
npx wrangler rollback [deployment-id]
```

> ⚠️ `wrangler rollback` 只回滾 Worker 程式碼，**不會回滾 D1 schema 或資料**。含 migration 的部署要分兩段做：先上相容的 schema，再上程式碼。

## 6. 資料搬遷

一次性流程，獨立於日常開發，見 [07-migration.md](07-migration.md)。

## 7. 觀測

```bash
npx wrangler tail                  # 即時日誌
npx wrangler tail --status=error   # 只看錯誤
```

`wrangler.jsonc` 已啟用 `observability`，可在 Cloudflare Dashboard → Workers → Logs 查看。

## 相關文件

- 架構與設定內容 → [02-architecture.md](02-architecture.md)
- 每次改動後怎麼驗 → [06-verification.md](06-verification.md)

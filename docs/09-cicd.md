# 09 — CI/CD

GitHub Actions → Cloudflare Workers。決策理由見 [ADR-0006](adr/0006-github-actions-for-deploy.md)。

## 管線

```
push 到 master
   │
   ├─ guard    機密防護（reference/ 未進版控、無密碼指派、無連線字串）
   │
   └─ deploy   npm ci → npm run build → d1 migrations apply --remote → wrangler deploy
```

定義在 [.github/workflows/deploy.yml](../.github/workflows/deploy.yml)。也可在 Actions 頁面手動觸發（`workflow_dispatch`）。

**沒有 PR 檢查、沒有預覽環境。** push 到 `master` 就上線。建置失敗（`astro check` 型別錯誤或 build 錯誤）會擋下部署，這是唯一的防護網。日後若要加 PR gate 或預覽環境，見[日後可加的關卡](#日後可加的關卡)。

## ⚠️ 前置需求：專案骨架尚未建立

目前 repo 內沒有 `package.json`、`astro.config.mjs`、`wrangler.jsonc`。**在骨架建立前，這個 workflow 一定會失敗**（`npm ci` 找不到 lockfile）。

順序應為：

1. 建立骨架（[05-workflows.md 步驟 0](05-workflows.md#0-一次性建立專案骨架)）
2. 設定下方兩個 GitHub secret
3. 第一次 push → 觀察 Actions 執行結果

## 設定

### 1. Cloudflare API Token

Cloudflare Dashboard → My Profile → API Tokens → Create Token。

以 **Edit Cloudflare Workers** 範本為基礎，再加上 D1 權限：

| 權限 | 用途 |
|---|---|
| Account → Workers Scripts → Edit | 部署 Worker |
| Account → D1 → Edit | 套用 migration |
| Account → Account Settings → Read | wrangler 解析帳號 |

範圍限縮到**這一個帳號**。不需要 Zone 權限，也不需要 R2 權限（CI 不碰 R2；圖片由後台上傳）。

### 2. GitHub Secrets

```bash
gh secret set CLOUDFLARE_API_TOKEN   # 貼上上一步產生的 token
gh secret set CLOUDFLARE_ACCOUNT_ID  # 可用 npx wrangler whoami 取得
```

或在 GitHub → Settings → Secrets and variables → Actions 手動新增。

> 這兩個值**只存在 GitHub Secrets**，不寫進 `wrangler.jsonc`、不寫進任何檔案。應用程式自身的祕密（如 `SESSION_SECRET`）走 `wrangler secret put`，**不經 CI** — 見 [05-workflows.md](05-workflows.md#4-祕密管理)。

## Migration 的順序陷阱

管線是 **先套 migration、後部署程式碼**。這中間有一段時間，**新 schema 正在跑舊程式碼**。

因此 migration 必須**向前相容**：

| 安全 | 危險 |
|---|---|
| 新增資料表 | 刪除資料表或欄位 |
| 新增可為 NULL 的欄位 | 新增 `NOT NULL` 且無預設值的欄位 |
| 新增索引 | 改欄位型別 |
| 新增有預設值的欄位 | 改欄位名稱 |

要做破壞性變更時，拆成兩次部署：

1. **第一次** — 新增新欄位、程式碼同時寫入新舊兩邊
2. **第二次** — 移除舊欄位與相容程式碼

> 這個限制不是 Cloudflare 造成的，任何「先遷移後部署」的管線都一樣。反過來「先部署後遷移」則會讓新程式碼在舊 schema 上跑，同樣有問題 — 向前相容的 migration 是唯一乾淨的解法。

## 回滾

```bash
npx wrangler deployments list
npx wrangler rollback [deployment-id]
```

⚠️ **只回滾程式碼，不回滾資料庫。** 若該次部署含 migration，資料庫仍停在新 schema。這正是上一節要求向前相容的原因 — 向前相容的 migration 讓回滾後的舊程式碼仍能運作。

若 migration 本身出錯，用 D1 Time Travel（免費方案保留 7 天）：

```bash
npx wrangler d1 time-travel info tsurumaru
npx wrangler d1 time-travel restore tsurumaru --timestamp=<ISO-8601>
```

## 機密防護關卡

`guard` job 在部署前檢查四件事：

1. `reference/` 下沒有任何檔案進入版控
2. `.dev.vars`、`.env` 未進入版控
3. 沒有帶值的 `password=` / `pwd=` 指派
4. 沒有 `data source=` 連線字串

**這個 repo 是 public**，任何 commit 都對全世界公開，而舊系統的明碼憑證就在 `reference/`（已由 [.gitignore](../.gitignore) 排除）。這一關防的是「某次 `git add -f` 或改動 .gitignore 後不小心把它們帶進去」。

檢查規則**刻意不寫死任何實際憑證字串** — 檢查指令本身若含祕密，就是另一次外洩。這個錯誤實際發生過，見 [06-verification.md](06-verification.md#憑證未外洩)。

誤判時不要放寬規則了事，先確認那真的不是祕密。

## 日後可加的關卡

現在刻意從簡。專案成熟後值得加的，依價值排序：

| 關卡 | 何時值得加 |
|---|---|
| PR 上跑 `astro check` + build | 開始有第二個人協作時 |
| PR 預覽環境（`wrangler versions upload`） | 前台移植階段 — 樣式零差異的驗收會方便很多。注意預覽版讀寫的是**正式** D1／R2 |
| 部署後的 smoke test（首頁與詳情頁回 200） | 正式上線後 |
| 正式部署需人工核准（`environment` 保護規則） | 正式營運後 |

## 相關文件

- 本機指令 → [05-workflows.md](05-workflows.md)
- 部署前檢查清單 → [06-verification.md](06-verification.md)
- 安全基線 → [08-security.md](08-security.md)

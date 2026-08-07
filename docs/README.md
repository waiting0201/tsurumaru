# docs — 導覽

這份文件集用 **harness engineering** 的方式組織：目標不是「寫得完整」，而是讓任何人（或任何 agent）在動手前能在 **一次讀取內** 取得該任務所需的全部脈絡、限制與驗收方式，不必回頭翻舊碼考古。

## 五個層次

每份文件只回答其中一種問題，避免內容重疊：

| 層次 | 回答什麼 | 文件 |
|---|---|---|
| **脈絡** Context | 這是什麼系統？舊版做了什麼？ | [01-context.md](01-context.md) |
| | 要蓋成什麼？資源怎麼接？ | [02-architecture.md](02-architecture.md) |
| | 資料長什麼樣？欄位語意為何？ | [03-data-model.md](03-data-model.md) |
| **限制** Constraints | 什麼可以做、什麼絕不能做 | [04-conventions.md](04-conventions.md) |
| | 安全基線與舊系統缺陷 | [08-security.md](08-security.md) |
| **程序** Procedures | 要跑什麼指令、按什麼順序 | [05-workflows.md](05-workflows.md) |
| | 舊資料怎麼搬過來 | [07-migration.md](07-migration.md) |
| | 程式怎麼從 GitHub 上線 | [09-cicd.md](09-cicd.md) |
| **限制** Constraints | 免費方案的額度、CPU 上限與超標處理 | [10-cost.md](10-cost.md) |
| **驗證** Verification | 怎麼證明我改對了 | [06-verification.md](06-verification.md) |
| **決策** Decisions | 為什麼是這樣選的（別再重新爭論） | [adr/](adr/) |
| **地圖** Map | 舊系統的東西在哪、對應到新的哪裡 | [legacy-map.md](legacy-map.md) |

## 使用原則

1. **先讀路由表再動手。** 進入點永遠是 [../CLAUDE.md](../CLAUDE.md) 的任務→文件路由表。
2. **文件與程式同批修改。** 改了 schema 就同批更新 `03-data-model.md`；改了指令就更新 `05-workflows.md`。文件過期比沒有文件更危險。
3. **決策寫進 ADR，不寫進聊天記錄。** 任何影響架構的取捨，新增一份 `adr/NNNN-*.md`。要推翻既有決策就新增一份標記 supersedes，不要原地改寫歷史。
4. **標記不確定性。** 尚未實測的內容一律加 ⚠️ 並註明「首次執行時驗證」。不要讓推測看起來像事實。
5. **`reference/old/` 是行為的最終仲裁者。** 文件與舊碼衝突時，以舊碼為準並修正文件。

## 現況

| 項目 | 狀態 |
|---|---|
| 文件集 | ✅ 已建立 |
| 技術選型 | ✅ 已定案（見 adr/） |
| 舊資料庫 | ✅ 已定位（本機 Docker `sqlserver` / `tsurumaru`）並完成盤點 |
| 舊圖片 | ✅ 已定位（`reference/old/Tsurumaru/Upload/`），與資料庫對帳無誤 |
| 專案骨架 | ✅ 已建立並驗證（build／dry-run deploy／dev server 皆通過） |
| D1 / R2 資源 | ✅ 已在 Cloudflare 建立（見 [05](05-workflows.md#0-一次性建立專案骨架)） |
| D1 schema | ✅ `migrations/0001_initial_schema.sql`，已套用到本地 |
| 前台資產搬運 | ✅ 99 檔／14 MB 進 `public/`（從 2087 檔／49 MB 篩出實際引用的），每檔與來源位元組相同 |
| 資料搬遷 | ✅ **本地與正式 D1 皆已完成** —— 車廠 73／車型 1,317／車輛 2／管理員 1／權限 10，對帳與值域檢查全通過 |
| 圖片搬遷 | ✅ **本地與正式 R2 皆已完成** —— 2 張，雙向零孤兒 |
| 前台移植 | ✅ 8 個頁面，class 集合與舊 markup 逐頁比對**完全一致** |
| 後台重做 | ✅ 登入／權限／車廠／車型／車輛／相簿／管理員，最小權限與 CSRF 已實測 |
| 舊網址導轉 | ✅ 7 條規則實測通過（含 query→路徑、GUID 轉小寫） |
| CI/CD | 🟡 workflow 已就緒，待設定 GitHub secrets |
| 管理員密碼 | ⛔ 正式環境尚未設定 —— 依計畫刻意不搬舊明碼，需用 `scripts/set-admin-password.mjs` 設定後才能登入後台 |
| R2 公開網域 | ⬜ 未綁定 —— 未綁定前圖片由 Worker 代送 `/media/*`，綁定後設 `MEDIA_BASE_URL` 即可切換 |
| 部署 | ⬜ 尚未 commit／push |

# 08 — 安全基線

## 舊系統的已知缺陷

以下都是在 [`reference/old/`](../reference/old/) 實際存在的問題。列出來是為了**確保不被沿用**，不是為了批評。

| # | 缺陷 | 位置 | 新版對策 |
|---|---|---|---|
| 1 | 正式環境 Azure SQL 帳密以明碼存在版控中 | [Web.Release.config:13](../reference/old/Tsurumaru/Web.Release.config#L13) | 憑證輪替；新版祕密只走 `wrangler secret` |
| 2 | 本機 SQL `sa` 帳密明碼 | [Web.config:12](../reference/old/Tsurumaru/Web.config#L12)、[App.config:13](../reference/old/Tsurumaru.Models/App.config#L13) | 同上 |
| 3 | **寫死的後門帳號**（帳號 `weypro`，密碼見原始碼），登入後取得 `AdminID=888` 超級權限 | [MainController.cs:59](../reference/old/Tsurumaru/Areas/backend/Controllers/MainController.cs#L59) | 完全移除。不存在任何繞過資料庫的登入路徑 |
| 4 | 管理員密碼**明碼存資料庫**（`nvarchar(20)`） | [Model1.edmx](../reference/old/Tsurumaru.Models/Model1.edmx) `Admins.Password` | 改存雜湊；欄位改名為 `password_hash`；不搬舊密碼 |
| 5 | 密碼以 `!=` 直接字串比較 | [MainController.cs:71](../reference/old/Tsurumaru/Areas/backend/Controllers/MainController.cs#L71) | 用固定時間比較 |
| 6 | `AdminID=888` 硬編碼繞過所有權限檢查 | [CheckSessionAttribute.cs:46](../reference/old/Tsurumaru/Filters/CheckSessionAttribute.cs#L46) | 超級管理員改為資料驅動的角色旗標 |
| 7 | 權限用 **action 名稱字串比對**推導，改名即靜默失效 | [CheckSessionAttribute.cs:51-59](../reference/old/Tsurumaru/Filters/CheckSessionAttribute.cs#L51-L59) | 改為明確的 `(resource, action)` 宣告 |
| 8 | 權限節點查不到時 `lim.LimID` 會 NullReference | [CheckSessionAttribute.cs:58](../reference/old/Tsurumaru/Filters/CheckSessionAttribute.cs#L58) | 查不到一律拒絕（fail closed） |
| 9 | 刪除操作用 `HttpGet` | [WebMsController.cs:120](../reference/old/Tsurumaru/Areas/backend/Controllers/WebMsController.cs#L120) | 改用 POST + CSRF token |
| 10 | 上傳檔案未見型別／大小驗證 | [WebMsController.cs:479 起](../reference/old/Tsurumaru/Areas/backend/Controllers/WebMsController.cs#L479) | 白名單副檔名 + 驗證 magic bytes + 大小上限 |
| 11 | Ajax 端點直接回傳拼接的 HTML 字串 | [AjaxFController.cs:31](../reference/old/Tsurumaru/Controllers/AjaxFController.cs#L31) | 改回傳 JSON，前端負責渲染 |
| 12 | `trust level="Full"` | [Web.Release.config:17](../reference/old/Tsurumaru/Web.Release.config#L17) | 不適用（Workers 沙箱） |
| 13 | 權限樹缺少相簿節點，導致相簿管理對一般管理員完全不可用 | `Lims` 資料 + [CheckSessionAttribute.cs:58](../reference/old/Tsurumaru/Filters/CheckSessionAttribute.cs#L58) | 權限節點涵蓋所有資源，並於啟動時驗證完整性（見下） |
| 14 | 權限不足時導向 `/Error/Validation`，但**專案內沒有 ErrorController** → 使用者看到 404 | [CheckSessionAttribute.cs:65](../reference/old/Tsurumaru/Filters/CheckSessionAttribute.cs#L65) | 回傳 403 並顯示明確訊息 |
| 15 | 唯一的管理員帳號 `itadmin` 密碼僅 6 字元、明碼儲存 | 本機 Docker `tsurumaru.Admins` | 強制密碼長度與複雜度；重設流程見 [07](07-migration.md#管理員密碼) |

### 相簿管理對一般管理員完全不可用

這是缺陷 7（用字串比對推導權限）造成的實際後果，值得單獨說明，因為它同時是**安全設計缺陷**與**功能缺陷**。

實際的 `Lims` 權限樹（[完整內容](03-data-model.md#實際權限樹lims)）只有七個資源節點：`CarMakes`、`CarModels`、`MotorMakes`、`MotorModels`、`Cars`、`Motors`、`Admins`。**沒有 `CarPhotos` 或 `MotorPhotos`。**

於是當管理員存取 `AddCarPhotos` 時：

1. filter 把 action 去掉 `Add` 前綴 → `CarPhotos`
2. 在 `Lims` 中找不到對應節點 → `FirstOrDefault()` 對 `int` 回傳 **0**（不是 null，不會報錯）
3. 用 `LimID = 0` 去查 `AdminLims` → 查無資料
4. 導向 `/Error/Validation` → 而該 controller 不存在 → **404**

結果：除了硬編碼的 `AdminID=888` 後門帳號之外，**沒有任何管理員能夠管理車輛相簿**，而且失敗方式是一個沒有解釋的 404。

> 這正是為什麼新版要求權限以明確的 `(resource, action)` 宣告、且 fail closed 時要回傳可理解的錯誤。也建議加一個啟動期檢查：**每個受保護的資源都必須有對應的權限節點**，缺少就讓建置失敗，而不是在使用者點下去時才以 404 呈現。

### 立即行動（與改寫進度無關）

> 🚨 缺陷 1、2、3 是**現在正在生效的憑證**。無論新版何時上線，都應盡快：
> - 輪替 Azure SQL 的 `wadmin` 密碼
> - 停用或更改舊後台的 `weypro` 後門帳號
> - 更改 `itadmin` 的密碼（目前 6 字元、明碼儲存）
>
> 這些憑證存在於原始碼庫中，任何取得過此 repo 的人都握有正式資料庫的存取權。

## 新版安全要求

### 密碼

- Workers 沒有原生 bcrypt／argon2。用 **WebCrypto 的 PBKDF2-SHA256**，高迭代次數 + 每個使用者獨立 salt
- 儲存格式含演算法與參數，方便日後升級：`pbkdf2$sha256$<iterations>$<salt_b64>$<hash_b64>`
- 驗證用固定時間比較，不用 `===`
- 帳號不存在時仍執行一次雜湊運算，避免以回應時間推測帳號是否存在

### Session

- session 記錄存 D1（`sessions` 表：`id`、`admin_id`、`expires_at`、`created_at`），可撤銷
- cookie 屬性：`HttpOnly`、`Secure`、`SameSite=Lax`、`Path=/`
- cookie 值為隨機不可預測的 session id，**不放任何使用者資料**
- 登入成功後換發新的 session id（避免 session fixation）
- 登出時刪除資料庫紀錄，不是只清 cookie（舊版只做後者）

### 授權

- **每個**後台頁面與 API endpoint 都要檢查，不能只靠版型或選單隱藏
- 權限以明確的 `(resource, action)` 宣告，不從 URL 或函式名推導
- 一律 **fail closed**：查不到權限設定 = 拒絕
- 修改與刪除都必須驗證目標資源存在且該管理員有權操作

### 輸入處理

- SQL 一律用 prepared statement 綁參數（見 [04-conventions.md](04-conventions.md#資料存取)）
- 所有異動操作用 POST/PUT/DELETE + CSRF token，不用 GET
- 上傳檔案：副檔名白名單（jpg/jpeg/png/webp）、驗證 magic bytes、限制大小、**檔名重新產生**不沿用使用者輸入
- `description` 等欄位含 HTML，輸出時若用 `set:html` 必須先淨化（後台輸入端也要限制允許的標籤）

### 祕密

- 只用 `wrangler secret put`（正式）與 `.dev.vars`（本地）
- `.dev.vars` 必須在 `.gitignore`
- `wrangler.jsonc` 內不得出現任何金鑰
- R2 不對外發放金鑰；寫入只經後台 endpoint 的 binding

### 標頭

後台回應：`Cache-Control: no-store`、`X-Robots-Tag: noindex`。全站建議設定 CSP、`X-Content-Type-Options: nosniff`、`Referrer-Policy`。

## 上線前檢查清單

- [ ] 舊憑證未進入版控範圍 — 作法見 [06-verification.md](06-verification.md#憑證未外洩)
- [ ] Azure SQL 憑證已輪替
- [ ] 舊後台後門帳號已停用
- [ ] 程式中不存在任何硬編碼帳號或密碼
- [ ] 資料庫中無明碼密碼
- [ ] 未登入存取任一 `/admin/*` 頁面 → 導向登入
- [ ] 低權限帳號執行新增／修改／刪除 → 被拒（直接打 API 也一樣）
- [ ] 所有異動操作皆非 GET，且帶 CSRF token
- [ ] 上傳非圖片檔案 → 被拒
- [ ] session cookie 具 `HttpOnly` / `Secure` / `SameSite`
- [ ] 登出後舊 session id 無法再使用
- [ ] `/admin/*` 回應含 `noindex`

## 相關文件

- 密碼不搬遷的處理 → [07-migration.md](07-migration.md#管理員密碼)
- 權限資料表結構 → [03-data-model.md](03-data-model.md#admin_permissions--管理員權限舊-adminlims)
- 驗收方式 → [06-verification.md](06-verification.md#安全驗收)

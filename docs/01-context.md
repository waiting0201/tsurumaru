# 01 — 專案脈絡

## 這是什麼

Tsurumaru（鶴丸）是一個**中古車與中古重機的展示與詢問網站**，繁體中文（台灣）。它不是電商 — 沒有購物車、沒有金流、沒有前台會員。前台純粹是型錄與導流，後台是店家自用的內容管理系統。

- **前台**：訪客瀏覽車輛型錄、依條件篩選、看詳細規格與相簿、找店家位置。
- **後台**：店員上架／下架車輛、上傳相片、維護車廠與車型清單、調整排序；管理員管理帳號與權限。

## 舊系統

| 項目 | 內容 |
|---|---|
| 技術 | ASP.NET MVC 5 (.NET Framework)、Entity Framework 6（EDMX / Database First）、Razor |
| 資料庫 | Azure SQL（`weypro.database.windows.net` / `tsurumaru`） |
| 圖片 | 存於 Web 主機檔案系統 `~/Upload/{Cars,Motors}/{VehicleID}/` |
| 前台版型 | Bootstrap 5 系商業樣板 + tiny-slider / nouislider / lightgallery / simplebar / jarallax / smooth-scroll，另載 jQuery 2.2.4 |
| 後台版型 | SmartAdmin 系樣板（`_Aside` / `_Ribbon` / `_Tiles`），重度依賴 jQuery |
| 原始碼位置 | [`reference/old/`](../reference/old/)（唯讀） |

三個專案：`Tsurumaru`（Web）、`Tsurumaru.Service`（服務層）、`Tsurumaru.Models`（EF 實體與 Repository）。

## 功能盤點（改寫的驗收基準）

### 前台

| 功能 | 舊路由 | 行為 | 來源 |
|---|---|---|---|
| 首頁 | `/` | 汽車、機車各取前 6 台（依 `Sort`） | [HomeController.cs:31](../reference/old/Tsurumaru/Controllers/HomeController.cs#L31) |
| 汽車列表 | `/Home/Cars` | 多條件篩選 + 每頁 8 筆分頁 | [HomeController.cs:42](../reference/old/Tsurumaru/Controllers/HomeController.cs#L42) |
| 汽車詳情 | `/Home/CarDetail?VehicleID={guid}` | 規格、相簿、推薦 6 台 | [HomeController.cs:111](../reference/old/Tsurumaru/Controllers/HomeController.cs#L111) |
| 機車列表 | `/Home/Bikes` | 同汽車，但**篩選條件較少**（無傳動／燃料／變速器） | [HomeController.cs:122](../reference/old/Tsurumaru/Controllers/HomeController.cs#L122) |
| 機車詳情 | `/Home/BikeDetail?VehicleID={guid}` | 同汽車詳情 | [HomeController.cs:179](../reference/old/Tsurumaru/Controllers/HomeController.cs#L179) |
| 關於我們 | `/Home/About` | 靜態內容 | [HomeController.cs:190](../reference/old/Tsurumaru/Controllers/HomeController.cs#L190) |
| 地圖 | `/Home/Map` | 靜態內容 | [HomeController.cs:195](../reference/old/Tsurumaru/Controllers/HomeController.cs#L195) |
| 隱私權 | `/Home/Privacy` | 靜態內容 | [HomeController.cs:200](../reference/old/Tsurumaru/Controllers/HomeController.cs#L200) |
| 車型連動下拉 | `POST /AjaxF/GetVehicleModelsByVehicleMakeID` | 選車廠後回傳該廠車型的 `<option>` **HTML 片段** | [AjaxFController.cs:24](../reference/old/Tsurumaru/Controllers/AjaxFController.cs#L24) |

**篩選條件**（汽車）：關鍵字 `K`、車型 `VehicleModelID`、年份區間 `Year`、價格 `PriceFrom`/`PriceTo`、傳動 `Driveline`、燃料 `Fuel`、變速器 `Transmission`、外觀顏色 `Exterior`。機車只有 `K`、`VehicleModelID`、`Year`、價格、`Exterior`。

> ⚠️ 其中**關鍵字搜尋 `K` 是壞的** — 它拿自由文字去比對只存代碼的 `VehicleType` 欄位，任何真實關鍵字都回傳零筆。新版需先決定要修成什麼，見 [03-data-model.md](03-data-model.md#關鍵字搜尋已失效)。

篩選一律用 **AND** 串接；同一組多選（如顏色勾兩色）為 **OR**。列表固定依 `Sort` 遞增排序，**沒有**其他排序選項。

### 後台

| 功能 | 舊路由 | 說明 |
|---|---|---|
| 登入 / 登出 | `/backend/Main/Login`、`/backend/Main/Logout` | Session 式登入 |
| 儀表板 | `/backend/Main/Index` | 進站首頁 |
| 汽車車廠 | `/backend/WebMs/{CarMakes,AddCarMakes,EditCarMakes,DeleteCarMakes,SortCarMakes}` | CRUD + 排序，每頁 20 筆 |
| 汽車車型 | `/backend/WebMs/*CarModels` | 同上，可依車廠篩選 |
| 汽車 | `/backend/WebMs/*Cars` | CRUD + 排序 + 主圖上傳 |
| 汽車相簿 | `/backend/WebMs/*CarPhotos` | 每台車的多張相片 CRUD + 排序 |
| 機車車廠／車型／機車／相簿 | `/backend/WebMs/*Motor*` | 與汽車完全平行的另一套 |
| 管理員 | `/backend/SettingMs/{Admins,AddAdmins,EditAdmins}` | 帳號與權限指派 |

> **注意：後台的汽車與機車是兩套幾乎逐行重複的程式**（[WebMsController.cs](../reference/old/Tsurumaru/Areas/backend/Controllers/WebMsController.cs) 共 1027 行，約一半是複製貼上）。新版必須合併為單一組以 `type` 參數驅動的流程 — 見 [04-conventions.md](04-conventions.md#合併汽車與機車的重複邏輯)。

### 權限模型

`Lims` 是一張**自我參照的權限樹**（`ParentID` 指向自己）：父節點對應 controller，子節點對應 action 群組。`AdminLims` 則記錄每位管理員對每個節點的 `IsAdd` / `IsUpdate` / `IsDelete`。

檢查發生在 `[CheckSession(IsAuth = true)]` filter：把 action 名稱去掉 `Add`/`Edit`/`Delete`/`Sort` 前綴後，用**字串比對**去找對應的 `Lims` 節點。

實際資料庫中的權限樹只有 7 個資源節點（車廠／車型／車輛各分汽機車，加上管理者維護），[完整內容見此](03-data-model.md#實際權限樹lims)。

⚠️ 三個問題：這個字串比對驅動的設計非常脆弱（改 action 名稱就會靜默失去權限控管）；`AdminID == 888` 是寫死的超級管理員後門；而且**權限樹裡根本沒有相簿節點，導致相簿管理對所有一般管理員都是壞的**。新版保留「每個資源 × 增改刪」的權限**語意**，但改為明確的權限宣告。見 [08-security.md](08-security.md#相簿管理對一般管理員完全不可用)。

## 刻意修正的舊版缺陷

移植時發現了幾個舊站確實存在的錯誤。**這些是刻意的行為變更，不是回歸** —— 日後比對新舊站發現差異時，先看這張表。

| 缺陷 | 舊站行為 | 新站行為 |
|---|---|---|
| 年份區間有缺口 | 區間邊界用嚴格大小於，以今年為例車齡 3 年的車不屬於任何區間，會從篩選結果消失 | 區間相連且不重疊，已用 16 個年份逐一驗證 |
| 關鍵字搜尋失效 | 拿自由文字比對只存代碼的 `vehicle_type`，任何真實關鍵字都回零筆 | 比對車廠與車型名稱（[說明](03-data-model.md#關鍵字搜尋已失效)） |
| 卡片顯示變速器代碼 | 直接印出資料庫的 `"3"`，而不是「自手排」 | 顯示對照文字（燃料欄位在隔壁兩格本來就有正確對照，可見是遺漏） |
| 詳情頁顯示車種代碼 | 「車身類型」印出 `"1"` | 顯示「轎車/跑車」 |
| 詳情頁「傳動」多一個 7 | 樣板殘留：`<span>7 @Model.Transmission</span>` | 移除寫死的 `7` |
| 相關車輛連結是死的 | `href="catalog-single.html"`，樣板殘留 | 指向正確的車輛詳情頁 |
| 瀏覽次數從未累加 | `Views` 欄位存在但只讀不寫，永遠是 0 | 用 `waitUntil()` 非阻塞累加 |
| 相簿管理完全不可用 | 權限樹缺 Photos 節點 → 一般管理員必定撞到無說明的 404 | 已補上節點，功能可用（[說明](08-security.md#相簿管理對一般管理員完全不可用)） |
| `Privacy` 有未閉合的 `<p>` | 靠瀏覽器自動修復 | 顯式閉合，渲染結果相同 |

## 不在範圍內

舊系統**沒有**、新版也不做（除非另行決定）：

- 前台會員、收藏、比價
- 線上詢問表單、預約試車（頁面上的聯絡方式是靜態的）
- 金流、訂單
- 多語系（僅繁體中文）
- 全文檢索（`K` 只針對 `VehicleType` 欄位做 `LIKE`）

## 相關文件

- 目標架構 → [02-architecture.md](02-architecture.md)
- 資料欄位與列舉值 → [03-data-model.md](03-data-model.md)
- 舊檔案對應新檔案 → [legacy-map.md](legacy-map.md)

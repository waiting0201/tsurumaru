# 舊系統對照地圖

找「舊版這個功能寫在哪」與「它對應到新版的哪裡」時看這份。舊碼位於 [`reference/old/`](../reference/old/)，**唯讀**。

## 專案結構

| 舊專案 | 內容 | 新版去處 |
|---|---|---|
| `Tsurumaru/` | Web 層：Controllers、Views、靜態資產 | `src/pages`、`src/layouts`、`src/components`、`public/` |
| `Tsurumaru.Service/` | 服務層：泛型 CRUD 包裝 | `src/lib/`（大幅簡化 — 見下方說明） |
| `Tsurumaru.Models/` | EF 實體 + EDMX + GenericRepository | `src/lib/types.ts` + `migrations/` |

> **服務層不要照搬。** `BaseService` / `GenericRepository` 是為了包裝 Entity Framework 而存在的抽象層。D1 的 prepared statement API 已經夠直接，再包一層泛型 repository 只會增加閱讀成本。寫具體的查詢函式即可。

## 前台

| 舊檔案 | 新檔案 |
|---|---|
| [Views/Shared/_Layout.cshtml](../reference/old/Tsurumaru/Views/Shared/_Layout.cshtml) | `src/layouts/Site.astro` |
| [Views/Shared/_Header.cshtml](../reference/old/Tsurumaru/Views/Shared/_Header.cshtml) | `src/components/site/Header.astro` |
| [Views/Shared/_Footer.cshtml](../reference/old/Tsurumaru/Views/Shared/_Footer.cshtml) | `src/components/site/Footer.astro` |
| [Views/Shared/_Styles.cshtml](../reference/old/Tsurumaru/Views/Shared/_Styles.cshtml) | `Site.astro` 的 `<head>`（順序不變） |
| [Views/Shared/_Scripts.cshtml](../reference/old/Tsurumaru/Views/Shared/_Scripts.cshtml) | `Site.astro` 的 `</body>` 前（順序不變） |
| [Views/Home/Index.cshtml](../reference/old/Tsurumaru/Views/Home/Index.cshtml) | `src/pages/index.astro` |
| [Views/Home/Cars.cshtml](../reference/old/Tsurumaru/Views/Home/Cars.cshtml) | `src/pages/cars/index.astro` |
| [Views/Home/CarDetail.cshtml](../reference/old/Tsurumaru/Views/Home/CarDetail.cshtml) | `src/pages/cars/[id].astro` |
| [Views/Home/Bikes.cshtml](../reference/old/Tsurumaru/Views/Home/Bikes.cshtml) | `src/pages/bikes/index.astro` |
| [Views/Home/BikeDetail.cshtml](../reference/old/Tsurumaru/Views/Home/BikeDetail.cshtml) | `src/pages/bikes/[id].astro` |
| [Views/Home/About.cshtml](../reference/old/Tsurumaru/Views/Home/About.cshtml) | `src/pages/about.astro` |
| [Views/Home/Map.cshtml](../reference/old/Tsurumaru/Views/Home/Map.cshtml) | `src/pages/map.astro` |
| [Views/Home/Privacy.cshtml](../reference/old/Tsurumaru/Views/Home/Privacy.cshtml) | `src/pages/privacy.astro` |

列表頁與詳情頁的汽車／機車版本**在新版共用元件**（`FilterPanel`、`VehicleCard`、`VehicleSpecs`），只靠 `type` 與篩選欄位清單區分。

## 靜態資產

| 舊路徑 | 新路徑 |
|---|---|
| `Tsurumaru/Content/css/theme.css` | `public/content/css/theme.css` |
| `Tsurumaru/Content/img/**` | `public/content/img/**` |
| `Tsurumaru/Content/fonts/**` | `public/content/fonts/**` |
| `Tsurumaru/Scripts/vendor/**` | `public/scripts/vendor/**` |
| `Tsurumaru/Scripts/js/theme.min.js` | `public/scripts/js/theme.min.js` |

原樣複製，不重新打包（[紅線一](04-conventions.md#-紅線一前台視覺零變更)）。

**例外：`Tsurumaru/Upload/` 不是靜態資產，是使用者上傳的資料。** 它搬到 **R2**（`vehicles/{vehicle_id}/{filename}`），不進 `public/`。搬遷方式與大小寫陷阱見 [07-migration.md](07-migration.md#圖片搬遷)。

## 邏輯

| 舊位置 | 做什麼 | 新位置 |
|---|---|---|
| [HomeController.Index:31](../reference/old/Tsurumaru/Controllers/HomeController.cs#L31) | 首頁各取 6 台 | `src/lib/vehicles.ts` → `getFeatured(type, 6)` |
| [HomeController.Cars:42](../reference/old/Tsurumaru/Controllers/HomeController.cs#L42) | 篩選 + 分頁 | `src/lib/filters.ts` + `src/lib/vehicles.ts` |
| [HomeController.CarDetail:111](../reference/old/Tsurumaru/Controllers/HomeController.cs#L111) | 取單台 + 推薦 | `src/lib/vehicles.ts` → `getById` / `getFeatured` |
| [AjaxFController:24](../reference/old/Tsurumaru/Controllers/AjaxFController.cs#L24) | 車型連動下拉（回傳 HTML） | `src/pages/api/models.ts`（**改回傳 JSON**） |
| [CheckSessionAttribute](../reference/old/Tsurumaru/Filters/CheckSessionAttribute.cs) | 登入與權限檢查 | `src/lib/auth.ts` + `src/middleware.ts`（**重新設計**，見 [08](08-security.md)） |
| [BaseController:23](../reference/old/Tsurumaru/Areas/backend/Controllers/BaseController.cs#L23) | 後台側邊選單來自 Lims 表 | 選單寫死在 `src/components/admin/Nav.astro` |
| [MainController.ValidateUser:57](../reference/old/Tsurumaru/Areas/backend/Controllers/MainController.cs#L57) | 登入驗證 | `src/lib/auth.ts`（**移除後門、改雜湊**） |

## 後台

舊後台的 `Cars` 與 `Motors` 是兩套重複程式（[WebMsController.cs](../reference/old/Tsurumaru/Areas/backend/Controllers/WebMsController.cs) 共 1027 行）。新版合併為單一組頁面：

| 舊 action 群（× 汽車／機車兩套） | 新頁面 |
|---|---|
| `CarMakes` / `MotorMakes` + Add/Edit/Delete/Sort | `src/pages/admin/makes/` |
| `CarModels` / `MotorModels` + … | `src/pages/admin/models/` |
| `Cars` / `Motors` + … | `src/pages/admin/vehicles/` |
| `CarPhotos` / `MotorPhotos` + … | `src/pages/admin/vehicles/[id]/photos/` |
| `SettingMs/Admins` + Add/Edit | `src/pages/admin/admins/` |
| `Main/Login` / `Main/Logout` | `src/pages/admin/login.astro` |
| `Main/Index` | `src/pages/admin/index.astro` |

舊後台的 View（`Areas/backend/Views/`）**不作為版面參考**，只作為**欄位與流程**的參考 — 例如 [AddCars.cshtml](../reference/old/Tsurumaru/Areas/backend/Views/WebMs/AddCars.cshtml) 用來確認表單有哪些欄位、各欄位的選項值。UI 全部重做（[ADR-0005](adr/0005-rebuild-admin-ui.md)）。

## 刻意不移植

| 舊有的東西 | 為什麼不移植 |
|---|---|
| `GenericRepository` / `BaseService` / `Result` | EF 時代的抽象，D1 不需要 |
| `Model1.edmx` / `.tt` 樣板 | Database-First 產生器，改用手寫 migration |
| `PagedList` 套件 | 用 SQL `LIMIT`/`OFFSET` 自己算 |
| SmartAdmin 後台樣板與其 jQuery 外掛 | 後台重做 |
| `packages.config` / NuGet | 改用 npm |
| `Web.config` 轉換機制 | 改用 wrangler 環境設定 |
| 硬編碼後門帳號 | 安全缺陷（[08-security.md](08-security.md)） |

## 相關文件

- 為什麼這樣選 → [adr/](adr/)
- 移植規則 → [04-conventions.md](04-conventions.md)

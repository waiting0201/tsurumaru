# 03 — 資料模型

真相來源：[`reference/old/Tsurumaru.Models/Model1.edmx`](../reference/old/Tsurumaru.Models/Model1.edmx) 的 SSDL 區段（實際資料庫 schema）。本頁是它的翻譯與註解，兩者衝突時以 EDMX 為準。

## 型別對照（SQL Server → D1／SQLite）

| SQL Server | D1 | 說明 |
|---|---|---|
| `uniqueidentifier` | `TEXT` | UUID 字串，**一律小寫、含連字號**。SQLite 無原生 GUID 型別 |
| `int IDENTITY` | `INTEGER PRIMARY KEY AUTOINCREMENT` | |
| `int` | `INTEGER` | |
| `nvarchar(n)` | `TEXT` | SQLite 不強制長度；長度限制改由應用層驗證 |
| `ntext` | `TEXT` | |
| `bit` | `INTEGER` | 僅存 0／1 |
| `datetime` | `TEXT` | **ISO-8601 UTC**（`2026-08-06T12:34:56Z`）。不要用 SQLite 的數字時間 |

命名一併從 PascalCase 改為 snake_case（SQLite 慣例）。對照見本頁最後的[欄位名對照表](#欄位名對照表)。

## 實體關係

```
admins ──< admin_permissions >── permissions ──┐
                                       └───────┘ 自我參照 parent_id

vehicle_makes ──< vehicle_models ──< vehicles ──< vehicle_photos
```

## 資料表

### vehicles — 車輛（核心）

| 欄位 | 型別 | Null | 說明 |
|---|---|---|---|
| `id` | TEXT PK | ✗ | UUID |
| `vehicle_model_id` | INTEGER FK | ✗ | → `vehicle_models.id` |
| `type` | INTEGER | ✗ | 1=汽車、2=機車（見[列舉](#列舉字典)） |
| `year` | INTEGER | ✓ | 出廠年份（西元） |
| `fuel` | INTEGER | ✓ | 燃料類型 |
| `mileage` | INTEGER | ✓ | 里程（公里） |
| `vehicle_type` | TEXT | ✓ | **車種**（車體型式）代碼，存數字**字串** `"1"`–`"5"`。⚠️ 前台的自由文字「關鍵字」搜尋比對的就是這個欄位 — 見[關鍵字搜尋已失效](#關鍵字搜尋已失效) |
| `driveline` | TEXT | ✓ | 傳動系統，存數字**字串** `"1"`–`"3"` |
| `exterior` | TEXT | ✓ | 外觀顏色，存**中文色名** |
| `interior` | TEXT | ✓ | 內裝描述（自由文字） |
| `engine` | TEXT | ✓ | 引擎描述（自由文字） |
| `transmission` | TEXT | ✓ | 變速器，存數字**字串** `"1"`–`"4"` |
| `cc` | INTEGER | ✓ | 排氣量 |
| `location` | TEXT | ✓ | 車輛所在地 |
| `vin` | TEXT | ✓ | 車身號碼 |
| `summary` | TEXT | ✓ | 摘要（長文） |
| `description` | TEXT | ✓ | 詳細說明（長文，含 HTML） |
| `photo` | TEXT | ✗ | 主圖**檔名**（非完整路徑），組 URL 方式見 [07](07-migration.md#圖片搬遷) |
| `price` | INTEGER | ✗ | 售價（新台幣，整數元） |
| `created_at` | TEXT | ✗ | ISO-8601 UTC。舊欄位名 `Createdate` |
| `views` | INTEGER | ✗ | 瀏覽次數，預設 0 |
| `sort` | INTEGER | ✗ | 排序值，**前台所有列表都只依此遞增排序** |

建議索引：

```sql
CREATE INDEX idx_vehicles_type_sort  ON vehicles(type, sort);
CREATE INDEX idx_vehicles_model      ON vehicles(vehicle_model_id);
CREATE INDEX idx_vehicles_type_price ON vehicles(type, price);
```

### vehicle_photos — 相簿

| 欄位 | 型別 | Null | 說明 |
|---|---|---|---|
| `id` | TEXT PK | ✗ | UUID |
| `vehicle_id` | TEXT FK | ✗ | → `vehicles.id`，`ON DELETE CASCADE` |
| `photo` | TEXT | ✗ | 檔名 |
| `title` | TEXT | ✓ | 圖說 |
| `sort` | INTEGER | ✗ | 相簿內排序 |

```sql
CREATE INDEX idx_photos_vehicle ON vehicle_photos(vehicle_id, sort);
```

### vehicle_makes — 車廠

| 欄位 | 型別 | Null | 說明 |
|---|---|---|---|
| `id` | INTEGER PK AI | ✗ | |
| `type` | INTEGER | ✗ | 1=汽車廠、2=機車廠。**同一車廠若兩者都做，會是兩筆資料** |
| `code` | TEXT | ✗ | 代碼 |
| `title` | TEXT | ✗ | 顯示名稱 |
| `sort` | INTEGER | ✗ | |

### vehicle_models — 車型

| 欄位 | 型別 | Null | 說明 |
|---|---|---|---|
| `id` | INTEGER PK AI | ✗ | |
| `vehicle_make_id` | INTEGER FK | ✗ | → `vehicle_makes.id` |
| `code` | TEXT | ✗ | |
| `title` | TEXT | ✗ | |
| `sort` | INTEGER | ✗ | |

> `vehicle_models` **本身沒有 `type` 欄位** — 車型是汽車還是機車，要透過 `vehicle_makes.type` 判斷。舊碼即是如此（`a.VehicleMakes.Type == 1`）。

### admins — 管理員

| 欄位 | 型別 | Null | 說明 |
|---|---|---|---|
| `id` | INTEGER PK AI | ✗ | |
| `name` | TEXT | ✓ | 顯示名稱 |
| `username` | TEXT | ✗ | 登入帳號，**新版加 UNIQUE**（舊版沒有） |
| `password_hash` | TEXT | ✗ | ⚠️ 舊版是 `nvarchar(20)` 明碼。新版存雜湊，**欄位改名以杜絕誤用** |
| `email` | TEXT | ✓ | |

### permissions — 權限節點（舊 `Lims`）

| 欄位 | 型別 | Null | 說明 |
|---|---|---|---|
| `id` | INTEGER PK AI | ✗ | |
| `key` | TEXT | ✓ | 節點鍵值 |
| `value` | TEXT | ✓ | 顯示名稱 |
| `icon` | TEXT | ✓ | 後台選單圖示 |
| `sort` | INTEGER | ✗ | |
| `parent_id` | INTEGER FK | ✓ | → 自身，NULL 為根節點 |

這張表同時扮演**後台選單**與**權限節點**兩種角色（`BaseController` 把整棵樹塞進 `ViewBag.SiteLinks` 當側邊選單）。新版建議拆開：選單寫在程式碼裡，這張表只留權限語意。

### admin_permissions — 管理員權限（舊 `AdminLims`）

| 欄位 | 型別 | Null | 說明 |
|---|---|---|---|
| `id` | TEXT PK | ✗ | UUID |
| `admin_id` | INTEGER FK | ✗ | → `admins.id`，`ON DELETE CASCADE` |
| `permission_id` | INTEGER FK | ✗ | → `permissions.id` |
| `can_add` | INTEGER | ✗ | 0／1 |
| `can_update` | INTEGER | ✗ | 0／1 |
| `can_delete` | INTEGER | ✗ | 0／1 |

新版加上 `UNIQUE(admin_id, permission_id)` — 舊版沒有，同一組合可能重複。

## 列舉字典

**這是唯一權威版本。** 實作時集中在 `src/lib/enums.ts`，任何頁面都不得自行硬寫這些數字。

```ts
export const VEHICLE_TYPE = { CAR: 1, BIKE: 2 } as const;

// 車種／車體型式。注意：存的是「字串」形式的數字，欄位名為 vehicle_type
export const VEHICLE_BODY = {
  '1': '轎車/跑車', '2': '休旅車', '3': '貨車', '4': '吉普車', '5': '其他車型',
} as const;

export const FUEL = {
  1: '汽油', 2: '柴油', 3: '油電', 4: '純電',
} as const;

// 注意：資料庫存的是「字串」形式的數字
export const DRIVELINE = {
  '1': 'AWD/4WD', '2': '前驅', '3': '後驅',
} as const;

export const TRANSMISSION = {
  '1': '手排', '2': '自排', '3': '自手排', '4': '手自排',
} as const;

// 外觀顏色直接存中文，非代碼。共 12 色（前台篩選面板與後台表單一致）
export const EXTERIOR_COLORS = [
  '白色', '紅色', '銀色', '灰色', '黑色', '黃色',
  '橙色', '綠色', '藍色', '紫色', '棕色', '粉色',
] as const;
```

來源：前台篩選面板 [Cars.cshtml:73-135](../reference/old/Tsurumaru/Views/Home/Cars.cshtml#L73-L135)、後台輸入表單 [AddCars.cshtml:95-208](../reference/old/Tsurumaru/Areas/backend/Views/WebMs/AddCars.cshtml#L95-L208)，並以本機 Docker 內的實際資料交叉驗證。`VEHICLE_BODY` 另來自 [AddCars.cshtml:125-147](../reference/old/Tsurumaru/Areas/backend/Views/WebMs/AddCars.cshtml#L125-L147)。

### 關鍵字搜尋已失效

前台篩選面板的 `K` 是一個 **自由文字輸入框**（`placeholder="關鍵字..."`，[Cars.cshtml:31](../reference/old/Tsurumaru/Views/Home/Cars.cshtml#L31)），但後端拿它去比對的是 `VehicleType` — 一個只存 `"1"`–`"5"` 的**車種代碼**欄位：

```csharp
if (K != null) cars = cars.Where(a => a.VehicleType.Contains(K));
```
[HomeController.cs:46](../reference/old/Tsurumaru/Controllers/HomeController.cs#L46)

也就是說輸入「Toyota」「Camry」等任何真實關鍵字都必然回傳零筆；只有輸入 `1`–`5` 才會有反應，而那是使用者無從得知的行為。**這個搜尋框自始就是壞的。**

**已採用選項 A**（實作於 [`src/lib/filters.ts`](../src/lib/filters.ts)）：`K` 改為比對 `vehicle_makes.title` 與 `vehicle_models.title`，也就是使用者一直以為會發生的事。前台 markup 完全不動（輸入框本來就是自由文字），因此不受[紅線一](04-conventions.md#-紅線一前台視覺零變更)約束。

曾考慮的選項 B 是把輸入框改成「車種」下拉選單以符合欄位的真實語意，但那會改動前台 markup，需另開 ADR，且對使用者而言是更差的功能。

⚠️ 這是**刻意的行為變更，不是回歸**。舊站輸入任何關鍵字都回零筆，新站會回傳結果。

### 年份篩選區間

前台 `Year` 參數不是年份，是**區間代碼**：

| 代碼 | 語意 |
|---|---|
| 1 | 今年 |
| 2 | 1～3 年 |
| 3 | 3～5 年 |
| 4 | 5～10 年 |
| 其他 | 10 年以上 |

⚠️ **已知缺陷（舊版）**：舊碼區間邊界用嚴格大於／小於，區間之間有縫。以 2026 年為例，代碼 2 取 `> 2023 且 < 2026`（即 2024–2025），代碼 3 取 `> 2021 且 < 2023`（即 2022），**2023 年出廠的車不屬於任何區間，會從所有篩選結果中消失**。見 [HomeController.cs:48-75](../reference/old/Tsurumaru/Controllers/HomeController.cs#L48-L75)。

新版**應修正為連續且不重疊的區間**（下界含、上界不含）。這是行為變更，已在此明確記錄為刻意修正，不是回歸。

## 業務規則

1. **排序**：前台所有列表僅依 `sort` 遞增。沒有價格／年份／時間排序功能。
2. **分頁**：前台每頁 8 筆；後台每頁 20 筆。
3. **首頁**：汽車、機車各取 `sort` 最小的 6 台。
4. **詳情頁推薦**：同類型取 `sort` 最小的 6 台，**不排除當前這台**（舊版行為，可保留）。
5. **關鍵字 `K`**：僅對 `vehicle_type` 做 `LIKE '%K%'`。⚠️ 該欄位存的是車種代碼，此功能實質失效 — 見[關鍵字搜尋已失效](#關鍵字搜尋已失效)。
6. **多選篩選**：同欄位多值為 OR，不同欄位之間為 AND。
7. **機車篩選較少**：機車列表沒有傳動、燃料、變速器三個條件。
8. **`views`**：詳情頁瀏覽計數。⚠️ 舊碼**其實從未累加**（`CarDetail` 只讀不寫）。新版若要真的計數，用 `Astro.locals.cfContext.waitUntil()` 非同步累加，別擋住回應。

## 實際資料快照

取自本機 Docker 的 `sqlserver` 容器（資料庫 `tsurumaru`，2026-08-06）。連線方式見 [07-migration.md](07-migration.md#來源資料庫本機-docker)。

| 資料表 | 筆數 | 備註 |
|---|---:|---|
| `VehicleMakes` | 73 | 汽車廠 71、機車廠 2 |
| `VehicleModels` | 1,317 | 主要是汽車車型的參考資料 |
| `Vehicles` | **2** | 一台汽車、一台機車 |
| `VehiclePhotos` | **0** | 完全沒有相簿資料 |
| `Admins` | 1 | `itadmin`，密碼長度 6（明碼） |
| `Lims` | 9 | 權限樹，見下 |
| `AdminLims` | 7 | 全部屬於 `AdminID=1`，且全為完整權限 |

> ⚠️ **這是一個開發用資料庫，不是正式營運資料。** 車輛僅 2 筆、相片 0 筆，但車廠與車型的參考資料是完整的。正式的車輛庫存（若存在）應在 Azure SQL。搬遷計畫必須先確認要以哪一邊為來源 — 見 [07-migration.md](07-migration.md)。

### 實際權限樹（`Lims`）

```
1  WebMs      網站管理    (fa-briefcase)
   ├─ 4  CarMakes     汽車品牌維護
   ├─ 5  CarModels    汽車車型維護
   ├─ 6  MotorMakes   機車品牌維護
   ├─ 7  MotorModels  機車車型維護
   ├─ 8  Cars         汽車維護
   └─ 9  Motors       機車維護
2  SettingMs  系統管理    (fa-cog)
   └─ 3  Admins       管理者維護
```

⚠️ **沒有相簿（Photos）節點。** 這造成一個實際存在的權限缺陷，見 [08-security.md](08-security.md#相簿管理對一般管理員完全不可用)。

### 資料格式觀察

- **圖片檔名**為時間戳記格式 `yyyyMMddHHmmss.ext`，例如 `20220401033916.jpeg`、`20211101192026.gif`。**副檔名包含 `.gif`** — 上傳白名單若只放 jpg/png/webp，舊資料會失效。實際檔案在 [`reference/old/Tsurumaru/Upload/`](../reference/old/Tsurumaru/Upload/)，與資料庫紀錄一一對應、零孤兒。
- **GUID 大小寫兩邊不一致**：資料庫存大寫（`29576F8F-…`），檔案系統目錄用小寫（`29576f8f-…`）。舊系統跑在不分大小寫的 NTFS 上所以沒事，搬到 R2／D1 會出問題 — 見 [07-migration.md](07-migration.md#路徑對應)。
- **車型名稱內含階層資訊**：`VehicleModels.Title` 會出現 `CL Models (4)` 這種群組標題，其下的成員則以 ` - ` 開頭（` - 2.2CL`、` - 2.3CL`）。這個階層**只存在於字串裡**，資料表本身是扁平的。移植下拉選單時若要保留縮排效果，需依此前綴判斷，不要 trim 掉開頭空白。
- `Vehicles.Views` 兩筆皆為 0，佐證[瀏覽計數從未被寫入](#業務規則)。

## 欄位名對照表

| 舊（SQL Server） | 新（D1） |
|---|---|
| `Vehicles` | `vehicles` |
| `Vehicles.VehicleID` | `vehicles.id` |
| `Vehicles.Createdate` | `vehicles.created_at` |
| `VehiclePhotos` | `vehicle_photos` |
| `VehiclePhotos.VehiclePhotoID` | `vehicle_photos.id` |
| `VehicleMakes.VehicleMakeID` | `vehicle_makes.id` |
| `VehicleModels.VehicleModelID` | `vehicle_models.id` |
| `Admins.Password` | `admins.password_hash`（語意也變了） |
| `Lims` | `permissions` |
| `Lims.ParentID` | `permissions.parent_id` |
| `AdminLims` | `admin_permissions` |
| `AdminLims.IsAdd/IsUpdate/IsDelete` | `can_add/can_update/can_delete` |

其餘欄位皆為 PascalCase → snake_case 的機械式轉換。

## 相關文件

- 實際搬遷步驟與轉檔腳本 → [07-migration.md](07-migration.md)
- 權限如何執行 → [08-security.md](08-security.md)

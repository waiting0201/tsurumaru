# 04 — 慣例與紅線

## 🔴 紅線一：前台視覺零變更

前台的 HTML 結構、class 名稱、資產載入順序，一律以舊 Razor 檔為準。

### 搬運方式

1. **資產原樣複製，不重新打包**

   | 來源 | 目的地 |
   |---|---|
   | `reference/old/Tsurumaru/Content/` | `public/content/` |
   | `reference/old/Tsurumaru/Scripts/vendor/` | `public/scripts/vendor/` |
   | `reference/old/Tsurumaru/Scripts/js/theme.min.js` | `public/scripts/js/theme.min.js` |

   不要把 `theme.css` 丟進 Vite／PostCSS 重新處理，不要 tree-shake vendor JS，不要換成 npm 版本 — 版本差異會造成視覺飄移。

2. **Razor 語法逐段對譯，DOM 不動**

   | Razor | Astro |
   |---|---|
   | `@ViewBag.Cars` | 從 `src/lib/db.ts` 取得的變數 |
   | `@foreach (var c in cars) { }` | `{cars.map((c) => (...))}` |
   | `@Url.Action("Cars", "Home")` | `/cars` |
   | `@Html.Raw(x)` | `<Fragment set:html={x} />` |
   | `~/Content/css/theme.css` | `/content/css/theme.css` |
   | `@RenderBody()` | `<slot />` |

3. **jQuery 保留。** 舊版載入 jQuery 2.2.4（CDN）。theme.min.js 與部分 vendor 依賴它，先照搬；確定無依賴後才可移除，且需完整回歸測試。

4. **不得新增前台 UI 套件。** 需要輪播用 tiny-slider、滑桿用 nouislider、燈箱用 lightgallery — 都已存在。

### 允許改動的範圍（僅此三類）

- `<head>` 的 SEO 標籤：`title`、`description`、Open Graph、canonical、結構化資料
- `img` 的 `src`（指向 R2）、`loading="lazy"`、`width`/`height`
- 表單的 `action`／`name` 對應新的 query 參數

其他任何 markup 變更都需要先開 ADR。

## 🔴 紅線二：不得攜帶舊憑證

`reference/old/` 內含實際可用的正式環境憑證與後門帳號。詳見 [08-security.md](08-security.md)。任何情況下都不得把這些值複製到新程式、設定檔、測試資料或文件裡。

## 後台：反其道而行

後台**不**沿用舊樣板（見 [ADR-0005](adr/0005-rebuild-admin-ui.md)）。原則：

- 語意化 HTML + 少量自訂 CSS，不引入 SmartAdmin、不引入 jQuery 外掛
- 表單優先用原生 `<form>` POST，避免不必要的前端狀態
- 排序改用原生 HTML5 drag-and-drop 或上下移動按鈕，不引入拖曳套件
- 保留舊後台的**操作流程與權限語意**，只換介面

## 合併汽車與機車的重複邏輯

舊版 [WebMsController.cs](../reference/old/Tsurumaru/Areas/backend/Controllers/WebMsController.cs)（1027 行）把汽車與機車寫成兩套幾乎逐行相同的程式，`HomeController` 的 `Cars`／`Bikes` 也是。**新版必須合併**：

```
src/pages/cars/index.astro   ┐
                             ├─→ 共用 lib/vehicles.ts，以 type 參數區分
src/pages/bikes/index.astro  ┘
```

差異只有三處，用參數處理即可：

| 差異 | 汽車 | 機車 |
|---|---|---|
| `type` | 1 | 2 |
| 篩選欄位 | 全部 | 無傳動／燃料／變速器 |
| 文案與路徑 | 「汽車」`/cars` | 「機車」`/bikes` |

後台同理：一組 `makes`／`models`／`vehicles`／`photos` 頁面，用路由參數帶 `type`。

## 程式碼慣例

### 資料存取

- 只有 `src/lib/` 可以直接使用 `env.DB` / `env.BUCKET`
- 一律用 D1 prepared statement 綁參數，**禁止字串拼接 SQL**
  ```ts
  // ✅
  await env.DB.prepare('SELECT * FROM vehicles WHERE type = ? AND price >= ?').bind(type, min).all();
  // ❌
  await env.DB.prepare(`SELECT * FROM vehicles WHERE type = ${type}`).all();
  ```
- 動態篩選用陣列組 `WHERE` 片段與參數，保持一一對應（見 `src/lib/filters.ts`）
- 多筆寫入用 `env.DB.batch()`（D1 沒有互動式交易）

### 命名

| 對象 | 慣例 | 範例 |
|---|---|---|
| 資料表／欄位 | snake_case | `vehicle_photos.sort` |
| TypeScript 變數／函式 | camelCase | `getVehiclesByType` |
| 型別／元件 | PascalCase | `VehicleCard.astro` |
| 檔案（`lib`／`api`） | kebab-case | `vehicle-filters.ts` |
| 常數 | SCREAMING_SNAKE | `EXTERIOR_COLORS` |

### 型別

- `npx wrangler types` 產生 binding 型別，不手寫 `interface Env`
- 資料列型別集中定義在 `src/lib/types.ts`，欄位名與 D1 一致（snake_case）
- 不用 `any`；D1 回傳用 `results as VehicleRow[]` 收斂

### 語言

- 所有使用者可見文字：繁體中文（台灣）
- 程式碼識別字、commit message：英文
- 註解：中英皆可，說明「為什麼」而非「做什麼」

## 相關文件

- 驗收標準 → [06-verification.md](06-verification.md)
- 舊檔案在哪 → [legacy-map.md](legacy-map.md)

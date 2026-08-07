# ADR-0005 — 後台介面重新設計

- **日期**：2026-08-06
- **狀態**：已採納

## 背景

舊後台使用 SmartAdmin 系樣板（`_Aside`、`_Ribbon`、`_Tiles`、`_TopRight` 等 partial），重度依賴 jQuery 與一整套 jQuery 外掛。與前台不同，後台的使用者只有店內少數幾位員工。

## 決策

後台**不**沿用舊樣板，介面重新設計。保留舊後台的**操作流程與權限語意**，只換介面實作。

## 理由

1. **前台凍結的理由在後台不成立。** 前台要凍結是因為要對外呈現一致的品牌視覺、且有 SEO 與大量訪客。後台是內部工具，沒有這些約束。
2. **搬 SmartAdmin 的成本高於重做。** 它會把 jQuery 與十數個外掛帶進新專案，而這些正是[紅線一](../04-conventions.md#-紅線一前台視覺零變更)以外我們唯一能擺脫的技術債。
3. **舊後台有大量重複。** [WebMsController.cs](../../reference/old/Tsurumaru/Areas/backend/Controllers/WebMsController.cs) 1027 行中約一半是汽車／機車的複製貼上。合併是重點目標，而合併必然要重寫頁面。
4. **可以順手修掉安全缺陷。** 例如刪除操作用 GET、缺少 CSRF、上傳沒有驗證 — 見 [08-security.md](../08-security.md)。

## 設計原則

- 語意化 HTML + Tailwind CSS。**不引入 UI 元件框架**（Bootstrap、shadcn、Ant Design 之類）—— 版面自己排，只借用 utility class
- 表單優先用原生 `<form>` POST，避免不必要的前端狀態
- 排序用原生 HTML5 drag-and-drop 或上下移動按鈕，不引入拖曳套件
- 後台選單寫在程式碼裡，不再從 `permissions` 表動態產生（舊版 `BaseController` 的作法讓權限表同時扮演選單與權限兩種角色，職責混淆）

## 必須保留的行為

介面可以變，這些不能變：

- 每頁 20 筆分頁
- 車廠 → 車型 → 車輛 → 相簿的階層關係與各自的排序功能
- 每個資源的「增／改／刪」三種權限可個別指派給管理員
- 上傳主圖與相簿多圖的流程

舊後台的 View 檔案作為**欄位與流程**的參考（例如 [AddCars.cshtml](../../reference/old/Tsurumaru/Areas/backend/Views/WebMs/AddCars.cshtml) 用來確認表單有哪些欄位、各選項的值），**不作為版面參考**。

## 補記：改用 Tailwind CSS（2026-08-07）

初版後台是手寫 CSS（`Admin.astro` 內一段 `<style>`）。業主看過實作後認為介面品質不足，要求重新設計並指定 Tailwind。

原本「不引入 UI 框架」的理由是**不要把 jQuery 生態帶進新專案**；Tailwind 只是 build-time 的 CSS utility，不帶 runtime、不帶 JavaScript、不帶元件語意，那個理由對它不成立。改用它換到的是：一套一致的間距與字級刻度、不用再自己維護 hover/focus/disabled 的每個狀態、以及新頁面不必再回頭改共用 `<style>`。

### 設計方向：臺帳

版面語彙取自中古車行的在庫表單 —— 細框線、無圓角、等寬字的小型大寫欄位標籤、數字一律等寬對齊。配色沿用前台 `theme.css` 的品牌色（`#1f1b2d` 墨、`#f5f4f8` 紙、`#fd5631` 朱），讓兩邊看起來是同一間公司；朱紅是唯一的重點色，只用在「目前所在的選單」、「主要動作」、「必填記號」三處。

簽名式元件是 **`.tm-field`（記入欄）**：標籤印在框線內的左上角，值填在下面；唯讀顯示與可編輯輸入共用同一個外框。定義見 `src/styles/admin.css`。

### 隔離（重要）

Tailwind 的 preflight 會重置 `*`、`img`、`table` 與表單元素。一旦被前台載到就直接違反[紅線一](../04-conventions.md#-紅線一前台視覺零變更)。

隔離只靠一件事：**`src/styles/admin.css` 只能被 `layouts/Admin.astro` 與 `pages/admin/login.astro` import**。前台頁面的模組圖碰不到它，Astro 就不會在前台輸出那支 stylesheet。

同時 `admin.css` 用 `@import 'tailwindcss' source(none)` 加明列 `@source`，避免自動偵測掃進 `reference/old/`。

新增後台頁面時請走 [06-verification.md#b2-tailwind-沒有洩漏到前台](../06-verification.md) 的檢查。

## 取捨

- 店員需要重新熟悉介面。考量到使用者只有少數幾位、且新介面更簡潔，成本可控。
- 前台與後台從此有兩套互不相干的樣式系統。這是刻意的 —— 前台凍結、後台自由，兩者的約束本來就不同。代價是必須守住上面那道隔離。
- Tailwind 的 utility 寫在 markup 裡會讓 `.astro` 檔變長。重複出現的元件（按鈕、記入欄、表格、分頁）收在 `admin.css` 的 `@layer components`，頁面只留版面用的 utility。

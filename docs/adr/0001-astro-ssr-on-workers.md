# ADR-0001 — 用 Astro SSR 部署於 Cloudflare Workers

- **日期**：2026-08-06
- **狀態**：已採納

## 背景

舊站是 ASP.NET MVC 5 + Razor，需改寫並部署到 Cloudflare。前置約束：[前台視覺必須零變更](0004-preserve-frontend-markup.md)，且車輛列表與詳情頁需要 SEO。

## 決策

採用 **Astro（`output: 'server'`）+ `@astrojs/cloudflare`**，部署為單一 Cloudflare Worker，同時服務前台、後台與 API。

## 理由

1. **移植成本最低。** Astro 元件的內容區塊就是 HTML。Razor 的 markup 可以整段貼進 `.astro`，只需替換 `@foreach`／`@ViewBag` 等少數語法，DOM 結構天然保持不變 — 這正是紅線一的要求。換成 Vue／React 會強制把每個標籤改寫成框架語法，樣式飄移的風險大得多。
2. **預設零 JS。** Astro 不會自動注入 runtime，頁面送出的就是伺服器渲染的 HTML，舊版的 vendor JS 照原樣運作，不必和框架的 hydration 機制打架。
3. **SSR 與預渲染可逐頁選擇。** 列表／詳情用 SSR，關於／地圖／隱私權用 `prerender`，不必為了 SEO 整站靜態化。
4. **官方支援路徑清晰。** Cloudflare 與 Astro 雙方都維護此組合，C3 有現成範本，binding 存取有官方文件。

## 取捨

- **放棄了 Vue／Nuxt 的元件生態。** 後台介面要重做（[ADR-0005](0005-rebuild-admin-ui.md)），少了現成 UI 套件會多寫一些 CSS。可接受 — 後台頁面型態單純（表格 + 表單），且避免引入套件反而符合「後台要輕」的目標。
- **相較 Hono 多了框架層。** 換來檔案式路由、資產管線、預渲染與型別整合，對這個規模的網站是划算的。

## 已知陷阱

`@astrojs/cloudflare` v13 起**移除了 `Astro.locals.runtime`**，binding 改為 `import { env } from 'cloudflare:workers'`。網路上多數教學仍是舊寫法。詳見 [02-architecture.md](../02-architecture.md#bindings-存取方式)。

## 曾考慮

| 方案 | 未採用的原因 |
|---|---|
| Nuxt 3 (Vue) SSR | Razor markup 需逐一改寫為 Vue template，違反紅線一的風險最高 |
| Hono + JSX | 最輕最快，但檔案式路由、資產管線、預渲染都要自建 |
| 純靜態 + 用戶端篩選 | 車輛資料會變動，後台需即時反映；純靜態需要每次改動都重建 |

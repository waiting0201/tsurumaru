# ADR-0004 — 前台 markup 與樣式原樣沿用

- **日期**：2026-08-06
- **狀態**：已採納
- **強制等級**：🔴 紅線

## 背景

舊站前台使用一套商業 Bootstrap 樣板：`Content/css/theme.css` 加上 tiny-slider、nouislider、lightgallery、simplebar、jarallax、smooth-scroll 等 vendor 套件，由 `theme.min.js` 統一初始化，另載 jQuery 2.2.4。

專案負責人明確要求：**前台樣式都不要更動。**

## 決策

前台的 HTML 結構、class 名稱、CSS 與 vendor 資產**原封不動**移植。

- `Content/` 與 `Scripts/vendor/` 直接複製到 `public/`，不經 Vite／PostCSS 重新處理，不 tree-shake，不換成 npm 版本
- Razor markup 逐段對譯為 Astro，只替換樣板語法，DOM 不動
- jQuery 保留
- 不新增任何前台 UI 相依套件

允許改動的只有三類：`<head>` 的 SEO 標籤、`img` 的 `src`／`loading`／尺寸屬性、表單的 `action`／`name`。其餘變更需另開 ADR。

## 理由

1. **這是需求，不是技術偏好。** 使用者明確指定。
2. **樣板的 CSS 與 JS 高度耦合。** `theme.min.js` 依 class 名稱尋找元素並初始化輪播、滑桿、燈箱。改動 class 或巢狀結構會讓元件靜默失效 — 頁面看起來還在，功能卻壞了，而且不會有任何錯誤訊息。
3. **重新打包會造成飄移。** 把 `theme.css` 丟進 PostCSS／autoprefixer，或改用 npm 上的 vendor 套件（版本必定不同），都會產生細微但真實的視覺差異。
4. **讓「對不對」變成可驗證的。** 樣式若可自由改動，正確性就只能靠主觀判斷。凍結 markup 後，驗證變成機械式的 class 集合比對與資產清單比對 — 見 [06-verification.md](../06-verification.md#前台樣式零差異)。

這一點是整個 harness 能運作的基礎：**它把一個模糊的美學問題轉成了一個可自動檢查的約束。**

## 取捨

- **背負了舊技術債。** jQuery、未最佳化的 vendor bundle、非語意化的 markup 都會留下。這是刻意的，屬於日後獨立的改善工作。
- **無法順手做無障礙或效能改善。** 同上，需另開 ADR 逐項處理。
- **Astro 的部分優勢用不上**（scoped style、元件化 CSS）。可接受 — 用 Astro 的主因本來就是 markup 移植成本最低。

## 不適用範圍

**後台不受此約束**，見 [ADR-0005](0005-rebuild-admin-ui.md)。

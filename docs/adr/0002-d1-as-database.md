# ADR-0002 — 用 Cloudflare D1 取代 Azure SQL

- **日期**：2026-08-06
- **狀態**：已採納

## 背景

舊站資料在 Azure SQL（`weypro.database.windows.net` / `tsurumaru`），共 7 張表，資料量是單一車行的庫存規模 — 車輛數量級為數百至數千，相片數量級為數千。查詢型態單純：依 `type` 過濾、幾個等值／範圍條件、`ORDER BY sort`、`LIMIT/OFFSET` 分頁。沒有報表、沒有分析查詢、沒有交易複雜度。

## 決策

改用 **Cloudflare D1**（SQLite），binding 名稱 `DB`。

## 理由

1. **與 Worker 同源。** 不需要連線池、不需要 Hyperdrive、沒有跨網路的往返延遲。Workers 無法直接連 MSSQL，維持 Azure SQL 就得自建 HTTP proxy — 憑空多一個單點與一段延遲。
2. **規模綽綽有餘。** 免費方案上限為單庫 500 MB、每日 500 萬列讀取、10 萬列寫入。以本站的資料量與流量，讀取用量會在上限的極小比例。
3. **查詢型態完全吻合。** 用得到的 SQL 功能 SQLite 全都有。沒有用到 T-SQL 專屬語法、預存程序或視窗函式。
4. **維運成本降為零。** 沒有另一個雲的帳單、防火牆規則與備份設定要顧。D1 內建 Time Travel（免費方案 7 天）。

## 取捨

- **一次性搬遷成本。** 型別需轉換（`uniqueidentifier` → `TEXT`、`ntext` → `TEXT`、`bit` → `INTEGER`、`datetime` → ISO-8601 字串），詳見 [07-migration.md](../07-migration.md)。這是有限且單次的工作。
- **沒有互動式交易。** D1 提供 `batch()`（單次原子執行多句），不支援跨請求的交易。本站的寫入都是單一實體的 CRUD，不需要。
- **未來若要複雜分析查詢**會不夠用。屆時的選項是加 Analytics Engine 或改用 Postgres + Hyperdrive，屬於獨立決策。

## 曾考慮

| 方案 | 未採用的原因 |
|---|---|
| Postgres + Hyperdrive | 需自備並維運 Postgres 執行個體；本站沒有任何需要 Postgres 的功能 |
| 沿用 Azure SQL | Workers 無法直連 MSSQL；需自建 proxy，增加延遲、成本與單點故障 |
| Durable Objects 儲存 | 適合強一致的單實體狀態，不適合需要跨列查詢與篩選的型錄資料 |

# ADR-0006 — 用 GitHub Actions 部署，不用 Workers Builds

- **日期**：2026-08-07
- **狀態**：已採納

## 背景

程式碼放在 GitHub（`waiting0201/tsurumaru`，**public**），要部署到 Cloudflare Workers。Cloudflare 提供兩條路：

1. **Workers Builds** — 在 Cloudflare Dashboard 直接連接 GitHub repo，由 Cloudflare 端建置並部署，不需要寫 workflow。
2. **GitHub Actions** — 自己寫 workflow，用 `cloudflare/wrangler-action` 部署。

## 決策

採用 **GitHub Actions**，workflow 定義在 [.github/workflows/deploy.yml](../../.github/workflows/deploy.yml)。

觸發策略：**push 到 `master` 即部署**，無 PR gate、無預覽環境。

## 理由

1. **專案指定。** 需求就是「透過 GitHub 做 CI/CD」。
2. **需要部署以外的步驟。** 這個管線在部署前要跑 D1 migration，以及一道機密防護關卡。Workers Builds 的建置指令雖可自訂，但把多步驟流程與條件邏輯放進 workflow 檔比放進 Dashboard 設定更好版控、更好審閱。
3. **repo 是 public，防護必須在管線裡。** 舊系統的明碼憑證在 `reference/`（已排除版控）。`guard` job 讓「機密不得進版控」成為部署的硬性前置條件，而不只是文件裡的一句叮嚀。
4. **設定即程式碼。** 管線的每次變更都留在 git 歷史裡，可以審閱、可以回滾。Dashboard 設定做不到。

## 取捨

- **多一層要維護的東西。** action 版本、Node 版本都需要偶爾更新。以這個規模來說成本很低。
- **放棄 Workers Builds 的零設定。** 換來上述的可控性，值得。
- **push 即部署代表沒有人工把關。** 唯一防護是建置失敗會擋下部署。這是刻意的取捨 —— 現階段單人維護、尚未上線，摩擦力比防護更礙事。上線後應加上 PR 檢查與部署核准，清單見 [09-cicd.md](../09-cicd.md#日後可加的關卡)。

## 版本註記

- `cloudflare/wrangler-action@v4` — Cloudflare 官方文件的範例仍寫 `@v3`。v4 唯一的破壞性變更是預設安裝 Wrangler v4，正好符合本專案的版本基準（wrangler 4.x）。
- `actions/checkout@v7`、`actions/setup-node@v7`、Node 24。

## 曾考慮

| 方案 | 未採用的原因 |
|---|---|
| Workers Builds（Cloudflare 原生 Git 整合） | 多步驟管線與防護關卡放在 Dashboard 不易版控與審閱 |
| 只用 `wrangler deploy` 手動部署 | 沒有可重複性；migration 容易漏套 |
| 加上 PR gate 與人工核准 | 現階段單人維護、尚未上線，摩擦大於效益。上線後再加 |

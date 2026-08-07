# 07 — 資料搬遷

一次性流程，三條獨立的搬遷線：**資料庫**、**圖片**、**網址**。三者都完成才算可切換。

## 現況與缺口

| 項目 | 狀態 |
|---|---|
| 來源資料庫 | ✅ 本機 Docker 容器 `sqlserver`，資料庫 `tsurumaru`。**這就是正式資料**（業主 2026-08-07 確認） |
| 來源圖片 | ✅ [`reference/old/Tsurumaru/Upload/`](../reference/old/Tsurumaru/Upload/)，2 個檔案共 3.2 MB。與資料庫紀錄完全一致，零孤兒 |
| Azure SQL | ⚠️ 舊 config 中的 `weypro.database.windows.net` **不是搬遷來源**，但憑證仍**必須輪替**（見 [08](08-security.md)） |

### 來源已確認

本機這份資料是自洽的 —— 資料庫 2 台車，檔案系統就正好 2 張主圖，兩邊都沒有多出東西。車輛數量少是實際狀況，不是資料缺漏；車廠 73 筆與車型 1,317 筆的參考資料是完整的。

**搬遷已執行完成**（2026-08-07）：

| 目標 | 狀態 |
|---|---|
| 本地 D1 + R2 | ✅ 已完成並通過對帳 |
| 正式 D1 | ✅ schema 已套用、資料已匯入，筆數與完整性檢查全通過 |
| 正式 R2 | ✅ 2 個物件已上傳，檔案大小與來源相符 |

正式環境的筆數：車廠 73／車型 1,317／車輛 2／相片 0／管理員 1／權限節點 10／權限指派 7。

## 來源資料庫（本機 Docker）

```bash
# 啟動（Docker Desktop 未執行時）
open -a Docker

# 容器
docker ps --filter name=sqlserver          # mcr.microsoft.com/mssql/server:2022-latest, port 1433

# SA 密碼存在容器環境變數中，不要寫進任何檔案
PW=$(docker inspect sqlserver --format '{{range .Config.Env}}{{println .}}{{end}}' \
     | grep '^MSSQL_SA_PASSWORD=' | cut -d= -f2-)

# 查詢
docker exec sqlserver /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P "$PW" -C -h -1 -W -s'|' \
  -Q "SET NOCOUNT ON; USE tsurumaru; SELECT COUNT(*) FROM Vehicles;"
```

`-C` 為信任自簽憑證，`mssql-tools18` 必要。實際筆數與資料觀察見 [03-data-model.md](03-data-model.md#實際資料快照)。

> 這個容器同時存放多個專案的資料庫（`tfoodies`、`Ichiran`、`Ceremony` 等）。查詢時務必先 `USE tsurumaru`，避免動到別的專案。**本專案的搬遷腳本一律唯讀操作來源資料庫。**

### 匯出

```bash
# 單表匯出為 CSV（在容器內產生後複製出來）
docker exec sqlserver /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P "$PW" -C -s',' -W -h -1 \
  -Q "SET NOCOUNT ON; USE tsurumaru; SELECT * FROM VehicleMakes;" \
  > scripts/src/VehicleMakes.csv
```

⚠️ `sqlcmd` 的 CSV 輸出不會處理欄位內的逗號、換行與引號 — `Summary`／`Description` 是長文本，**必然會壞**。這兩張表請改用 `bcp` 搭配特殊分隔符，或寫一支 Node 腳本經 `mssql` 套件直接讀取後輸出 JSON。參考資料表（Makes／Models）欄位單純，用 sqlcmd 即可。

## 資料庫搬遷

### 步驟

1. **匯出來源** — 從 SQL Server 匯出七張表為 CSV 或 JSON（UTF-8，含 BOM 會出問題，請用無 BOM）。
2. **轉檔** — 寫 `scripts/transform.mjs`，套用 [03-data-model.md](03-data-model.md#型別對照sql-server--d1sqlite) 的型別與命名對照，產出 `scripts/out/seed.sql`。
3. **建 schema** — `migrations/0001_initial_schema.sql`。
4. **本地驗證** — 先 `--local` 套用與匯入，跑完 [06-verification.md](06-verification.md#資料正確性) 的全部查詢。
5. **正式匯入** — 確認無誤後才 `--remote`。

```bash
npx wrangler d1 migrations apply tsurumaru --local
npx wrangler d1 execute tsurumaru --local --file=./scripts/out/seed.sql
# 驗證通過後
npx wrangler d1 migrations apply tsurumaru --remote
npx wrangler d1 execute tsurumaru --remote --file=./scripts/out/seed.sql
```

### 轉檔規則（務必逐條套用）

| 規則 | 說明 |
|---|---|
| GUID | 一律轉**小寫含連字號**字串。SQL Server 匯出常為大寫，不統一會造成 join 失敗與圖片路徑對不上 |
| `datetime` | 轉 ISO-8601 UTC 字串。注意來源可能是當地時間（UTC+8），需確認後統一 |
| `bit` | `true`/`1` → `1`，其餘 → `0` |
| `ntext` | 原樣保留（含 HTML）。匯入時要正確跳脫單引號 |
| NULL | 保持 NULL，**不要轉成空字串** — 篩選邏輯依賴 NULL 判斷 |
| `Password` | ⚠️ 舊版是明碼。**不可直接搬**。作法見下方 |
| 空白 | `Code`／`Title` 等欄位 trim 前後空白 |

### 管理員密碼

舊資料庫的 `Admins.Password` 是明碼，且欄位只有 20 字元。**不搬密碼**：

1. `admins` 表只搬 `id`、`name`、`username`、`email`
2. `password_hash` 一律填入不可能匹配的佔位值
3. 上線後由每位管理員走一次重設流程

這同時解決了「明碼密碼」與「舊密碼可能已在別處外洩」兩個問題。

### 匯入注意

- D1 匯入**不是原子性的**。失敗要能重跑，建議 `INSERT OR REPLACE` 或匯入前先 `DELETE`
- 先關 foreign key 檢查再匯入，或依 `vehicle_makes` → `vehicle_models` → `vehicles` → `vehicle_photos` 的順序
- 單次 batch 上限：免費方案 1,000 句、付費 10,000 句。大量資料請切塊
- D1 免費方案每日寫入 10 萬列 — 一次搬完通常沒問題，但重跑多次可能觸頂

## 圖片搬遷

### 來源

圖片在 repo 內：[`reference/old/Tsurumaru/Upload/`](../reference/old/Tsurumaru/Upload/)

```
Upload/
├── Cars/29576f8f-c38f-4c77-99b8-596e330519c0/20220401033916.jpeg   2.9 MB
└── Motors/b443ab30-5568-4d37-8c97-abf8f05bba6e/20211101192026.gif  0.3 MB
```

與資料庫的兩筆 `Vehicles.Photo` 完全對應，雙向都沒有孤兒。`VehiclePhotos`（相簿）為 0 筆，所以每台車只有主圖、沒有相簿檔案。

> **2.9 MB 的主圖**說明了為什麼[上傳端必須設大小上限](adr/0003-r2-object-storage.md#為什麼不做即時變體明確選擇) — 我們不做即時變體轉換，上傳什麼就送什麼給訪客。

### 路徑對應

| 舊（Web 主機檔案系統） | 新（R2 物件 key） |
|---|---|
| `Upload/Cars/{VehicleID}/{filename}` | `vehicles/{vehicle_id}/{filename}` |
| `Upload/Motors/{VehicleID}/{filename}` | `vehicles/{vehicle_id}/{filename}` |

**汽車與機車合併到同一個前綴** — `vehicle_id` 是全域唯一的 UUID，不需要用目錄區分類型，也讓上傳邏輯不必分岔（呼應 [04](04-conventions.md#合併汽車與機車的重複邏輯)）。

資料庫只存**檔名**（`vehicles.photo`、`vehicle_photos.photo`），維持舊版設計。URL 在應用層組出：

```ts
// src/lib/media.ts
const MEDIA_BASE = 'https://img.<正式網域>';
export const photoUrl = (vehicleId: string, filename: string) =>
  `${MEDIA_BASE}/vehicles/${vehicleId}/${encodeURIComponent(filename)}`;
```

> 🔺 **大小寫在來源就已經不一致，這是實測結果不是假設：**
>
> | 來源 | 形式 | 實例 |
> |---|---|---|
> | 資料庫 `Vehicles.VehicleID` | **大寫** | `29576F8F-C38F-4C77-99B8-596E330519C0` |
> | 檔案系統目錄名 | **小寫** | `29576f8f-c38f-4c77-99b8-596e330519c0` |
>
> 舊系統在 Windows 上沒事，因為 NTFS 不分大小寫。**R2 的物件 key 分大小寫，D1 的字串比較也分**。兩邊都必須在搬遷時正規化為**小寫**，否則圖片會全部 404 而資料看起來完全正常 — 這是最難察覺的那種壞法。

### 上傳

```bash
# 逐檔
npx wrangler r2 object put tsurumaru-media/vehicles/<id>/<file>.jpg --file=<local>

# 大量：建議寫 scripts/upload-media.mjs 走 S3 相容 API 並行上傳，
# 同時對照資料庫紀錄，輸出「有紀錄無檔案」與「有檔案無紀錄」兩份清單
```

以目前這份開發資料來說，兩份清單都應該是空的（已實測，2/2 完全對應）。若改以正式資料為來源，**幾乎一定會有孤兒** — 舊系統刪除車輛時沒有一併清理檔案。孤兒檔案不要上傳；孤兒紀錄要在資料層修掉。兩份清單都要保留供對帳。

上傳時記得把目錄名與 `Photo` 欄位值一併轉小寫（見上方大小寫警告）。

### 公開讀取

```bash
npx wrangler r2 bucket domain add tsurumaru-media --domain=img.<正式網域>
```

Bucket 僅開放**讀取**。寫入一律經後台 endpoint 用 binding 完成，不對外發放 R2 金鑰。

## 網址對應與 SEO

舊網址已被搜尋引擎索引，全部需要 **301** 導轉。

### 前台

| 舊 | 新 |
|---|---|
| `/` | `/` |
| `/Home/Index` | `/` |
| `/Home/Cars` | `/cars` |
| `/Home/CarDetail?VehicleID={guid}` | `/cars/{guid}` |
| `/Home/Bikes` | `/bikes` |
| `/Home/BikeDetail?VehicleID={guid}` | `/bikes/{guid}` |
| `/Home/About` | `/about` |
| `/Home/Map` | `/map` |
| `/Home/Privacy` | `/privacy` |
| `POST /AjaxF/GetVehicleModelsByVehicleMakeID` | `GET /api/models?makeId={id}` |

> **保留 GUID 當作路由 id**，不要在搬遷時改成 slug。這讓舊詳情頁的導轉是純粹的一對一映射，不需要額外對照表。要做 SEO slug 是之後的獨立工作。

⚠️ 舊詳情頁的 `VehicleID` 在 query string，新版在路徑上，**Workers 的靜態 redirect 規則無法讀 query string**。這兩條要在 Worker 內處理：

```ts
// src/middleware.ts 之類的位置
if (url.pathname === '/Home/CarDetail') {
  const id = url.searchParams.get('VehicleID')?.toLowerCase();
  if (id) return Response.redirect(new URL(`/cars/${id}`, url), 301);
}
```

注意舊連結中的 GUID 可能是**大寫**，導轉時要轉小寫。

### 後台

舊 `/backend/*` 全部導向 `/admin/login`。後台頁面不需要保留深層網址，且應設 `noindex`。

### 篩選參數

前台篩選的 query 參數名稱（`K`、`VehicleModelID`、`Year`、`PriceFrom`、`PriceTo`、`Driveline`、`Fuel`、`Transmission`、`Exterior`）**沿用舊名**，讓既有的分享連結繼續有效，也讓舊 markup 的表單 `name` 不用改（呼應[紅線一](04-conventions.md#-紅線一前台視覺零變更)）。

### 其他

- `sitemap.xml` 涵蓋所有車輛詳情頁
- `robots.txt` 禁止 `/admin/`
- 詳情頁加 `Vehicle`／`Product` 結構化資料（新增能力，不影響版面）

## 切換順序

1. 資料匯入正式 D1 並通過對帳
2. 圖片上傳 R2 並通過可取得性檢查
3. 新站部署在暫時網域，走完 [06-verification.md](06-verification.md) 全部項目
4. 導轉規則就位
5. DNS 切換
6. 觀察 `wrangler tail` 與 404 狀況至少 48 小時
7. 舊主機**保留至少一個月**再退役

## 相關文件

- 型別與欄位對照 → [03-data-model.md](03-data-model.md)
- 驗收查詢 → [06-verification.md](06-verification.md)
- 憑證輪替 → [08-security.md](08-security.md)

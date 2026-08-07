# 06 — 驗證迴圈

**判準：「我覺得看起來對」不算通過。** 每一類改動都有對應的、可重複執行的檢查。這是 harness 的閉環 — 沒有它，前面所有文件都只是善意的建議。

## 每次改動都要跑

```bash
npm run build     # 含 astro check：型別 + Astro 診斷
```

失敗即為未完成，不要以「只是型別警告」帶過。

## 前台樣式零差異

這是本專案最重要、也最容易在不知不覺間違反的約束（[紅線一](04-conventions.md#-紅線一前台視覺零變更)）。三道檢查，由粗到細：

### A. class 名稱集合比對（必做，可自動化）

移植完一個頁面後，比較舊 Razor 與新 Astro 產出的 class 名稱集合。集合必須**完全相同**。

```bash
# 舊：從 Razor 抽出所有 class（Razor 語法不影響 class 字面值）
grep -ohE 'class="[^"]*"' reference/old/Tsurumaru/Views/Home/Cars.cshtml \
  | sed 's/class="//;s/"//' | tr ' ' '\n' | grep -v '^$' | sort -u > /tmp/old-classes.txt

# 新：抓實際渲染結果
curl -s 'http://localhost:4321/cars' \
  | grep -ohE 'class="[^"]*"' | sed 's/class="//;s/"//' | tr ' ' '\n' | grep -v '^$' | sort -u > /tmp/new-classes.txt

diff /tmp/old-classes.txt /tmp/new-classes.txt
```

有差異就要逐一解釋。多出來的 class 幾乎都是移植時的手滑。

**兩個會造成假警報的陷阱**（實際踩過）：

1. **Razor 註解 `@*...*@` 內的 class 不會渲染。** 例如 `Cars.cshtml` 有一段被註解掉的排序 UI。比對前必須先剝除：
   ```bash
   perl -0777 -ne 's/\@\*.*?\*\@//gs; print' 舊檔.cshtml > /tmp/stripped.cshtml
   ```
2. **條件區塊需要有資料才會渲染。** 車輛詳情頁的相簿包在 `@if (Model.VehiclePhotos.Any())` 內，資料庫沒有相簿資料時 `tns-thumbnail` 等 class 自然不會出現。比對前先確認測試資料涵蓋所有分支，或插入一筆暫時資料驗證後再刪除。

### B. 資產清單比對（必做）

```bash
# 舊版載入的 CSS/JS
grep -ohE '(src|href)="[^"]+"' \
  reference/old/Tsurumaru/Views/Shared/_Styles.cshtml \
  reference/old/Tsurumaru/Views/Shared/_Scripts.cshtml | sort

# 新版：檢查渲染後的 <link> 與 <script>
curl -s http://localhost:4321/ | grep -E '<(link|script)'
```

**順序也要一致** — vendor JS 的載入順序會影響初始化行為。

### B2. Tailwind 沒有洩漏到前台（後台動到樣式時必做）

後台用 Tailwind（[ADR-0005](adr/0005-rebuild-admin-ui.md)），它的 preflight 會重置 `*`、`img`、`table`、表單元素 —— 一旦被前台頁面載到，`theme.css` 立刻走樣。隔離靠的是「只有 `layouts/Admin.astro` 與 `pages/admin/login.astro` import `src/styles/admin.css`」這一件事，很容易在新增後台頁面時破功。

```bash
# 1. 只有 layouts/Admin.astro 與 pages/admin/login.astro 可以出現在結果裡
grep -rn "import .*styles/admin.css" src/

# 2. 前台實際渲染結果不得出現任何 Tailwind 參照（每個都要是 0）
for p in / /cars /bikes /about /map /privacy; do
  echo "$p → $(curl -s "http://localhost:4321$p" | grep -c 'styles/admin\|tailwind')"
done

# 3. 建置後：前台預渲染頁面不得連到 admin 的 CSS bundle
npm run build
grep -c "_astro/admin" dist/client/{about,map,privacy}/index.html
```

順帶檢查 `src/styles/admin.css` 的 `@source` 清單還是只指向後台。少了 `source(none)` 或多列了路徑，Tailwind 會把 `reference/old/` 的舊 class 名當成 utility 產出來 — 徵兆是 bundle 明顯變大：

```bash
ls -la dist/client/_astro/admin.*.css          # 約 32 KB；破百 KB 就是掃到不該掃的地方
grep -c "car-finder\|jarallax" dist/client/_astro/admin.*.css   # 必須是 0
```

### C. 視覺比對（有舊站可比時必做）

若舊站仍在線上，在相同視窗寬度（至少 375 / 768 / 1440）逐頁截圖比對：首頁、汽車列表（含篩選展開）、汽車詳情（含相簿燈箱）、機車三頁、關於／地圖／隱私權。

重點看：輪播是否啟動、價格滑桿是否可拖曳、燈箱是否開啟、行動版選單是否正常。這些都是 vendor JS 有沒有正確初始化的指標。

## 資料正確性

### 搬遷後的筆數對帳

```bash
npx wrangler d1 execute tsurumaru --remote --command="
  SELECT 'vehicles' t, COUNT(*) n FROM vehicles
  UNION ALL SELECT 'vehicle_photos', COUNT(*) FROM vehicle_photos
  UNION ALL SELECT 'vehicle_makes',  COUNT(*) FROM vehicle_makes
  UNION ALL SELECT 'vehicle_models', COUNT(*) FROM vehicle_models
  UNION ALL SELECT 'admins',         COUNT(*) FROM admins;"
```

與來源資料庫（本機 Docker，[連線方式](07-migration.md#來源資料庫本機-docker)）逐項比對：

```bash
PW=$(docker inspect sqlserver --format '{{range .Config.Env}}{{println .}}{{end}}' \
     | grep '^MSSQL_SA_PASSWORD=' | cut -d= -f2-)
docker exec sqlserver /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$PW" -C -h -1 -W -s'|' -Q "
SET NOCOUNT ON; USE tsurumaru;
SELECT t.name + '|' + CAST(SUM(p.rows) AS varchar)
FROM sys.tables t JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0,1)
GROUP BY t.name ORDER BY t.name;"
```

每個數字都要相符。差一筆就是漏了一筆。

> 撰寫本文時的來源筆數為 Makes 73、Models 1,317、Vehicles 2、Photos 0、Admins 1、Lims 9、AdminLims 7（[快照](03-data-model.md#實際資料快照)）。若實際搬遷時以 Azure SQL 為來源，數字會不同 — 以搬遷當下的來源查詢為準，不要拿這裡的數字當標準。

### 參照完整性

```sql
-- 應全部回傳 0
SELECT COUNT(*) FROM vehicles v
  LEFT JOIN vehicle_models m ON v.vehicle_model_id = m.id WHERE m.id IS NULL;
SELECT COUNT(*) FROM vehicle_photos p
  LEFT JOIN vehicles v ON p.vehicle_id = v.id WHERE v.id IS NULL;
SELECT COUNT(*) FROM vehicle_models m
  LEFT JOIN vehicle_makes k ON m.vehicle_make_id = k.id WHERE k.id IS NULL;
```

### 列舉值域

```sql
-- 應全部回傳 0；有值代表搬遷或表單驗證有問題
SELECT COUNT(*) FROM vehicles WHERE type NOT IN (1,2);
SELECT COUNT(*) FROM vehicles WHERE fuel IS NOT NULL AND fuel NOT IN (1,2,3,4);
SELECT COUNT(*) FROM vehicles WHERE driveline IS NOT NULL AND driveline NOT IN ('1','2','3');
SELECT COUNT(*) FROM vehicles WHERE transmission IS NOT NULL AND transmission NOT IN ('1','2','3','4');
```

### 圖片可取得性

每台車的主圖與相簿圖都要能實際取得（非 404）：

```sql
SELECT id, photo FROM vehicles;
SELECT vehicle_id, photo FROM vehicle_photos;
```

用結果組出 URL 批次檢查 HTTP 狀態。**這一步不能只抽樣** — 舊系統的檔案系統圖片很可能有孤兒紀錄。

## 功能對等

以 [01-context.md](01-context.md#功能盤點改寫的驗收基準) 的功能表為清單，逐項實測。特別容易漏的：

- [ ] 首頁汽車、機車各 6 台，順序依 `sort`
- [ ] 列表每頁 8 筆，分頁連結保留所有篩選條件
- [ ] 同欄位多選為 OR、跨欄位為 AND
- [ ] 機車列表**沒有**傳動／燃料／變速器篩選
- [ ] 關鍵字只比對 `vehicle_type`
- [ ] 車廠下拉改變時，車型下拉連動更新
- [ ] 年份區間**連續無縫**（[已知舊版缺陷的修正](03-data-model.md#年份篩選區間)）— 測每個邊界年份都落在某一區間
- [ ] 後台每頁 20 筆
- [ ] 排序調整後前台順序同步改變

## 安全驗收

上線前必過，逐項見 [08-security.md](08-security.md#上線前檢查清單)：

- [ ] 舊憑證未外洩到版控範圍 — 見下方[憑證未外洩](#憑證未外洩)
- [ ] 未登入直接存取 `/admin/vehicles` 等頁面會被導向登入頁
- [ ] 無權限的管理員執行新增／修改／刪除會被拒絕（不是只有藏起按鈕）
- [ ] 密碼以雜湊儲存，資料庫內查不到明碼
- [ ] session cookie 具 `HttpOnly`、`Secure`、`SameSite`

### 憑證未外洩

`reference/` 整個目錄已排除在版控之外（見 [.gitignore](../.gitignore)），舊憑證因此不會進入 git 歷史。但**新寫的程式與文件仍可能把它們抄進去** — 這是實際發生過的：本文件與 [08-security.md](08-security.md) 早期版本就把舊密碼寫在檢查指令裡，反而讓排除 `reference/` 失去意義。

因此檢查用的憑證字串**一律從未進版控的舊碼動態取得，絕不寫死在文件裡**：

```bash
# 步驟 1：列出舊碼中的憑證（連線字串與硬編碼帳密）
#         ⚠️ 這會把祕密印在終端機上。不要重導到檔案、不要貼進 issue 或 PR。
grep -rniE 'password=|user id=|data source=' reference/old --include='*.config'
grep -n 'username ==' reference/old/Tsurumaru/Areas/backend/Controllers/MainController.cs

# 步驟 2：把上一步看到的每個值，逐一確認版控範圍內查不到
git grep -niF '<步驟 1 看到的值>' -- . ':!reference'
```

**每個值都必須零結果。** 若 `reference/` 已不在工作副本中（新複製的環境不會有），步驟 1 無法執行 — 此時改用既有備份，或直接跳過並依賴憑證已輪替的事實。

- [ ] 每個舊憑證值在 `git grep` 中皆零結果
- [ ] `git status --porcelain -uall` 確認 `reference/` 下沒有任何檔案待提交

## 網址與 SEO

- [ ] 每個舊網址都 301 導到對應新網址（[對照表](07-migration.md#網址對應與-seo)）
- [ ] 詳情頁有正確的 `title`、`description`、canonical
- [ ] `sitemap.xml` 涵蓋所有車輛頁

## 相關文件

- 紅線定義 → [04-conventions.md](04-conventions.md)
- 指令細節 → [05-workflows.md](05-workflows.md)

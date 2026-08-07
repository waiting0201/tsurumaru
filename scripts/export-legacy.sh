#!/usr/bin/env bash
# 從本機 Docker 的 SQL Server 把舊資料匯出成 JSON。
#
# 用 SQL Server 內建的 FOR JSON 產生 JSON，避免 sqlcmd 的 CSV 輸出
# 在 Summary / Description 這類長文本（含逗號、換行、引號）上必然損毀。
#
# 來源說明見 docs/07-migration.md#來源資料庫本機-docker
# ⚠️ 一律唯讀存取。該容器同時放著其他專案的資料庫。
set -euo pipefail

CONTAINER=sqlserver
DB=tsurumaru
OUT="$(dirname "$0")/src"
mkdir -p "$OUT"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "❌ 容器 $CONTAINER 未執行。請先啟動 Docker Desktop（open -a Docker）" >&2
  exit 1
fi

PW=$(docker inspect "$CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' \
     | grep '^MSSQL_SA_PASSWORD=' | cut -d= -f2-)

dump() {   # dump <輸出檔名> <SELECT 語句>
  local name=$1 sql=$2
  # -y 0 = 不截斷長文本（Summary/Description 是 ntext）。
  # -y 0 與 -h 互斥，所以標頭要自己濾掉。
  # 另外 FOR JSON 的輸出會被 sqlcmd 拆成多列，必須去掉換行接回單一 JSON。
  docker exec "$CONTAINER" /opt/mssql-tools18/bin/sqlcmd \
    -S localhost -U sa -P "$PW" -C -y 0 \
    -Q "SET NOCOUNT ON; USE $DB; $sql FOR JSON PATH;" \
    | tr -d '\r' \
    | sed -e '/^Changed database context/d' \
          -e '/^JSON_/d' \
          -e '/^-\{3,\}/d' \
          -e '/rows affected/d' \
    | tr -d '\n' > "$OUT/$name.json"
  local n; n=$(node -e "const d=require('fs').readFileSync('$OUT/$name.json','utf8').trim();console.log(d?JSON.parse(d).length:0)")
  printf "  %-18s %5s 筆\n" "$name" "$n"
}

echo "匯出中…"
dump vehicle_makes  "SELECT VehicleMakeID, Type, Code, Title, Sort FROM VehicleMakes"
dump vehicle_models "SELECT VehicleModelID, VehicleMakeID, Code, Title, Sort FROM VehicleModels"
dump vehicles       "SELECT VehicleID, VehicleModelID, Type, Year, Fuel, Mileage, VehicleType, Driveline, Exterior, Interior, Engine, Transmission, Cc, Location, VIN, Summary, Description, Photo, Price, Createdate, Views, Sort FROM Vehicles"
dump vehicle_photos "SELECT VehiclePhotoID, VehicleID, Photo, Title, Sort FROM VehiclePhotos"
dump admins         "SELECT AdminID, Name, Username, Email FROM Admins"
dump permissions    "SELECT LimID, [Key], Value, Icon, Sort, ParentID FROM Lims"
dump admin_perms    "SELECT AdminLimID, AdminID, LimID, IsAdd, IsUpdate, IsDelete FROM AdminLims"

echo "✅ 已輸出至 $OUT/"
echo "⚠️ 注意：admins 刻意不匯出 Password 欄位（舊版明碼，不搬遷）"

-- 初始 schema。欄位語意、型別對照與列舉值見 docs/03-data-model.md
--
-- SQL Server → D1 型別對照：
--   uniqueidentifier → TEXT（UUID 一律小寫含連字號）
--   int IDENTITY     → INTEGER PRIMARY KEY AUTOINCREMENT
--   nvarchar / ntext → TEXT
--   bit              → INTEGER（0/1）
--   datetime         → TEXT（ISO-8601 UTC）

-- ── 車廠 ────────────────────────────────────────────────
CREATE TABLE vehicle_makes (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  type   INTEGER NOT NULL,              -- 1=汽車廠 2=機車廠
  code   TEXT    NOT NULL,
  title  TEXT    NOT NULL,
  sort   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_makes_type_sort ON vehicle_makes(type, sort);

-- ── 車型 ────────────────────────────────────────────────
-- 沒有自己的 type 欄位；是汽車還是機車要看 vehicle_makes.type
CREATE TABLE vehicle_models (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_make_id  INTEGER NOT NULL REFERENCES vehicle_makes(id),
  code             TEXT    NOT NULL,
  title            TEXT    NOT NULL,
  sort             INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_models_make_sort ON vehicle_models(vehicle_make_id, sort);

-- ── 車輛 ────────────────────────────────────────────────
CREATE TABLE vehicles (
  id                TEXT    PRIMARY KEY,           -- UUID，小寫
  vehicle_model_id  INTEGER NOT NULL REFERENCES vehicle_models(id),
  type              INTEGER NOT NULL,              -- 1=汽車 2=機車
  year              INTEGER,
  fuel              INTEGER,                       -- 1汽油 2柴油 3油電 4純電
  mileage           INTEGER,
  vehicle_type      TEXT,                          -- 車種代碼 '1'-'5'，非描述文字
  driveline         TEXT,                          -- '1'AWD/4WD '2'前驅 '3'後驅
  exterior          TEXT,                          -- 中文色名
  interior          TEXT,
  engine            TEXT,
  transmission      TEXT,                          -- '1'手排 '2'自排 '3'自手排 '4'手自排
  cc                INTEGER,
  location          TEXT,
  vin               TEXT,
  summary           TEXT,
  description       TEXT,
  photo             TEXT    NOT NULL,              -- 主圖檔名（非路徑）
  price             INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT    NOT NULL,              -- ISO-8601 UTC
  views             INTEGER NOT NULL DEFAULT 0,
  sort              INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_vehicles_type_sort  ON vehicles(type, sort);
CREATE INDEX idx_vehicles_model      ON vehicles(vehicle_model_id);
CREATE INDEX idx_vehicles_type_price ON vehicles(type, price);
CREATE INDEX idx_vehicles_type_year  ON vehicles(type, year);

-- ── 相簿 ────────────────────────────────────────────────
CREATE TABLE vehicle_photos (
  id          TEXT    PRIMARY KEY,                 -- UUID，小寫
  vehicle_id  TEXT    NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  photo       TEXT    NOT NULL,
  title       TEXT,
  sort        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_photos_vehicle ON vehicle_photos(vehicle_id, sort);

-- ── 管理員 ──────────────────────────────────────────────
-- 舊版 Password 是 nvarchar(20) 明碼。欄位改名以杜絕誤用，格式：
--   pbkdf2$sha256$<iterations>$<salt_b64>$<hash_b64>
CREATE TABLE admins (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT,
  username       TEXT    NOT NULL UNIQUE,          -- 舊版沒有 UNIQUE
  password_hash  TEXT    NOT NULL,
  email          TEXT,
  is_super       INTEGER NOT NULL DEFAULT 0,       -- 取代硬編碼的 AdminID=888
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- ── 權限節點（舊 Lims）──────────────────────────────────
CREATE TABLE permissions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  key        TEXT    NOT NULL UNIQUE,
  value      TEXT,
  icon       TEXT,
  sort       INTEGER NOT NULL DEFAULT 0,
  parent_id  INTEGER REFERENCES permissions(id)
);

-- ── 管理員權限（舊 AdminLims）───────────────────────────
CREATE TABLE admin_permissions (
  id             TEXT    PRIMARY KEY,
  admin_id       INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  permission_id  INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  can_add        INTEGER NOT NULL DEFAULT 0,
  can_update     INTEGER NOT NULL DEFAULT 0,
  can_delete     INTEGER NOT NULL DEFAULT 0,
  UNIQUE (admin_id, permission_id)                 -- 舊版沒有，同組合可重複
);

-- ── 後台 session ────────────────────────────────────────
-- 舊版把登入狀態放在 ASP.NET Session，登出只清 cookie。
-- 改為資料庫紀錄，可真正撤銷。見 docs/08-security.md
CREATE TABLE sessions (
  id          TEXT    PRIMARY KEY,                 -- 隨機不可預測
  admin_id    INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expires_at  TEXT    NOT NULL,
  created_at  TEXT    NOT NULL
);
CREATE INDEX idx_sessions_admin   ON sessions(admin_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

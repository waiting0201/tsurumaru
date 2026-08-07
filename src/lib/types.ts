// 資料列型別。欄位名與 D1 一致（snake_case），見 docs/03-data-model.md

export interface VehicleMakeRow {
  id: number;
  type: number;
  code: string;
  title: string;
  sort: number;
}

export interface VehicleModelRow {
  id: number;
  vehicle_make_id: number;
  code: string;
  title: string;
  sort: number;
}

export interface VehicleRow {
  id: string;
  vehicle_model_id: number;
  type: number;
  year: number | null;
  fuel: number | null;
  mileage: number | null;
  /** 車種代碼 '1'–'5'，非描述文字 */
  vehicle_type: string | null;
  driveline: string | null;
  exterior: string | null;
  interior: string | null;
  engine: string | null;
  transmission: string | null;
  cc: number | null;
  location: string | null;
  vin: string | null;
  summary: string | null;
  description: string | null;
  /** 主圖檔名，非路徑。用 photoUrl() 組出網址 */
  photo: string;
  price: number;
  created_at: string;
  views: number;
  sort: number;
}

/** 列表與詳情頁常用：車輛加上車廠與車型名稱 */
export interface VehicleWithNames extends VehicleRow {
  model_title: string;
  make_title: string;
  make_id: number;
}

export interface VehiclePhotoRow {
  id: string;
  vehicle_id: string;
  photo: string;
  title: string | null;
  sort: number;
}

export interface AdminRow {
  id: number;
  name: string | null;
  username: string;
  password_hash: string;
  email: string | null;
  is_super: number;
  created_at: string;
}

export interface PermissionRow {
  id: number;
  key: string;
  value: string | null;
  icon: string | null;
  sort: number;
  parent_id: number | null;
}

export interface AdminPermissionRow {
  id: string;
  admin_id: number;
  permission_id: number;
  can_add: number;
  can_update: number;
  can_delete: number;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

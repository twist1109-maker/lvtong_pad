/** 历史记录列表项 — 对齐 Qt HistoryDialog / VehicleInspection */
export interface HistoryRecord {
  id: number
  plate_number: string
  driver_phone: string
  /** 车辆类型显示名 — Qt btypename */
  btypename?: string
  vehicle_name?: string
  goods_name?: string
  load_rate?: number
  operator_name?: string
  /** 0=合格，1=不合格 */
  result_status?: number
  inspection_time?: string
}

export interface HistoryListResult {
  items: HistoryRecord[]
  total: number
  page: number
  page_size: number
}

export interface HistorySearchCriteria {
  plateNumber: string
  driverPhone: string
  operatorName: string
  startTime: string
  endTime: string
}

/** 查验记录详情 — 对齐 Qt VehicleInspection / DetailDialog */
export interface InspectionDetail {
  id: number
  plate_number?: string
  plate_number_gc?: string
  driver_phone?: string
  vehicle_type?: string
  vehicle_name?: string
  vehicle_container_type?: string
  vehicle_container_name?: string
  goods_type?: string
  goods_name?: string
  goods_category?: string
  load_rate?: number
  load_weight?: number
  vehicle_size?: string
  body_image_path?: string
  transparent_image_path?: string
  head_image_path?: string
  tail_image_path?: string
  top_image_path?: string
  goods_image_path?: string
  evidences_image_path?: string
  license_image_path?: string
  pass_code_image_path?: string
  /** 车侧雷达图（车身影像） */
  radar_side_image_path?: string
  /** 车顶雷达图（车身影像） */
  radar_top_image_path?: string
  /** 车头雷达图（预约界面） */
  radar_head_image_path?: string
  operator_name?: string
  inspector_phone?: string
  reviewer_name?: string
  reviewer_phone?: string
  group_id?: number
  result_status?: number
  no_pass_type?: number
  pass_code_vehicle_color_name?: string
  pass_code_en_station_id?: string
  pass_code_ex_station_id?: string
  pass_code_en_weight?: string
  pass_code_ex_weight?: string
  pass_code_media_type_id?: string
  pass_code_transaction_id?: string
  pass_code_pass_id?: string
  pass_code_ex_time?: string
  pass_code_trans_pay_type?: string
  pass_code_fee?: string
  pass_code_pay_fee?: string
  pass_code_vehicle_sign?: string
  pass_code_province_count?: string
  cvarietyname?: string
  btypename?: string
  ccategoryname?: string
  ctypename?: string
  inspection_time?: string
  /** 备注 — Qt historyRecord，后端可能无独立列 */
  history_record?: string
}

export interface DictOption {
  type_code: string
  type_name: string
}

export interface NoPassOption {
  code: string
  value: string
}

export interface UserOption {
  username: string
  real_name: string
  phone?: string
  role?: number
  usergroup?: number
}

export interface DetailModifyPayload {
  vehicle_type?: string
  vehicle_name?: string
  vehicle_container_type?: string
  vehicle_container_name?: string
  goods_type?: string
  goods_name?: string
  plate_number?: string
  pass_code_vehicle_color_name?: string
  load_rate?: number
  driver_phone?: string
  vehicle_size?: string
  operator_name?: string
  inspector_phone?: string
  reviewer_name?: string
  reviewer_phone?: string
  group_id?: number
  result_status?: number
  no_pass_type?: number
}

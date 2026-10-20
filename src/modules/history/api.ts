import { request } from '@/api/request'
import type {
  DetailModifyPayload,
  DictOption,
  HistoryListResult,
  HistorySearchCriteria,
  InspectionDetail,
  NoPassOption,
  UserOption,
} from './types'

function buildParams(
  criteria: HistorySearchCriteria,
  page: number,
  pageSize: number,
): URLSearchParams {
  const params = new URLSearchParams()
  if (criteria.plateNumber) params.set('plate_number', criteria.plateNumber)
  if (criteria.driverPhone) params.set('driver_phone', criteria.driverPhone)
  if (criteria.operatorName) params.set('operator_name', criteria.operatorName)
  if (criteria.startTime) params.set('start_time', criteria.startTime)
  if (criteria.endTime) params.set('end_time', criteria.endTime)
  params.set('page', String(page))
  params.set('page_size', String(pageSize))
  return params
}

/** GET /api/history/list — 对齐 HistoryDialog::loadDataFromDatabase */
export async function fetchHistoryList(
  criteria: HistorySearchCriteria,
  page: number,
  pageSize: number,
) {
  const params = buildParams(criteria, page, pageSize)
  return request<HistoryListResult>(`/history/list?${params.toString()}`)
}

/** GET /api/history/export */
export async function exportHistoryCsv(criteria: HistorySearchCriteria) {
  const params = buildParams(criteria, 1, 10000)
  return request<{ csv: string; total: number }>(`/history/export?${params.toString()}`)
}

/** 操作员下拉 — 对齐 getDistinctOperators，暂用用户列表 */
export async function fetchOperators(): Promise<string[]> {
  try {
    const res = await request<{ username: string; real_name: string }[] | Record<string, unknown>>(
      '/user/query?username=all',
    )
    if (res.code !== 0 || !res.data) return []
    const list = Array.isArray(res.data) ? res.data : []
    const names = list
      .map((u) => (u as { real_name?: string }).real_name || (u as { username?: string }).username || '')
      .filter(Boolean)
    return [...new Set(names)]
  } catch {
    return []
  }
}

/** GET /api/inspection/:id — 对齐 DetailDialog::setVehicleInfo */
export async function fetchInspectionDetail(id: number) {
  return request<InspectionDetail>(`/inspection/${id}`)
}

/** PUT /api/inspection/:id — 对齐 DetailDialog::onModifyDetail */
export async function updateInspectionDetail(id: number, payload: DetailModifyPayload) {
  return request<null>(`/inspection/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function fetchTruckTypes(): Promise<DictOption[]> {
  const res = await request<DictOption[]>('/dict/truck-types')
  return res.code === 0 && res.data ? res.data : []
}

export async function fetchContainerTypes(): Promise<DictOption[]> {
  const res = await request<DictOption[]>('/dict/container-types')
  return res.code === 0 && res.data ? res.data : []
}

export async function fetchNoPassTypes(): Promise<NoPassOption[]> {
  const res = await request<NoPassOption[]>('/dict/no-pass-types')
  return res.code === 0 && res.data ? res.data : []
}

/** 收费站 ID → 显示名。有 ID 但本地库查不到时显示「站点待更新」（仅展示，落库仍存 ID） */
export async function fetchStationName(stationId?: string): Promise<string> {
  if (!stationId?.trim()) return ''
  try {
    const res = await request<{ station_name?: string }>(
      `/dict/stations/${encodeURIComponent(stationId)}`,
    )
    if (res.code === 0 && res.data?.station_name) return res.data.station_name
  } catch {
    // 404 / 网络错误：走缺省显示
  }
  return '站点待更新'
}

/** 查验/复核人员 — 对齐 getUsersByRole(1) */
export async function fetchInspectorUsers(): Promise<UserOption[]> {
  try {
    const res = await request<UserOption[] | Record<string, unknown>>('/user/query?username=all')
    if (res.code !== 0 || !res.data) return []
    const list = Array.isArray(res.data) ? res.data : []
    return list.map((u) => u as UserOption)
  } catch {
    return []
  }
}

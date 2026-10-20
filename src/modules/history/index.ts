export { default as HistoryDialog } from './HistoryDialog.vue'
export { default as DetailDialog } from './DetailDialog.vue'
export type {
  HistoryRecord,
  HistoryListResult,
  HistorySearchCriteria,
  InspectionDetail,
  DetailModifyPayload,
} from './types'
export {
  fetchHistoryList,
  exportHistoryCsv,
  fetchOperators,
  fetchInspectionDetail,
  updateInspectionDetail,
} from './api'

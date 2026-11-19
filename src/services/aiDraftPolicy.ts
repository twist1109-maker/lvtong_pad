import type { Draft, DraftChange } from './inspectionSessionSync'

export type AiGroup = 'truck' | 'license' | 'load'
export const manualAiFields = ['plate', 'truckType', 'containerType', 'loadRate'] as const
const groupFor: Record<string, AiGroup> = { plate: 'license', truckType: 'truck', containerType: 'truck', loadRate: 'load', weightRange: 'license', license: 'license', licenseGc: 'license' }
const object = (value: unknown) => (value || {}) as Record<string, any>

/** AI派生更新携带原版本，409重试也不能升级为新的人工编辑。 */
export function tagAiChange(change: DraftChange, draft: Draft, revision: number): DraftChange {
  if (change.origin === 'ai') return change
  const [root, field = ''] = change.path, marks = object(draft.aiMarks)
  let group: AiGroup | undefined
  if (root === 'form' && groupFor[field] && marks[field] && marks[field] === change.value) group = groupFor[field]
  if (root === 'form' && groupFor[field] && change.value === '' && !object(draft.manualFields)[field] && object(draft.aiContext)[groupFor[field]!]) group = groupFor[field]
  if (root === 'aiMarks' && field !== 'goods' && !object(draft.manualFields)[field]) group = groupFor[field]
  if (root === 'aiContext' && ['truck', 'license', 'load'].includes(field)) group = field as AiGroup
  const licenseContext = object(object(draft.aiContext).license)
  if (root === 'licensePaths') {
    const sourceKey = { license: 'source', licenseGc: 'hangSource', licenseStitched: 'stitchedSource' }[field]
    if (sourceKey && change.value && licenseContext[sourceKey] === change.value) group = 'license'
  }
  if (root === 'captureThumbs' && field === 'license' && change.value && [licenseContext.source, licenseContext.hangSource].includes(change.value)) group = 'license'
  if (!group) return change
  const context = object(object(draft.aiContext)[group])
  return { ...change, origin: 'ai', aiGroup: group, aiBaseRevision: typeof context.baseRevision === 'number' ? context.baseRevision : revision }
}

/** 收到另一端人工编辑时立即放弃待上传AI值；不能在overlay或冲突重试时盖回去。 */
export function aiChangeAllowed(change: DraftChange, draft: Draft): boolean {
  if (change.origin !== 'ai') return true
  const [root, field = ''] = change.path
  return !(['form', 'aiMarks'].includes(root!) && object(draft.manualFields)[field] === true)
}

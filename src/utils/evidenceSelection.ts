export type ExistingImage = { label: string; src: string }
export type EvidenceCandidate = ExistingImage & { alreadyAdded: boolean }
export type EvidenceChoice = { source: string; src: string }

/** URL已由调用方归一，同一张图合并标签；已有证据只能预览，不能重复追加。 */
export function evidenceCandidates(images: ExistingImage[], existingSources: string[]): EvidenceCandidate[] {
  const added = new Set(existingSources)
  const unique = new Map<string, EvidenceCandidate>()
  for (const image of images) {
    if (!image.src) continue
    const item = unique.get(image.src)
    if (item) item.label += ` / ${image.label}`
    else unique.set(image.src, { ...image, alreadyAdded: added.has(image.src) })
  }
  return [...unique.values()]
}

/** 保留原有列表（包含历史重复项），只过滤此次重复选择和已经添加过的来源。 */
export function appendEvidence(existing: string[], choices: EvidenceChoice[], sources: Set<string>) {
  const seen = new Set([...sources, ...existing])
  const appended: EvidenceChoice[] = []
  for (const choice of choices) {
    if (!choice.src || !choice.source || seen.has(choice.source) || seen.has(choice.src)) continue
    seen.add(choice.source); seen.add(choice.src)
    appended.push(choice)
  }
  return { images: [...existing, ...appended.map(item => item.src)], sources: appended.map(item => item.source) }
}

export interface GoodsRecommendation {
  code: string
  name: string
  pinyin?: string
  score: number
}

/** 多张实拍照片同品取最高分；模型分数用于推荐排序，不作为正确率。 */
export function mergeGoodsRecommendations(groups: GoodsRecommendation[][]): GoodsRecommendation[] {
  const best = new Map<string, GoodsRecommendation>()
  for (const item of groups.flat()) {
    if (!item.code || !item.name || !Number.isFinite(item.score) || item.score < 0 || item.score > 1) continue
    if (!best.has(item.code) || best.get(item.code)!.score < item.score) best.set(item.code, item)
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.code.localeCompare(b.code))
}

import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeGoodsRecommendations } from '../../src/utils/goodsRecommendations.ts'

test('多张照片推荐同品取最高分，按置信度排序，保留字符串编码', () => {
  const groups = [[{ code: '001', name: '香蕉', score: .5 }, { code: '002', name: '苹果', score: .8 }],
    [{ code: '001', name: '香蕉', score: .95 }, { code: '003', name: '菜', score: NaN }]]
  assert.deepEqual(mergeGoodsRecommendations(groups).map(g => [g.code, g.score]), [['001', .95], ['002', .8]])
  assert.equal(groups[0]![0]!.score, .5)
})

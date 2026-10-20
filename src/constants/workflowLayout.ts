/** 对齐 LvTongPro::initializeUI 布局常量 */
export const TOTAL_LENGTH = 1146
export const SCENE_WIDTH = TOTAL_LENGTH
export const SCENE_HEIGHT = 62
export const START_POS_X = 170
export const TOTAL_METERS = 48
export const METER_PIX = TOTAL_LENGTH / TOTAL_METERS
export const SEGMENT_PIX = METER_PIX * 8
export const BASE_Y = 58
const TEXT_W = 10

/** 五个流程段起始 X（预约/闸机/光机/拍照/审核） */
export const SEGMENT_LEFTS = [0, 1, 2, 3, 4].map((i) => START_POS_X + i * SEGMENT_PIX)

/**
 * 进度轴节点圆心 X — 逐行复刻 LvTongPro.cpp initializeUI 中 addEllipse 计算
 * centerX = nLineStarX - 4 + nTextW * k [+ offset] + 4
 */
export const NODE_CENTERS = (() => {
  let lineX = START_POS_X
  const centers: number[] = []

  centers.push(lineX + TEXT_W)
  lineX += SEGMENT_PIX

  centers.push(lineX + TEXT_W * 2)
  lineX += SEGMENT_PIX

  centers.push(lineX + TEXT_W * 3 + 15)
  lineX += SEGMENT_PIX

  centers.push(lineX + TEXT_W * 6)
  lineX += SEGMENT_PIX

  centers.push(lineX + TEXT_W * 7)

  return centers
})()

export function toPercentX(px: number) {
  return `${(px / SCENE_WIDTH) * 100}%`
}

export function toPercentW(px: number) {
  return `${(px / SCENE_WIDTH) * 100}%`
}

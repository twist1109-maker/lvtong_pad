import { HIK_SDK_PATHS } from '@/config/hikvision'

const loaded = new Set<string>()

function loadScript(src: string, scriptId?: string): Promise<void> {
  if (loaded.has(src)) return Promise.resolve()
  if (scriptId && document.getElementById(scriptId)) {
    loaded.add(src)
    return Promise.resolve()
  }
  if (document.querySelector(`script[data-hik-src="${src}"]`)) {
    loaded.add(src)
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const el = document.createElement('script')
    el.src = src
    el.async = false
    el.dataset.hikSrc = src
    // 官方 demo 用 id=videonode 解析 SDK 相对路径，动态加载时必须带上
    if (scriptId) el.id = scriptId
    el.onload = () => {
      loaded.add(src)
      resolve()
    }
    el.onerror = () => reject(new Error(`加载失败: ${src}`))
    document.head.appendChild(el)
  })
}

/** 按官方 demo 顺序加载 jQuery → webVideoCtrl.js */
export async function loadHikvisionSdk(): Promise<NonNullable<Window['WebVideoCtrl']>> {
  await loadScript(HIK_SDK_PATHS.jquery)
  await loadScript(HIK_SDK_PATHS.webVideoCtrl, 'videonode')
  const ctrl = window.WebVideoCtrl
  if (!ctrl) {
    throw new Error('WebVideoCtrl 未就绪，请检查 SDK 文件是否完整')
  }
  return ctrl
}

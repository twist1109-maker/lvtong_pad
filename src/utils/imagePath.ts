/**
 * 图片路径归一工具 — 与 flask_backend/app/services/image_store.py 对齐
 *
 * 三层形态：
 *   1. storage path（磁盘绝对路径，对齐 Qt m_*ImagePath）
 *        例：E:/code_product/gcms_src/captures/2026/07/29/head/xxx.jpg
 *   2. relative path（IMAGE_STORAGE_ROOT 之下的相对路径，前端内部标准存值）
 *        例：2026/07/29/head/xxx.jpg
 *   3. API URL（前端 <img :src> 用）
 *        例：/api/images/2026/07/29/head/xxx.jpg
 *
 * 兼容：/api/image?path=<encoded>（旧代理）和 image_ready 推送的 mock 路径
 *       都被 toApiUrl() 透传 / 切到 /api/images/<rel> 形态。
 */

/** 任意引用 → API URL（用于 <img :src> 显示）。空 → ''。
 *
 * 解析顺序：
 *   1. /api/images/<rel>               → 原样
 *   2. ?path=<encoded> 形态（老 /api/image 或 mock_back /api/mock/...） →
 *        - 抽出来的路径落在 IMAGE_STORAGE_ROOT 内（captures/YYYY/...）→ 转 /api/images/<rel>
 *        - 否则保留原 URL（让老代理 /api/image 兜底显示）
 *   3. 形似绝对路径（Windows X:/ 或 /unix/... 含盘符/根）→ 转 /api/image?path=<encoded>
 *        这一兜底很重要：mobile 上传、Qt 时代数据等都会落到这里
 *   4. http(s)://  /  blob:  /  data:  → 原样（浏览器内嵌资源，无需代理）
 *   5. 其它（未知）→ 原样返回，绝不静默吞掉
 */
export function toApiUrl(reference: string | undefined | null): string {
  if (!reference) return ''
  const s = String(reference).trim()
  if (!s) return ''

  // 1. 已是 /api/images/<rel> 或预览临时图 /api/temp-images/<id>
  //    显示侧可能带 ?t= 防缓存，提交/归一时要剥掉
  if (s.startsWith('/api/images/') || s.startsWith('/api/temp-images/')) {
    const q = s.indexOf('?')
    return q >= 0 ? s.slice(0, q) : s
  }

  // 2. ?path=<encoded> 形态
  if (s.startsWith('/api/image') || s.includes('?path=')) {
    const abs = extractAbsFromUrl(s)
    if (abs) {
      const rel = absToRel(abs)
      if (rel) return `/api/images/${rel}`
      // 路径不在 IMAGE_STORAGE_ROOT 下 — 保留原 URL 让老代理 /api/image 兜底
      return s
    }
    return s
  }

  // 3. 绝对路径兜底：转 /api/image?path=<encoded>
  //    覆盖 mobile_upload 推过来的 "D:/soft/FtpLvTong/xxx.jpg" 等
  if (looksLikeAbsolutePath(s)) {
    return `/api/image?path=${encodeURIComponent(s)}`
  }

  // 4. 外链 / blob / data:
  //    - http(s):// 浏览器直接加载
  //    - blob: / data: Vue/浏览器内存里资源
  //    - 这些都不会被 vite proxy 转，原样即可
  return s
}

/** 任意引用 → "提交时使用的字符串"。
 *  - 优先返回磁盘绝对路径（让后端 persist_to_storage 直接归一）
 *  - 没绝对路径信息时返回原值（后端会兜底处理）
 *
 * 注意：这是与 toApiUrl() 的 **逆向行为** —— 显示形态和入库形态必须能互转。
 */
export function toStoragePath(reference: string | undefined | null): string {
  if (!reference) return ''
  const s = String(reference).trim()
  if (!s) return ''
  if (s.startsWith('http://') || s.startsWith('https://')) return s

  // /api/image?path=<encoded> 或任何 ?path= 形态：抽出绝对路径
  if (s.startsWith('/api/image') || s.includes('?path=')) {
    const abs = extractAbsFromUrl(s)
    if (abs) return abs
    return s
  }

  // /api/images/<rel>：剥前缀变相对（后端会拼 IMAGE_STORAGE_ROOT）
  if (s.startsWith('/api/images/')) {
    const bare = s.slice('/api/images/'.length)
    const q = bare.indexOf('?')
    return q >= 0 ? bare.slice(0, q) : bare
  }

  // /api/temp-images/<id>：原样交给后端 persist_to_storage（从内存缓存落正式库）
  if (s.startsWith('/api/temp-images/')) {
    const q = s.indexOf('?')
    return q >= 0 ? s.slice(0, q) : s
  }

  // 兜底：原样返回（绝对路径由后端检查/复制）
  return s
}

/** 多图字段：把每项过 toStoragePath，用 | 拼。空项过滤。 */
export function joinImagePaths(references: (string | undefined | null)[]): string {
  return references
    .map((r) => toStoragePath(r))
    .filter(Boolean)
    .join('|')
}

/**
 * 由落库的行驶证拼接图路径推导旁路文件 URL。
 * 例：/api/images/.../xxx.jpg → /api/images/.../xxx-main.jpg
 */
export function licenseSiblingApiUrl(
  stitchedRef: string | undefined | null,
  kind: 'main' | 'hang',
): string {
  const url = toApiUrl(stitchedRef)
  if (!url || !url.startsWith('/api/images/')) return ''
  const q = url.indexOf('?')
  const bare = q >= 0 ? url.slice(0, q) : url
  const dot = bare.lastIndexOf('.')
  if (dot <= 0) return `${bare}-${kind}`
  return `${bare.slice(0, dot)}-${kind}${bare.slice(dot)}`
}

// ---- 内部工具 ----

/** 判定字符串"形似磁盘绝对路径"。
 *  - Windows: `D:\` `D:/` `\\server\`
 *  - Unix:    `/foo/bar`（要求至少有一段）
 */
function looksLikeAbsolutePath(s: string): boolean {
  if (!s) return false
  // Windows: drive letter
  if (/^[A-Za-z]:[\\/]/.test(s)) return true
  // UNC: \\server\share
  if (s.startsWith('\\\\') || s.startsWith('//')) return true
  // Unix-style absolute: /...
  if (s.startsWith('/') && s.length > 1 && !s.startsWith('/api/')) return true
  return false
}

function extractRelFromUrl(url: string): string | null {
  const q = url.indexOf('?')
  if (q < 0) return null
  const qs = url.slice(q + 1)
  for (const part of qs.split('&')) {
    const [k, v] = part.split('=')
    if (k === 'path' && v) {
      return absToRel(decodeURIComponent(v))
    }
  }
  return null
}

function extractAbsFromUrl(url: string): string | null {
  const q = url.indexOf('?')
  if (q < 0) return null
  const qs = url.slice(q + 1)
  for (const part of qs.split('&')) {
    const [k, v] = part.split('=')
    if (k === 'path' && v) return decodeURIComponent(v)
  }
  return null
}

/** 绝对路径 → 相对 IMAGE_STORAGE_ROOT 的字符串。
 *  简化版：前端没有 IMAGE_STORAGE_ROOT 常量，用绝对路径前缀启发式匹配。
 *  事实上前端没法准确判断根目录，兜底由后端 persist_to_storage 完成；
 *  这里只在"明显像 capturess/xxx"时返回相对段，否则返回 null。
 */
function absToRel(absPath: string): string | null {
  // 已规范化的标准目录：captures/YYYY/MM/DD/<category>/<file>
  const m = absPath.match(/[\\\/]captures[\\\/](\d{4}[\\\/]\d{2}[\\\/]\d{2}[\\\/][^\\\/]+[\\\/][^\\\/]+\.\w+)\s*$/i)
  if (m && m[1]) return m[1].replace(/\\/g, '/')
  return null
}

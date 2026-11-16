import type { DraftOutbox, PendingDraft } from './inspectionSessionSync'

/** 每个登录账号、浏览器页签独立暂存；只保存草稿数据，不保存或重放设备指令。 */
export function createInspectionDraftOutbox(username: string): DraftOutbox {
  const retentionMs = 48 * 60 * 60 * 1000
  let database: Promise<IDBDatabase> | undefined
  function open() {
    if (database) return database
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lvtong-inspection-outbox', 1)
      const timer = setTimeout(() => reject(new Error('本机暂存不可用')), 3000)
      request.onupgradeneeded = () => request.result.createObjectStore('drafts')
      request.onsuccess = () => { clearTimeout(timer); resolve(request.result) }
      request.onerror = () => { clearTimeout(timer); reject(request.error) }
      request.onblocked = () => { clearTimeout(timer); reject(new Error('本机暂存被占用')) }
    }).catch(error => { database = undefined; throw error })
    return database
  }
  function tabKey() {
    let key = sessionStorage.getItem('lvtong_draft_tab')
    if (!key) {
      key = typeof crypto.randomUUID === 'function' ? crypto.randomUUID()
        : Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('')
      sessionStorage.setItem('lvtong_draft_tab', key)
    }
    return key
  }
  return {
    async load() {
      const db = await open(), key = tabKey()
      return new Promise<PendingDraft | null>((resolve, reject) => {
        const tx = db.transaction('drafts', 'readwrite'), store = tx.objectStore('drafts')
        let pending: PendingDraft | null = null
        const request = store.get(key)
        request.onsuccess = () => {
          const record = request.result
          if (record?.username === username && Date.now() - record.updatedAt < retentionMs) pending = record.draft
          else if (record) store.delete(key)
        }
        tx.oncomplete = () => resolve(pending)
        tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('读取本机暂存失败'))
      })
    },
    async save(draft) {
      const db = await open(), key = tabKey()
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction('drafts', 'readwrite'), store = tx.objectStore('drafts')
        if (draft) store.put({ username, updatedAt: Date.now(), draft }, key)
        else store.delete(key)
        // 已关闭页签的未确认草稿到期清理；已确认内容立即删除。
        const cursor = store.openCursor()
        cursor.onsuccess = () => {
          const entry = cursor.result
          if (!entry) return
          if (Date.now() - entry.value.updatedAt >= retentionMs) entry.delete()
          entry.continue()
        }
        tx.oncomplete = () => resolve()
        tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('写入本机暂存失败'))
      })
    },
  }
}

// 当前车道会话随业务请求传回后端，阻止旧页面操作下一辆车。
let current = ''
const clientId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID()
  : Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('')
export function getInspectionClientId() { return clientId }
export function getInspectionSessionId() { return current }
export function setInspectionSessionId(value: string) { current = value }

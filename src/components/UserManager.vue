<script setup lang="ts">
/**
 * 用户管理弹窗 — 对齐 Qt UsrMgrDialog (980×630)
 * 左表 + 右表单：设置用户 / 删除用户
 * 仅调用现有 /user/query|update|delete，不改后端
 */
import { computed, onMounted, ref } from 'vue'
import { request } from '@/api/request'
import QtMessageBox from '@/components/common/QtMessageBox.vue'

interface UserRow {
  id?: number
  username: string
  real_name?: string
  realName?: string
  password?: string
  email?: string
  phone?: string
  role?: number | string
  usergroup?: number | string
  usertype?: string
}

const emit = defineEmits<{ close: [] }>()

const users = ref<UserRow[]>([])
const loading = ref(false)
const tip = ref('')
const selectedIndex = ref(-1)

const form = ref({
  username: '',
  password: '',
  realName: '',
  phone: '',
  email: '',
  /** 班组 index 0–5 — 对齐 comboBoxTypeGrp */
  usergroup: 0,
  /** 管理员类型：1 普通用户 / 0 系统管理员 — 对齐 comboBoxType */
  role: 1 as 0 | 1,
  /** 用户类型多选：1站长 2班长 3查验 4复核 */
  typeZZ: false,
  typeBZ: false,
  typeCYRY: false,
  typeFHRY: false,
})

const GROUP_OPTIONS = [
  { value: 0, label: '未分组' },
  { value: 1, label: '班组1' },
  { value: 2, label: '班组2' },
  { value: 3, label: '班组3' },
  { value: 4, label: '班组4' },
  { value: 5, label: '班组5' },
] as const

const ROLE_OPTIONS = [
  { value: 1, label: '普通用户' },
  { value: 0, label: '系统管理员' },
] as const

const confirmDelVisible = ref(false)

function realNameOf(u: UserRow) {
  return u.real_name || u.realName || ''
}

function roleLabel(role: number | string | undefined) {
  const n = Number(role)
  return n === 0 ? '系统管理员' : '普通用户'
}

function groupLabel(g: number | string | undefined) {
  const n = Number(g)
  if (!n) return '未分组'
  return `班组${n}`
}

const USERTYPE_MAP: Record<string, string> = {
  '1': '站长',
  '2': '班长',
  '3': '查验人员',
  '4': '复核人员',
}

function userTypeLabel(usertype?: string) {
  if (!usertype) return ''
  return usertype.split('|')
    .map(code => USERTYPE_MAP[code] || code)
    .join('|')
}

function displayId(u: UserRow, index: number) {
  if (u.id != null) return String(u.id)
  return String(index + 1)
}

async function loadUsers() {
  loading.value = true
  try {
    const res = await request<UserRow[] | Record<string, unknown>>('/user/query?username=all')
    if (res.code === 0 && res.data) {
      const raw = res.data
      users.value = Array.isArray(raw) ? raw : Object.values(raw as Record<string, UserRow>)
    } else {
      users.value = []
    }
  } catch {
    users.value = []
  } finally {
    loading.value = false
  }
}

function clearForm() {
  form.value = {
    username: '',
    password: '',
    realName: '',
    phone: '',
    email: '',
    usergroup: 0,
    role: 1,
    typeZZ: false,
    typeBZ: false,
    typeCYRY: false,
    typeFHRY: false,
  }
  selectedIndex.value = -1
}

/** 对齐 selectionChanged → 回填右侧表单 */
function onSelectRow(index: number) {
  selectedIndex.value = index
  const info = users.value[index]
  if (!info) return

  form.value.username = info.username || ''
  // 对齐 Qt：选中行后密码框填入固定占位 "1234567"
  form.value.password = '1234567'
  form.value.realName = realNameOf(info)
  form.value.email = info.email || ''
  form.value.phone = info.phone || ''
  form.value.usergroup = Number(info.usergroup) || 0
  form.value.role = Number(info.role) === 0 ? 0 : 1

  form.value.typeZZ = false
  form.value.typeBZ = false
  form.value.typeCYRY = false
  form.value.typeFHRY = false
  const parts = (info.usertype || '').split('|').filter(Boolean)
  for (const p of parts) {
    switch (Number(p)) {
      case 1:
        form.value.typeZZ = true
        break
      case 2:
        form.value.typeBZ = true
        break
      case 3:
        form.value.typeCYRY = true
        break
      case 4:
        form.value.typeFHRY = true
        break
    }
  }
}

function buildUserType(): string {
  const parts: string[] = []
  if (form.value.typeZZ) parts.push('1')
  if (form.value.typeBZ) parts.push('2')
  if (form.value.typeCYRY) parts.push('3')
  if (form.value.typeFHRY) parts.push('4')
  // 对齐 Qt：全空则默认查验人员 "3"
  return parts.length ? parts.join('|') : '3'
}

/** 对齐 on_buttonAdd_clicked：存在则更新，否则添加 */
async function onSetUser() {
  const username = form.value.username.trim()
  if (!username) {
    tip.value = '用户名为必填项 ！'
    return
  }
  if (!form.value.password.trim()) {
    tip.value = '密码为必填项 ！'
    return
  }
  if (!form.value.phone.trim()) {
    tip.value = '手机号码为必填项 ！'
    return
  }

  let role: 0 | 1 = form.value.role
  // admin 强制系统管理员
  if (username === 'admin') role = 0

  const body = {
    password: form.value.password,
    real_name: form.value.realName,
    role,
    phone: form.value.phone,
    email: form.value.email,
    usergroup: form.value.usergroup,
    usertype: buildUserType(),
  }

  const exists = users.value.some((u) => u.username === username)
  const action = exists ? '更新' : '添加'

  try {
    const res = await request(`/user/update/${encodeURIComponent(username)}`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    if (res.code === 0) {
      tip.value = `${username} ${action}成功 ！`
      await loadUsers()
      const idx = users.value.findIndex((u) => u.username === username)
      if (idx >= 0) onSelectRow(idx)
    } else {
      tip.value = `${username} ${action}失败 ！`
    }
  } catch {
    tip.value = `${username} ${action}失败 ！`
  }
}

function onDeleteClick() {
  const username = form.value.username.trim()
  if (!username) {
    tip.value = '请先选择或填写要删除的用户 ！'
    return
  }
  if (username === 'admin') {
    tip.value = 'admin用户不能删除 ！'
    return
  }
  confirmDelVisible.value = true
}

async function onDeleteConfirm() {
  confirmDelVisible.value = false
  const username = form.value.username.trim()
  try {
    const res = await request(`/user/delete/${encodeURIComponent(username)}`, {
      method: 'DELETE',
    })
    if (res.code === 0) {
      tip.value = `${username} 删除成功 ！`
      clearForm()
      await loadUsers()
    } else {
      tip.value = `${username} 删除失败 ！`
    }
  } catch {
    tip.value = `${username} 删除失败 ！`
  }
}

const tableRows = computed(() => users.value)

onMounted(() => {
  void loadUsers()
})
</script>

<template>
  <div class="usr-overlay" @click.self="emit('close')">
    <div class="usr-dialog" role="dialog" aria-modal="true" aria-labelledby="usr-dlg-title" @click.stop>
      <div class="dialog-titlebar">
        <img class="title-icon" src="/assets/img/logo.ico" alt="" />
        <span id="usr-dlg-title" class="dialog-title">用户管理</span>
        <button type="button" class="dialog-close" title="关闭" @click="emit('close')">×</button>
      </div>

      <div class="dialog-body">
        <!-- 左侧表格 — 对齐 tableWidget 9 列 -->
        <div class="table-wrap">
          <table class="usr-table">
            <thead>
              <tr>
                <th class="col-id">编号</th>
                <th>用户名</th>
                <th class="col-pwd">密码</th>
                <th>实际姓名</th>
                <th>邮箱</th>
                <th>手机号码</th>
                <th class="col-grp">班组</th>
                <th>管理员类型</th>
                <th>用户类型</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!loading && tableRows.length === 0">
                <td colspan="9" class="empty">暂无用户数据</td>
              </tr>
              <tr
                v-for="(u, idx) in tableRows"
                :key="u.username"
                :class="{ selected: selectedIndex === idx }"
                @click="onSelectRow(idx)"
              >
                <td class="col-id">{{ displayId(u, idx) }}</td>
                <td>{{ u.username }}</td>
                <td class="col-pwd">******</td>
                <td>{{ realNameOf(u) }}</td>
                <td>{{ u.email || '' }}</td>
                <td>{{ u.phone || '' }}</td>
                <td class="col-grp">{{ groupLabel(u.usergroup) }}</td>
                <td>{{ roleLabel(u.role) }}</td>
                <td>{{ userTypeLabel(u.usertype) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 右侧表单 — 对齐 groupBox -->
        <div class="form-side">
          <div class="form-fields">
            <label class="field-label">用户名:</label>
            <input v-model="form.username" class="field-input" type="text" placeholder="必填项 （*）" />

            <label class="field-label">密码：</label>
            <input v-model="form.password" class="field-input" type="text" placeholder="必填项 （*）" />

            <label class="field-label">实际姓名:</label>
            <input v-model="form.realName" class="field-input" type="text" placeholder="选填项" />

            <label class="field-label">手机号码：</label>
            <input v-model="form.phone" class="field-input" type="text" placeholder="必填项 （*）" />

            <label class="field-label">班组：</label>
            <select v-model.number="form.usergroup" class="field-input field-select">
              <option v-for="g in GROUP_OPTIONS" :key="g.value" :value="g.value">{{ g.label }}</option>
            </select>

            <label class="field-label">管理员类型：</label>
            <select v-model.number="form.role" class="field-input field-select">
              <option v-for="r in ROLE_OPTIONS" :key="r.value" :value="r.value">{{ r.label }}</option>
            </select>

            <label class="field-label">用户类型:</label>
            <div class="type-grid">
              <label class="chk"><input v-model="form.typeZZ" type="checkbox" /> 站长</label>
              <label class="chk"><input v-model="form.typeBZ" type="checkbox" /> 班长</label>
              <label class="chk"><input v-model="form.typeCYRY" type="checkbox" /> 查验人员</label>
              <label class="chk"><input v-model="form.typeFHRY" type="checkbox" /> 复核人员</label>
            </div>

            <label class="field-label">邮箱：</label>
            <input v-model="form.email" class="field-input" type="text" placeholder="选填项" title="选填项" />
          </div>

          <div class="form-actions">
            <button type="button" class="btn-set" @click="onSetUser">设置用户</button>
            <button type="button" class="btn-del" @click="onDeleteClick">删除用户</button>
            <input class="tip-line" type="text" readonly :value="tip" />
          </div>
        </div>
      </div>
    </div>

    <QtMessageBox
      v-if="confirmDelVisible"
      title="系统提醒"
      :message="`确定删除用户 ${form.username}？`"
      icon="question"
      :buttons="['yes', 'no']"
      @yes="onDeleteConfirm"
      @no="confirmDelVisible = false"
      @close="confirmDelVisible = false"
    />
  </div>
</template>

<style scoped lang="scss">
.usr-overlay {
  position: fixed;
  inset: 0;
  z-index: 1500;
  background: rgba(0, 0, 0, 0.28);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 对齐 Qt 980×630 */
.usr-dialog {
  width: 980px;
  height: 630px;
  max-width: 96vw;
  max-height: 94vh;
  box-sizing: border-box;
  background: #f0f0f0;
  border: 1px solid #a0a0a0;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28);
  font-family: 'Microsoft YaHei', 'Segoe UI', sans-serif;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dialog-titlebar {
  display: flex;
  align-items: center;
  height: 30px;
  padding: 0 4px 0 8px;
  background: linear-gradient(180deg, #fff 0%, #ececec 100%);
  border-bottom: 1px solid #d0d0d0;
  flex-shrink: 0;
  user-select: none;
}

.title-icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
  margin-right: 6px;
}

.dialog-title {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: #1a1a1a;
}

.dialog-close {
  width: 32px;
  height: 24px;
  border: none;
  background: transparent;
  font-size: 18px;
  cursor: pointer;
  color: #333;

  &:hover {
    background: #e81123;
    color: #fff;
  }
}

.dialog-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 8px;
  padding: 10px;
  box-sizing: border-box;
}

.table-wrap {
  flex: 1;
  min-width: 0;
  overflow: auto;
  background: #fff;
  border: 1px solid #c8c8c8;
}

.usr-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  min-width: 760px;

  th,
  td {
    padding: 5px 8px;
    border: 1px solid #d8d8d8;
    text-align: left;
    white-space: nowrap;
  }

  th {
    background: #f5f5f5;
    font-weight: 600;
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .col-id {
    width: 48px;
    text-align: center;
  }

  .col-pwd {
    width: 64px;
    text-align: center;
  }

  .col-grp {
    width: 72px;
  }

  tbody tr {
    cursor: pointer;

    &:hover {
      background: #eaf4fc;
    }

    &.selected {
      background: #cce4f7;
    }
  }

  .empty {
    text-align: center;
    color: #999;
    padding: 40px;
  }
}

.form-side {
  width: 181px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid #c8c8c8;
  background: #f5f5f5;
  box-sizing: border-box;
  padding: 8px 10px;
}

.form-fields {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.field-label {
  font-size: 12px;
  color: #1a1a1a;
  margin-top: 6px;

  &:first-child {
    margin-top: 0;
  }
}

.field-input {
  width: 100%;
  height: 28px;
  box-sizing: border-box;
  border: 1px solid #adadad;
  border-radius: 2px;
  padding: 2px 6px;
  font-size: 12px;
  font-family: inherit;
  background: #fff;

  &:focus {
    outline: 1px solid #0078d7;
    border-color: #0078d7;
  }
}

.field-select {
  cursor: pointer;
}

.type-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 2px;
  margin: 4px 0 2px;
}

.chk {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #1a1a1a;
  white-space: nowrap;
  cursor: pointer;

  input {
    margin: 0;
  }
}

.form-actions {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.btn-set,
.btn-del {
  width: 100%;
  height: 31px;
  border-radius: 2px;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  background: #fff;
}

.btn-set {
  border: 1px solid #0078d7;
  color: #0078d7;

  &:hover {
    background: #eaf4fc;
  }
}

.btn-del {
  border: 1px solid #adadad;
  color: #333;

  &:hover {
    background: #f5f5f5;
  }
}

.tip-line {
  width: 100%;
  height: 28px;
  box-sizing: border-box;
  border: 1px solid #c8c8c8;
  background: #fff;
  font-size: 11px;
  color: #c0392b;
  padding: 0 6px;
  font-family: inherit;
}
</style>

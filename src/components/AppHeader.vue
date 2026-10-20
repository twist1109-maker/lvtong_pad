<script setup lang="ts">
/**
 * 顶栏 — 对齐 Qt frame + label_user 菜单
 * 点击用户名 → QMenu：修改密码 / 切换班组
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/useAuthStore'
import ChangePasswordDialog from '@/components/ChangePasswordDialog.vue'
import ChangeUsrDialog from '@/components/ChangeUsrDialog.vue'

export type ToolAnchor = {
  left: number
  top: number
  bottom: number
  right: number
}

const props = defineProps<{
  username?: string
  /** 对齐 Qt btn_webservice 在线图标 */
  aiOnline?: boolean
  /** 对齐 Qt btn_setting：全部设备在线用 s_connect */
  devicesOnline?: boolean
}>()

const emit = defineEmits<{
  toolClick: [key: string, anchor?: ToolAnchor]
}>()

const userMenuOpen = ref(false)
const showChangePassword = ref(false)
const showChangeUsr = ref(false)

function toggleUserMenu() {
  userMenuOpen.value = !userMenuOpen.value
}

function closeUserMenu() {
  userMenuOpen.value = false
}

function onChangePassword() {
  closeUserMenu()
  showChangePassword.value = true
}

function onChangeUsr() {
  closeUserMenu()
  showChangeUsr.value = true
}

const authStore = useAuthStore()
const router = useRouter()

function onLogout() {
  closeUserMenu()
  authStore.logout()
  router.push('/login')
}

function onDocClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null
  if (!target?.closest('.user-area')) {
    closeUserMenu()
  }
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
})

function rectFromEl(el: EventTarget | null): ToolAnchor | undefined {
  if (!(el instanceof HTMLElement)) return undefined
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, bottom: r.bottom, right: r.right }
}

function handleToolClick(key: string, e?: MouseEvent) {
  switch (key) {
    case 'user':
    case 'history':
    case 'device':
    case 'stop':
    case 'plc':
    case 'ai':
      emit(
        'toolClick',
        key,
        key === 'plc' || key === 'ai' || key === 'device'
          ? rectFromEl(e?.currentTarget ?? null)
          : undefined,
      )
      break
    default:
      emit('toolClick', key)
  }
}

const tools = computed(() => {
  const aiOnline = props.aiOnline === true
  const devicesOnline = props.devicesOnline === true
  return [
    { key: 'history', icon: '/assets/img/s_record.png', tip: '历史记录' },
    { key: 'plc', icon: '/assets/img/s_turn.png', tip: '开关控制' },
    {
      key: 'ai',
      icon: aiOnline ? '/assets/img/ai_model_online.png' : '/assets/img/ai_model_offline.png',
      tip: aiOnline ? 'AI智能体连接状态：在线' : 'AI智能体连接状态：离线',
    },
    {
      key: 'device',
      icon: devicesOnline ? '/assets/img/s_connect.png' : '/assets/img/s_disconnect.png',
      tip: devicesOnline ? '设备连接状态：在线' : '设备连接状态：离线',
    },
    { key: 'user', icon: '/assets/img/usrmgr.png', tip: '用户管理' },
  ]
})
</script>

<template>
  <header class="app-header">
    <img class="logo" src="/assets/img/logo.png" alt="logo" />
    <h1 class="title">硚孝高速王母湖收费站绿通快检系统</h1>

    <div class="toolbar-frame">
      <button class="tool-btn stop-btn" title="急停" @click="emit('toolClick', 'stop')">
        <img src="/assets/img/a_stop.png" alt="急停" />
      </button>

      <button
        v-for="t in tools"
        :key="t.key"
        class="tool-btn"
        :title="t.tip"
        @click="handleToolClick(t.key, $event)"
      >
        <img :src="t.icon" :alt="t.tip" />
      </button>

      <!-- 对齐 Qt label_user：虚线框 + 下拉菜单 -->
      <div class="user-area" @click.stop="toggleUserMenu">
        <span class="user-name">{{ username || '系统管理员' }}</span>
        <div v-if="userMenuOpen" class="user-menu" @click.stop>
          <button type="button" class="user-menu-item" @click="onChangePassword">
            修改密码
          </button>
          <button type="button" class="user-menu-item" @click="onChangeUsr">
            切换班组
          </button>
          <button type="button" class="user-menu-item user-menu-logout" @click="onLogout">
            退出登录
          </button>
        </div>
      </div>
    </div>
  </header>

  <ChangePasswordDialog
    v-if="showChangePassword"
    @close="showChangePassword = false"
  />
  <ChangeUsrDialog
    v-if="showChangeUsr"
    @close="showChangeUsr = false"
  />
</template>

<style scoped lang="scss">
.app-header {
  display: flex;
  align-items: center;
  height: 72px;
  padding: 0 16px;
  background: #fff;
  border-bottom: 2px solid #5fbb9e;
  flex-shrink: 0;
  gap: 12px;
}

.logo {
  height: 48px;
  width: auto;
  object-fit: contain;
}

.title {
  font-size: 20px;
  font-weight: bold;
  color: #1a1a1a;
  white-space: nowrap;
  margin: 0;
  flex: 1;
}

.toolbar-frame {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.tool-btn {
  width: 36px;
  height: 36px;
  padding: 2px;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;

  img {
    width: 28px;
    height: 28px;
    object-fit: contain;
  }
  &:hover {
    background: #f0f0f0;
  }
}

.stop-btn img {
  width: 32px;
  height: 32px;
}

/* 对齐 Qt label_user stylesheet */
.user-area {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 12px;
  margin-left: 4px;
  cursor: pointer;
  border-left: 1px dashed #cccccc;
  border-right: 1px dashed #cccccc;
  user-select: none;

  .user-name {
    font-size: 12px;
    color: #999;
    font-weight: bold;
    white-space: nowrap;
  }
}

/* 对齐 Windows/Qt QMenu 外观 */
.user-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0;
  min-width: 120px;
  background: #f2f2f2;
  border: 1px solid #a0a0a0;
  box-shadow: 2px 2px 6px rgba(0, 0, 0, 0.18);
  z-index: 200;
  padding: 2px 0 2px 28px;
  /* 左侧浅灰条 — 对齐 Qt 菜单图标区 */
  background-image: linear-gradient(90deg, #e8e8e8 0, #e8e8e8 26px, #f2f2f2 26px);
}

.user-menu-item {
  display: block;
  width: 100%;
  padding: 6px 28px 6px 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  color: #222;
  text-align: left;
  white-space: nowrap;

  &:hover {
    background: #316ac5;
    color: #fff;
  }
}
</style>

<script setup lang="ts">
interface DeviceItem {
  key: string
  label: string
  icon: string
  iconOnline?: string
  online?: boolean
  status?: string
}

const devices: DeviceItem[] = [
  { key: 'light', label: '光幕', icon: '/assets/img/a_gj.png', iconOnline: '/assets/img/a_gj_online.png' },
  { key: 'gate', label: '闸机', icon: '/assets/img/a_zj.png', iconOnline: '/assets/img/a_zj_online.png' },
  { key: 'book', label: '预约', icon: '/assets/img/a_lc_offline.png', iconOnline: '/assets/img/a_lc_online.png' },
  { key: 'audit', label: '审核', icon: '/assets/img/a_sh.png' },
  { key: 'camera', label: '拍照', icon: '/assets/img/a_xj_offline.png', iconOnline: '/assets/img/a_xj_online.png' },
]

const xray200 = { kv: '--', ma: '--', temp: '--' }
const xray160 = { kv: '--', ma: '--', temp: '--' }
</script>

<template>
  <div class="device-bar">
    <div class="device-grid">
      <div v-for="d in devices" :key="d.key" class="device-item">
        <img
          :src="d.online && d.iconOnline ? d.iconOnline : d.icon"
          :alt="d.label"
          class="device-icon"
        />
        <span class="device-label">{{ d.label }}</span>
      </div>

      <div class="device-item xray-group">
        <img src="/assets/img/xray_offline.png" class="device-icon" alt="X光200" />
        <div class="xray-stats">
          <span>{{ xray200.kv }}-kV</span>
          <span>{{ xray200.ma }}-mA</span>
          <span>{{ xray200.temp }}-℃</span>
        </div>
      </div>

      <div class="device-item xray-group">
        <img src="/assets/img/xray_offline.png" class="device-icon" alt="X光160" />
        <div class="xray-stats">
          <span>{{ xray160.kv }}-kV</span>
          <span>{{ xray160.ma }}-mA</span>
          <span>{{ xray160.temp }}-°C</span>
        </div>
      </div>

      <div class="device-item">
        <img src="/assets/img/tempature_green.png" class="device-icon-sm" alt="DM温度" />
        <span class="device-label">DM温度</span>
      </div>

      <div class="device-item">
        <img src="/assets/img/a_camera_talk_gray.png" class="device-icon" alt="对讲" />
        <span class="device-label">对讲</span>
      </div>

      <div class="device-item plc-group">
        <span class="device-label">信号灯</span>
        <div class="plc-lights">
          <img src="/assets/img/a_plc_red.png" title="红灯" alt="红" />
          <img src="/assets/img/a_plc_yellow.png" title="黄灯" alt="黄" />
          <img src="/assets/img/a_plc_green.png" title="绿灯" alt="绿" />
          <img src="/assets/img/a_plc_greatlight_gray.png" title="补光灯" alt="补光" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.device-bar {
  padding: 6px 12px;
  background: #fff;
}

.device-grid {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  flex-wrap: wrap;
}

.device-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 48px;
}

.device-icon {
  width: 24px;
  height: 24px;
}

.device-icon-sm {
  width: 16px;
  height: 16px;
}

.device-label {
  font-size: 11px;
  font-weight: bold;
  color: #333;
  white-space: nowrap;
}

.xray-stats {
  display: flex;
  flex-direction: column;
  font-size: 10px;
  color: #666;
  line-height: 1.4;
}

.plc-group {
  .plc-lights {
    display: flex;
    gap: 4px;
    img {
      width: 20px;
      height: 20px;
    }
  }
}
</style>

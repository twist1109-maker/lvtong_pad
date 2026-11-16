<script setup lang="ts">
import PerimeterCameraPanel from '@/components/PerimeterCameraPanel.vue'
import { SAFE_CAMERA_WHEP_URL, SAFE_RIGHT_CAMERA_WHEP_URL } from '@/config/liveVideo'

const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <div class="camera-overlay" @click.self="emit('close')">
    <div class="perimeter-dialog" role="dialog" aria-modal="true" aria-label="周界监控" @click.stop>
      <h2>周界监控</h2>
      <div class="camera-grid">
        <PerimeterCameraPanel label="周界左" :whep-url="SAFE_CAMERA_WHEP_URL" />
        <PerimeterCameraPanel label="周界右" :whep-url="SAFE_RIGHT_CAMERA_WHEP_URL" />
      </div>
      <button type="button" class="close-button" @click="emit('close')">关闭</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.camera-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 45%);
}

.perimeter-dialog {
  width: min(1440px, 96vw);
  max-height: 94dvh;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 8px 20px 20px;
  border: 1px solid #5fbb9e;
  background: linear-gradient(180deg, #5fbb9e 0%, #f0f9f5 12%, #fff 100%);
  text-align: center;

  h2 { margin: 10px 0 18px; color: #2c3e50; font-size: 24px; }
}

.camera-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.close-button {
  width: 120px;
  margin-top: 18px;
  padding: 8px 12px;
  border: 0;
  border-radius: 4px;
  background: #ef4444;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

@media (max-width: 760px) {
  .camera-grid { grid-template-columns: minmax(0, 1fr); }
  .perimeter-dialog { padding: 8px 12px 12px; }
}
</style>

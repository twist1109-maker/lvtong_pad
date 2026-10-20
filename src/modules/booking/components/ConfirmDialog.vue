<script setup lang="ts">
defineProps<{
  title: string
  message: string
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <div class="confirm-overlay" @click.self="emit('cancel')">
    <div class="confirm-box" role="alertdialog" aria-modal="true">
      <h3 class="confirm-title">{{ title }}</h3>
      <p class="confirm-message">{{ message }}</p>
      <div class="confirm-actions">
        <button type="button" class="btn-no" @click="emit('cancel')">否</button>
        <button type="button" class="btn-yes" @click="emit('confirm')">是</button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}

.confirm-box {
  min-width: 320px;
  max-width: 420px;
  background: #fff;
  border-radius: 6px;
  padding: 20px 24px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  font-family: 'Microsoft YaHei', sans-serif;
}

.confirm-title {
  font-size: 16px;
  font-weight: bold;
  color: #2c3e50;
  margin-bottom: 12px;
}

.confirm-message {
  font-size: 14px;
  color: #555;
  margin-bottom: 20px;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-no,
.btn-yes {
  min-width: 72px;
  padding: 6px 16px;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
}

.btn-no {
  border: 1px solid #d0d0d0;
  background: #f5f5f5;
  color: #333;
}

.btn-yes {
  border: none;
  background: #1677ff;
  color: #fff;
}
</style>

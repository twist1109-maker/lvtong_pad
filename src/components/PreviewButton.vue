<script setup lang="ts">
defineProps<{
  label?: string
  /** 开关态高亮（如透视「渲染」伪彩开） */
  active?: boolean
}>()

const emit = defineEmits<{
  click: []
}>()
</script>

<template>
  <button class="preview-btn" :class="{ active }" @click="emit('click')">
    {{ label ?? '预览' }}
  </button>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.preview-btn {
  border: 2px solid $btn-preview-bg;
  border-radius: 10px;
  background: $btn-preview-bg;
  color: $btn-preview-text;
  padding: 2px 12px;
  font-weight: bold;
  font-size: 13px;
  min-height: 28px;
  transition: all 0.15s;
  &:hover {
    border-color: $btn-preview-text;
    background: #c2d8ff;
  }
  &.active {
    border-color: #c9662a;
    background: #e07a3a;
    color: #fff;
  }
  &.active:hover {
    background: #d06a2e;
    border-color: #b85a22;
  }
}
</style>

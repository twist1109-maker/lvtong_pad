<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  placeholder?: string
  imageUrl?: string
  /** 对齐 Qt label_body / label_transparent：72pt 水印 */
  large?: boolean
}>()

const displayText = ref(props.placeholder ?? '')

watch(
  () => props.imageUrl,
  (url) => {
    displayText.value = url ? '' : (props.placeholder ?? '')
  },
)
</script>

<template>
  <div class="eye-widget" :class="{ large }">
    <img v-if="imageUrl" :src="imageUrl" class="eye-image" alt="" />
    <span v-else class="eye-placeholder">{{ displayText }}</span>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.eye-widget {
  width: 100%;
  flex: 1;
  min-height: 0;
  background: #fff;
  border-bottom: 2px solid $border-color;
  border-radius: 0 0 12px 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
}

.eye-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.eye-placeholder {
  font-size: 28px;
  color: $text-placeholder;
}

.eye-widget.large .eye-placeholder {
  font-family: 'SimSun', '新宋体', serif;
  font-size: 72px;
  font-weight: bold;
  color: #bbb;
  line-height: 1;
  user-select: none;
}
</style>

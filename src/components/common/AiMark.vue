<script setup lang="ts">
withDefaults(defineProps<{ text?: string; title?: string }>(), {
  text: 'AI',
  title: '当前结果由AI识别，请核对',
})
</script>

<template>
  <span class="ai-mark" :title="title" :aria-label="title">{{ text }}</span>
</template>

<style scoped>
.ai-mark {
  display: inline-block;
  flex-shrink: 0;
  margin-left: 4px;
  padding: 0 3px;
  border-radius: 3px;
  background: #f0f6f2;
  color: #52856e;
  font-size: 10px;
  font-weight: 500;
  line-height: 16px;
  vertical-align: 1px;
  white-space: nowrap;
}
</style>

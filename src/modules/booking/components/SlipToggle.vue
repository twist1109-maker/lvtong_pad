<script setup lang="ts">
const checked = defineModel<boolean>({ default: true })
</script>

<template>
  <button
    type="button"
    class="slip-toggle"
    :class="{ 'is-checked': checked }"
    role="switch"
    :aria-checked="checked"
    @click="checked = !checked"
  >
    <span class="slip-thumb" />
  </button>
</template>

<style scoped lang="scss">
/* 对齐 Qt SlipButton：60×25，开=#ef4444，关=#e0e0e0 */
.slip-toggle {
  position: relative;
  width: 60px;
  height: 25px;
  border: none;
  border-radius: 999px;
  background: #e0e0e0;
  padding: 0;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.12s ease;

  &.is-checked {
    background: #ef4444;
  }
}

.slip-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 21px;
  height: 21px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  transition: transform 0.12s ease;
}

.is-checked .slip-thumb {
  transform: translateX(35px);
}
</style>

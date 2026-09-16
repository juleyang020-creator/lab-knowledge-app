<script setup lang="ts">
import { ref } from 'vue'
defineProps<{ selected?: 'professional' | 'patient' | null }>()
const emit = defineEmits<{ select: [audience: 'professional' | 'patient'] }>()
const professionalTab = ref<HTMLButtonElement>()
const patientTab = ref<HTMLButtonElement>()
function onKeydown(event: KeyboardEvent, current: 'professional' | 'patient'): void {
  if (
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)
  )
    return
  event.preventDefault()
  const next =
    event.key === 'Home'
      ? 'professional'
      : event.key === 'End'
        ? 'patient'
        : current === 'professional'
          ? 'patient'
          : 'professional'
  emit('select', next)
  ;(next === 'professional' ? professionalTab.value : patientTab.value)?.focus()
}
</script>

<template>
  <div class="audience-tabs" role="tablist" aria-label="选择阅读入口">
    <button
      ref="professionalTab"
      id="tab-professional"
      class="audience-tab"
      type="button"
      role="tab"
      aria-label="我是专业人士"
      aria-controls="audience-panel"
      :aria-selected="selected === 'professional'"
      :tabindex="!selected || selected === 'professional' ? 0 : -1"
      @keydown="onKeydown($event, 'professional')"
      @click="emit('select', 'professional')"
    >
      <span>我是专业人士</span><small>项目速查 · 临床参考</small>
    </button>
    <button
      ref="patientTab"
      id="tab-patient"
      class="audience-tab"
      type="button"
      role="tab"
      aria-label="我是患者"
      aria-controls="audience-panel"
      :aria-selected="selected === 'patient'"
      :tabindex="!selected || selected === 'patient' ? 0 : -1"
      @keydown="onKeydown($event, 'patient')"
      @click="emit('select', 'patient')"
    >
      <span>我是患者</span><small>看懂检查 · 就检准备</small>
    </button>
  </div>
</template>

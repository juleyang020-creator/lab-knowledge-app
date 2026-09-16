<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Audience } from '../domain/content'
import { buildFeedbackDraft } from '../domain/feedback'
const props = defineProps<{
  itemId: string
  itemName: string
  audience: Audience
  version: string
}>()
const note = ref('')
const result = ref('')
const fallback = ref(false)
const preview = computed(() =>
  note.value.trim() ? buildFeedbackDraft({ ...props, note: note.value }) : '',
)
function downloadDraft(): void {
  if (!preview.value) return
  try {
    const url = URL.createObjectURL(new Blob([preview.value], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `lab-feedback-${props.itemId}.txt`
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    result.value = '草稿已生成下载，尚未提交给维护者。'
  } catch {
    fallback.value = true
    result.value = '当前浏览器无法生成下载，请手动复制下方草稿。'
  }
}
</script>
<template>
  <section class="feedback-card">
    <details>
      <summary>生成纠错草稿</summary>
      <p>请勿填写患者信息。仅在本机生成文件，不会自动发送给医院或维护者。</p>
      <form @submit.prevent="downloadDraft">
        <label :for="`feedback-${itemId}`">不含患者信息的修改建议</label
        ><textarea
          :id="`feedback-${itemId}`"
          v-model="note"
          maxlength="1000"
          rows="4"
          placeholder="例如：这段说明需要补充具体文件依据。"
        /><button class="primary-button" type="submit" :disabled="!note.trim()">
          下载纠错草稿
        </button>
      </form>
      <p v-if="result" class="feedback-result" role="status">{{ result }}</p>
      <textarea
        v-if="fallback"
        class="feedback-preview"
        aria-label="可手动复制的纠错草稿"
        readonly
        :value="preview"
        rows="8"
      />
    </details>
  </section>
</template>

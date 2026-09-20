<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { Claim, SourceDocument } from '../domain/content'
const props = defineProps<{ claim: Claim; sources: SourceDocument[] }>()
const evidence = computed(() =>
  props.claim.provenance.kind === 'document' ? props.claim.provenance : null,
)
const source = computed(() => props.sources.find((entry) => entry.id === evidence.value?.sourceId))
const href = computed(() =>
  source.value?.asset && evidence.value?.pdfPage
    ? `${import.meta.env.BASE_URL}${source.value.asset}#page=${evidence.value.pdfPage}`
    : null,
)
const label = computed(() =>
  evidence.value?.manualLocation
    ? `文件依据 · 原书第 ${evidence.value.manualLocation.printedPages.join('、')} 页 · MD 第 ${evidence.value.manualLocation.line} 行`
    : `文件依据 · PDF 第 ${evidence.value?.pdfPage} 页`,
)
const title = computed(
  () =>
    `${source.value?.title ?? '来源待核对'} · ${source.value?.edition ?? ''} · ${label.value}\n${evidence.value?.quote ?? ''}`,
)
</script>
<template>
  <div class="claim-block" :data-provenance="claim.provenance.kind">
    <p class="claim-text">
      <span class="claim-content">{{ claim.text }}</span>
      <a
        v-if="href"
        class="citation-link"
        :href="href"
        target="_blank"
        rel="noopener noreferrer"
        :title="title"
        :aria-label="label"
        >文献 · p{{ evidence?.pdfPage }} ↗</a
      >
      <RouterLink
        v-else-if="evidence?.manualLocation"
        class="citation-link"
        :title="title"
        :aria-label="label"
        :to="{
          name: 'manual',
          query: { section: evidence.manualLocation.sectionId, line: evidence.manualLocation.line },
        }"
        >原文 ↗</RouterLink
      >
      <RouterLink
        v-else-if="evidence"
        class="citation-link"
        :title="title"
        :aria-label="label"
        :to="{ name: 'sources', query: { source: evidence.sourceId, page: evidence.pdfPage } }"
        >来源记录 ↗</RouterLink
      >
      <span v-else class="provenance-badge model">模型补充 · 待核实</span>
    </p>
  </div>
</template>

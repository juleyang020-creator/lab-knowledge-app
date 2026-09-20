<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { BookOpen, ArrowRight, Files } from '@lucide/vue'
import ErrorPanel from '../components/ErrorPanel.vue'
import {
  collectProfessionalClaims,
  collectProfessionalItemClaims,
  referenceClaims,
} from '../domain/validation'
import { evidenceStats } from '../domain/provenance'
import type { EvidenceStats } from '../domain/provenance'
import { useWorkspace } from '../state/workspace'
const workspace = useWorkspace()
const route = useRoute()
const baseUrl = import.meta.env.BASE_URL
const { state } = workspace
const stats = ref<EvidenceStats | null>(null)
const loading = ref(true)
async function load(): Promise<void> {
  loading.value = true
  try {
    stats.value =
      (await workspace.loadSourcesQA()) && state.qa
        ? evidenceStats(collectProfessionalClaims(state.qa.catalog, state.qa.professional))
        : null
  } finally {
    loading.value = false
  }
}
async function retry(): Promise<void> {
  loading.value = true
  try {
    stats.value =
      (await workspace.retrySourcesQA()) && state.qa
        ? evidenceStats(collectProfessionalClaims(state.qa.catalog, state.qa.professional))
        : null
  } finally {
    loading.value = false
  }
}
const rows = computed(() => {
  const bundle = state.qa
  if (!bundle) return []
  return bundle.catalog.items
    .filter((item) => !item.manual)
    .map((item) => ({
      item,
      stats: evidenceStats(
        collectProfessionalItemClaims(bundle.catalog, bundle.professional, item.id),
      ),
    }))
})
const otherModelCount = computed(() =>
  state.qa ? evidenceStats(referenceClaims(state.qa.professional)).model : 0,
)
watch([() => route.query.source, stats], async () => {
  if (!stats.value || typeof route.query.source !== 'string') return
  await nextTick()
  const target = document.getElementById(`source-${route.query.source}`)
  target?.focus({ preventScroll: true })
  target?.scrollIntoView({ block: 'start' })
})
onMounted(load)
</script>
<template>
  <header class="page-heading">
    <div>
      <span class="eyebrow">从试验内容，逐步走向文件依据</span>
      <h1>来源与补全进度</h1>
      <p>
        统计专业端说明段落，不包括手册全文的每个单元格；手册录入规模单列，不代表医学审核完成度。
      </p>
    </div>
  </header>
  <ErrorPanel v-if="state.qaError" :message="state.qaError" @retry="retry" />
  <div v-else-if="loading || !stats" class="loading-panel" role="status">正在汇总来源信息…</div>
  <template v-else>
    <section class="source-metrics" aria-label="医学说明来源统计">
      <div>
        <span>文件依据</span><strong data-testid="document-count">{{ stats.document }}</strong
        ><small>有文件与页码可定位</small>
      </div>
      <div class="model-metric">
        <span>模型补充</span><strong data-testid="model-count">{{ stats.model }}</strong
        ><small>仍待文件替换与核实</small>
      </div>
      <div>
        <span>医学说明段落</span><strong data-testid="claim-count">{{ stats.total }}</strong
        ><small>全部尚未医学审核</small>
      </div>
    </section>
    <section class="coverage-panel">
      <div>
        <h2>说明段落的文件覆盖</h2>
        <strong>{{ stats.percent }}%</strong>
      </div>
      <progress :value="stats.percent" max="100" aria-label="说明段落文件覆盖率" />
      <p>
        <strong>来源覆盖不等于医学准确率。</strong>
        本院业务信息的缺项另行保留，不计成模型生成的“本院事实”。
      </p>
    </section>
    <section class="source-library">
      <h2>本轮接入的文件</h2>
      <article
        v-for="source in state.catalog?.sources"
        :key="source.id"
        class="source-library-card"
        :id="`source-${source.id}`"
        tabindex="-1"
      >
        <BookOpen :size="22" aria-hidden="true" />
        <div>
          <strong>{{ source.title }} · {{ source.edition }}</strong>
          <p>
            {{ source.publisher }} · {{ source.year }} ·
            {{ source.manual ? '上传Markdown及原书页码定位，未核验原PDF' : '引文按PDF物理页定位' }}
          </p>
          <template v-if="source.manual">
            <small
              >全文已接入：{{ source.manual.sectionCount }} 个章节标题，{{
                source.manual.groups.length
              }}
              个检验分组，{{
                source.manual.groups.reduce((sum, group) => sum + group.count, 0)
              }}
              条有名称记录。原书空白行仅在全文保留；原文未校订。</small
            >
            <RouterLink class="manual-source-link" to="/manual">阅读完整手册</RouterLink>
            <ul>
              <li v-for="group in source.manual.groups" :key="group.id">
                {{ group.name }}：{{ group.count }} 条
              </li>
            </ul>
          </template>
          <small v-else>{{
            source.asset
              ? '完整原PDF已接入资料库；教材全文按章接入「读教材」模块。'
              : '尚未接入原文件。'
          }}</small>
          <a
            v-if="source.asset"
            class="text-link"
            :href="`${baseUrl}${source.asset}`"
            target="_blank"
            rel="noopener noreferrer"
            >打开原始PDF ↗</a
          >
        </div>
      </article>
    </section>
    <section class="coverage-items">
      <h2>通用教学项目的待补内容</h2>
      <p>原有通用教学项目的概述与专业说明合并统计；手册照录记录的规模见上方分组。</p>
      <div class="coverage-list">
        <div v-for="row in rows" :key="row.item.id" class="coverage-row">
          <RouterLink :to="`/items/${row.item.id}`"
            >{{ row.item.name }}<ArrowRight :size="15" aria-hidden="true"
          /></RouterLink>
          <div>
            <span class="document-text">文件 {{ row.stats.document }}</span
            ><span class="model-text">模型 {{ row.stats.model }}</span>
          </div>
        </div>
      </div>
      <p class="coverage-footnote">另有 {{ otherModelCount }} 段主题与指南内容属于模型补充。</p>
    </section>
    <section class="information-card replacement-note">
      <Files :size="22" aria-hidden="true" />
      <h2>怎样逐条替换？</h2>
      <p>
        在资料库找到依据，核对正文并记录来源、页码和短引文，再修改同一个段落的来源字段。不能只换标签、不核对内容。全文件模式会拒绝尚存的模型段落。
      </p>
    </section>
  </template>
</template>

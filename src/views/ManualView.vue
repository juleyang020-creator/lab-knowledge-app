<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { AudienceSchema } from '../domain/content'
import { MANUAL_ASSET, MANUAL_SOURCE_ID, manualBlocks, manualText } from '../domain/manual'
import type { ManualSection } from '../domain/manual'
import { loadManual } from '../adapters/manualRepository'
import ManualInline from '../components/ManualInline.vue'
import ErrorPanel from '../components/ErrorPanel.vue'
import { useWorkspace } from '../state/workspace'

const route = useRoute()
const router = useRouter()
const { state } = useWorkspace()
const audience = computed(() => AudienceSchema.parse(route.params.audience))
const source = computed(() => state.catalog?.sources.find((entry) => entry.id === MANUAL_SOURCE_ID))
const sections = ref<ManualSection[]>([])
const error = ref('')
const loading = ref(true)
let controller: AbortController | undefined
async function load(): Promise<void> {
  controller?.abort()
  const current = new AbortController()
  controller = current
  error.value = ''
  loading.value = true
  sections.value = []
  try {
    if (!source.value) throw new Error('目录中尚未接入此手册')
    const loaded = await loadManual(import.meta.env.BASE_URL, source.value, current.signal)
    if (!current.signal.aborted) sections.value = loaded
  } catch (cause) {
    if (!current.signal.aborted)
      error.value = cause instanceof Error ? cause.message : '手册加载失败，请重试'
  } finally {
    if (!current.signal.aborted) loading.value = false
  }
}
const selectedId = computed(() =>
  typeof route.query.section === 'string' ? route.query.section : 'cover',
)
const selected = computed(() => sections.value.find((section) => section.id === selectedId.value))
const blocks = computed(() => (selected.value ? manualBlocks(selected.value) : []))
const selectedIndex = computed(() =>
  sections.value.findIndex((section) => section.id === selected.value?.id),
)
const downloadUrl = `${import.meta.env.BASE_URL}content/${MANUAL_ASSET}`
const query = computed({
  get: () => (typeof route.query.q === 'string' ? route.query.q : ''),
  set: (q: string) => {
    void router.replace({ query: { ...route.query, q: q || undefined } })
  },
})
const normalized = (text: string) => text.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, '')
const searchIndex = computed(() =>
  sections.value.map((section) => ({ section, text: normalized(manualText(section.markdown)) })),
)
const searchResults = computed(() => {
  const words = query.value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  return words.length
    ? searchIndex.value
        .filter((entry) => words.every((word) => entry.text.includes(word)))
        .map((entry) => entry.section)
    : []
})
const itemByLine = computed(
  () =>
    new Map(
      (state.catalog?.items ?? [])
        .filter((item) => item.manual)
        .map((item) => [item.manual!.location.line, item.id]),
    ),
)
function selectSection(id: string): void {
  void router.push({ query: { ...route.query, section: id, line: undefined } })
}
watch(
  () => [selected.value?.id, route.query.line],
  async () => {
    await nextTick()
    const line =
      typeof route.query.line === 'string' && /^\d+$/.test(route.query.line) ? route.query.line : ''
    const target =
      (line ? document.getElementById(`manual-line-${line}`) : null) ??
      document.getElementById('manual-section-title')
    if (!target) return
    target.style.scrollMarginTop = `${(document.querySelector('.top-shell')?.getBoundingClientRect().height ?? 0) + 16}px`
    target.focus({ preventScroll: true })
    target.scrollIntoView({ block: 'start' })
  },
)
onMounted(load)
onBeforeUnmount(() => controller?.abort())
</script>
<template>
  <header class="page-heading">
    <div>
      <span class="eyebrow">首都医科大学宣武医院检验科 · 原文阅读</span>
      <h1>2026标本采集手册</h1>
      <p>
        封面、目录、前言、采集方法、常见问题及检验项目表全部保留。依据上传的Markdown，页码沿用原书，未核验原PDF。
      </p>
    </div>
  </header>
  <p class="manual-notice">
    <strong v-if="audience === 'patient'">专业手册原文，不是患者自行操作指南。</strong>
    原文中的疑似错字、参考区间及医学表述未校订，不能作为个体诊断或自行停药、采样的依据；业务要求仅代表原手册所述机构。
  </p>
  <a class="back-link" :href="downloadUrl" download>下载完整原文（Markdown）</a>
  <ErrorPanel v-if="error" :message="error" @retry="load" />
  <div v-else-if="loading" class="loading-panel" role="status">正在加载完整手册…</div>
  <template v-else>
    <section class="manual-controls" aria-label="手册导航与检索">
      <label
        >手册章节
        <select
          :value="selectedId"
          aria-label="手册章节"
          @change="selectSection(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="section in sections" :key="section.id" :value="section.id">
            {{ '　'.repeat(Math.max(0, section.level - 2)) }}{{ section.title
            }}{{
              section.printedPages.length ? ` · 原书 ${section.printedPages.join('、')} 页` : ''
            }}
          </option>
        </select>
      </label>
      <label
        >全文搜索<input
          v-model="query"
          type="search"
          aria-label="搜索手册全文"
          placeholder="搜索标题、正文和表格内容"
          maxlength="100"
      /></label>
      <nav class="manual-shortcuts" aria-label="手册主要章节">
        <RouterLink
          v-for="section in sections.filter((entry) => entry.level <= 2)"
          :key="section.id"
          :to="{ query: { section: section.id } }"
          >{{ section.id === 'cover' ? '封面' : section.title }}</RouterLink
        >
      </nav>
    </section>
    <section v-if="query.trim()" class="manual-search-results" aria-label="全文搜索结果">
      <p role="status">全文找到 {{ searchResults.length }} 个章节</p>
      <ul>
        <li v-for="section in searchResults" :key="section.id">
          <RouterLink :to="{ query: { ...route.query, section: section.id, line: undefined } }">{{
            section.title
          }}</RouterLink>
          <small>MD {{ section.lineStart }}—{{ section.lineEnd }} 行</small>
        </li>
      </ul>
    </section>
    <article v-if="selected" class="manual-reading content-section">
      <h2 id="manual-section-title" tabindex="-1">{{ selected.title }}</h2>
      <p class="manual-location">
        原文 MD 第 {{ selected.lineStart }}—{{ selected.lineEnd }} 行<span
          v-if="selected.printedPages.length"
        >
          · 原书第 {{ selected.printedPages.join('、') }} 页</span
        >
      </p>
      <template v-for="block in blocks" :key="block.line">
        <p v-if="block.kind === 'paragraph'" :id="`manual-line-${block.line}`" tabindex="-1">
          <ManualInline :text="block.text" :audience="audience" />
        </p>
        <div
          v-else
          class="manual-table-scroll"
          role="region"
          :aria-label="`${selected.title}原文表格，可横向滚动`"
          tabindex="0"
        >
          <table class="manual-table">
            <caption>
              {{
                selected.title
              }}
              · 原文表格（空白未补填）
            </caption>
            <thead>
              <tr>
                <th v-for="(header, column) in block.headers" :key="column" scope="col">
                  <ManualInline :text="header" :audience="audience" />
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in block.rows"
                :id="`manual-line-${row.line}`"
                :key="row.line"
                tabindex="-1"
                :class="{ 'manual-target-row': String(row.line) === route.query.line }"
              >
                <td v-for="(cell, column) in row.cells" :key="column">
                  <RouterLink
                    v-if="column === 0 && itemByLine.has(row.line)"
                    :to="{ name: 'item', params: { audience, itemId: itemByLine.get(row.line) } }"
                    ><ManualInline :text="cell" :audience="audience"
                  /></RouterLink>
                  <ManualInline v-else-if="manualText(cell)" :text="cell" :audience="audience" />
                  <span v-else class="manual-empty">原文空白</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      <p v-if="!blocks.length" class="manual-location">
        本节为章节标题，请从目录继续阅读下属小节。
      </p>
      <nav class="manual-pagination" aria-label="按原书顺序阅读">
        <button
          type="button"
          :disabled="selectedIndex <= 0"
          @click="selectSection(sections[selectedIndex - 1]!.id)"
        >
          上一节
        </button>
        <span>{{ selectedIndex + 1 }} / {{ sections.length }}</span>
        <button
          type="button"
          :disabled="selectedIndex >= sections.length - 1"
          @click="selectSection(sections[selectedIndex + 1]!.id)"
        >
          下一节
        </button>
      </nav>
    </article>
    <section v-else class="empty-panel">
      <h2>未找到这个章节</h2>
      <button class="primary-button" type="button" @click="selectSection('cover')">
        返回手册封面
      </button>
    </section>
  </template>
</template>

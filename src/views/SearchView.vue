<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { MANUAL_SOURCE_ID, manualBlocks, manualText } from '../domain/manual'
import type { ManualSection } from '../domain/manual'
import { loadManual } from '../adapters/manualRepository'
import { filterCatalog } from '../domain/search'
import type { CatalogItem } from '../domain/content'
import type { BookSearchEntry } from '../domain/book'
import { useWorkspace } from '../state/workspace'

const route = useRoute()
const workspace = useWorkspace()
const { state } = workspace

const q = computed(() => (typeof route.query.q === 'string' ? route.query.q : '').trim())
const scope = computed(() => (typeof route.query.scope === 'string' ? route.query.scope : 'all'))
const words = computed(() =>
  q.value.normalize('NFKC').toLocaleLowerCase().split(/\s+/).filter(Boolean),
)
const hasWords = computed(() => words.value.length > 0)
const containsAll = (text: string) => {
  const normalized = text.normalize('NFKC').toLocaleLowerCase()
  return words.value.every((word) => normalized.includes(word))
}

/* 项目命中 */
const itemHits = computed<CatalogItem[]>(() =>
  hasWords.value && scope.value === 'all'
    ? filterCatalog(state.catalog?.items ?? [], q.value).slice(0, 30)
    : [],
)

/* 手册命中（块级，带原表行号） */
const manualSections = ref<ManualSection[] | null>(null)
const manualError = ref('')
let manualLoading = false
async function ensureManual(): Promise<void> {
  if (manualSections.value || manualLoading) return
  const source = state.catalog?.sources.find((entry) => entry.id === MANUAL_SOURCE_ID)
  if (!source) return
  manualLoading = true
  try {
    manualSections.value = await loadManual(import.meta.env.BASE_URL, source)
  } catch {
    manualError.value = '手册全文加载失败，手册检索暂不可用。'
  } finally {
    manualLoading = false
  }
}
interface ManualHit {
  section: ManualSection
  line: number
  text: string
}
const manualHits = computed<ManualHit[]>(() => {
  if (!hasWords.value || !manualSections.value || scope.value === 'books') return []
  const hits: ManualHit[] = []
  for (const section of manualSections.value)
    for (const block of manualBlocks(section)) {
      const lines =
        block.kind === 'table'
          ? block.rows.map((row) => ({ line: row.line, text: row.cells.join(' / ') }))
          : [{ line: block.line, text: block.text }]
      for (const entry of lines) {
        const text = manualText(entry.text)
        if (text && containsAll(text)) hits.push({ section, line: entry.line, text })
      }
      if (hits.length >= 40) return hits
    }
  return hits
})

/* 教材命中（逐行索引） */
interface BookHit extends BookSearchEntry {
  bookId: string
  bookTitle: string
  chapterTitle: string
}
const bookIndexes = ref<Map<string, BookSearchEntry[]> | null>(null)
const booksError = ref('')
let booksLoading = false
async function ensureBooks(): Promise<void> {
  if (bookIndexes.value || booksLoading) return
  booksLoading = true
  try {
    if (!(await workspace.loadBooks())) throw new Error('manifest')
    const entries = await Promise.all(
      (state.books?.books ?? []).map(async (book): Promise<[string, BookSearchEntry[]]> => [
        book.id,
        await workspace.getBookSearch(book.id),
      ]),
    )
    bookIndexes.value = new Map(entries)
  } catch {
    booksError.value = '教材检索索引加载失败。本机首次使用请先运行 pnpm books:import。'
  } finally {
    booksLoading = false
  }
}
const bookHits = computed<BookHit[]>(() => {
  if (!hasWords.value || !bookIndexes.value || !state.books || scope.value === 'manual') return []
  const hits: BookHit[] = []
  for (const book of state.books.books) {
    const entries = bookIndexes.value.get(book.id) ?? []
    for (const entry of entries) {
      if (!containsAll(entry.t)) continue
      hits.push({
        ...entry,
        bookId: book.id,
        bookTitle: book.title,
        chapterTitle: book.chapters.find((chapter) => chapter.id === entry.c)?.title ?? entry.c,
      })
      if (hits.length >= 60) return hits
    }
  }
  return hits
})

watch(
  q,
  () => {
    if (!hasWords.value) return
    if (scope.value !== 'books') void ensureManual()
    if (scope.value !== 'manual') void ensureBooks()
  },
  { immediate: true },
)
const searching = computed(
  () =>
    hasWords.value &&
    (!manualSections.value || !bookIndexes.value) &&
    !manualError.value &&
    !booksError.value,
)
</script>

<template>
  <header class="page-heading">
    <h1>全库搜索</h1>
    <span v-if="q" class="items-count">「{{ q }}」</span>
  </header>
  <section v-if="!q" class="empty-panel">
    <h2>输入关键词开始检索</h2>
    <p>同时查项目目录、采集手册全文与六本教材原文；多个词用空格分隔，须全部命中。</p>
  </section>
  <template v-else>
    <p class="knowledge-muted">
      检索范围：{{
        itemHits.length ? `${itemHits.length} 个项目` : '项目'
      }}、手册全文、教材原文逐行索引。OCR 原文未逐字校对，命中内容请回查原书。
    </p>
    <div v-if="searching" class="loading-panel" role="status">正在检索手册与教材全文…</div>
    <p v-if="manualError" class="knowledge-muted">{{ manualError }}</p>
    <p v-if="booksError" class="knowledge-muted">{{ booksError }}</p>

    <section v-if="itemHits.length" class="search-group" aria-label="项目命中">
      <h2>检验项目（{{ itemHits.length }}）</h2>
      <ul class="search-hit-list">
        <li v-for="item in itemHits" :key="item.id">
          <RouterLink :to="{ name: 'item', params: { itemId: item.id } }"
            ><strong>{{ item.name }}</strong></RouterLink
          >
          <span v-if="item.abbreviation" class="abbreviation">{{ item.abbreviation }}</span>
          <small>{{ item.category }}</small>
        </li>
      </ul>
    </section>

    <section v-if="manualHits.length" class="search-group" aria-label="手册命中">
      <h2>采集手册（{{ manualHits.length }}{{ manualHits.length >= 40 ? '+' : '' }}）</h2>
      <ul class="search-hit-list">
        <li v-for="hit in manualHits" :key="`m-${hit.line}`">
          <RouterLink
            :to="{ name: 'manual', query: { section: hit.section.id, line: hit.line } }"
            >{{ hit.text.slice(0, 120) }}</RouterLink
          >
          <small>{{ hit.section.title }} · MD 第 {{ hit.line }} 行</small>
        </li>
      </ul>
    </section>

    <section v-if="bookHits.length" class="search-group" aria-label="教材命中">
      <h2>教材原文（{{ bookHits.length }}{{ bookHits.length >= 60 ? '+' : '' }}）</h2>
      <ul class="search-hit-list">
        <li v-for="(hit, index) in bookHits" :key="`b-${index}`">
          <RouterLink
            :to="{
              name: 'chapter',
              params: { bookId: hit.bookId, chapterId: hit.c },
              query: { line: hit.l },
            }"
            >{{ hit.t.slice(0, 120) }}</RouterLink
          >
          <small>{{ hit.bookTitle }} · {{ hit.chapterTitle }} · MD 第 {{ hit.l }} 行</small>
        </li>
      </ul>
    </section>

    <section
      v-if="!searching && !itemHits.length && !manualHits.length && !bookHits.length"
      class="empty-panel"
    >
      <h2>没有找到「{{ q }}」</h2>
      <p>换个词试试；教材为 OCR 原文，异体字或多余空格会影响命中。</p>
    </section>
  </template>
</template>

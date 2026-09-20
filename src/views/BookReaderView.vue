<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search } from '@lucide/vue'
import ErrorPanel from '../components/ErrorPanel.vue'
import ManualInline from '../components/ManualInline.vue'
import type { BookItemsPayload, BookSearchEntry, ChapterContent } from '../domain/book'
import { chapterCatalogRelations } from '../domain/book'
import { useWorkspace } from '../state/workspace'

const route = useRoute()
const router = useRouter()
const workspace = useWorkspace()
const { state } = workspace

const bookId = computed(() => (typeof route.params.bookId === 'string' ? route.params.bookId : ''))
const chapterId = computed(() =>
  typeof route.params.chapterId === 'string' ? route.params.chapterId : '',
)
const book = computed(() => state.books?.books.find((entry) => entry.id === bookId.value) ?? null)
const chapterMeta = computed(
  () => book.value?.chapters.find((chapter) => chapter.id === chapterId.value) ?? null,
)

const chapter = ref<ChapterContent | null>(null)
const bookItems = ref<BookItemsPayload | null>(null)
const error = ref('')
const loading = ref(false)
let loadSeq = 0
async function loadChapter(): Promise<void> {
  chapter.value = null
  bookItems.value = null
  error.value = ''
  if (!bookId.value || !chapterId.value) return
  const seq = ++loadSeq
  loading.value = true
  try {
    const [content, items] = await Promise.all([
      workspace.getChapter(bookId.value, chapterId.value),
      workspace.getBookItems(bookId.value).catch(() => null),
    ])
    if (seq !== loadSeq) return
    chapter.value = content
    bookItems.value = items
  } catch {
    if (seq === loadSeq)
      error.value =
        '章节内容加载失败。本机首次使用教材阅读请先运行 pnpm books:import 生成内容文件。'
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

/* 本章教材条目反向命中的目录项目（名称键精确匹配，同键多条全列） */
const catalogRelations = computed(() =>
  chapterCatalogRelations(chapterId.value, bookItems.value, state.catalog?.items ?? []),
)

/* 书内检索 */
const bookQuery = ref('')
const searchEntries = ref<BookSearchEntry[] | null>(null)
async function ensureSearch(): Promise<void> {
  if (searchEntries.value || !bookId.value) return
  try {
    searchEntries.value = await workspace.getBookSearch(bookId.value)
  } catch {
    searchEntries.value = []
  }
}
const bookResults = computed(() => {
  const words = bookQuery.value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!words.length || !searchEntries.value) return []
  return searchEntries.value
    .filter((entry) =>
      words.every((word) => entry.t.normalize('NFKC').toLocaleLowerCase().includes(word)),
    )
    .slice(0, 60)
})

const chapterIndex = computed(
  () => book.value?.chapters.findIndex((entry) => entry.id === chapterId.value) ?? -1,
)
function goChapter(id: string): void {
  void router.push({
    name: 'chapter',
    params: { bookId: bookId.value, chapterId: id },
  })
  bookQuery.value = ''
}
function goResult(entry: BookSearchEntry): void {
  void router.push({
    name: 'chapter',
    params: { bookId: bookId.value, chapterId: entry.c },
    query: { line: entry.l },
  })
}
/** 查询行可能落在标题/注释行上：高亮并滚动到其后最近的正文块 */
const highlightLine = ref<number | null>(null)
function resolveHighlight(): number | null {
  const requested =
    typeof route.query.line === 'string' && /^\d+$/.test(route.query.line)
      ? Number(route.query.line)
      : null
  if (!requested || !chapter.value) return null
  const candidates = chapter.value.sections
    .flatMap((section) => section.blocks)
    .flatMap((block) => (block.kind === 'table' ? block.rows.map((row) => row.line) : [block.line]))
    .sort((a, b) => a - b)
  return candidates.find((line) => line >= requested) ?? requested
}
async function scrollToLine(): Promise<void> {
  await nextTick()
  highlightLine.value = resolveHighlight()
  const target =
    (highlightLine.value ? document.getElementById(`L${highlightLine.value}`) : null) ??
    document.getElementById('chapter-title')
  if (!target) return
  target.style.scrollMarginTop = `${(document.querySelector('.topbar')?.getBoundingClientRect().height ?? 0) + 12}px`
  target.scrollIntoView({ block: 'start' })
}

/* 页码跳转：找该 PDF 页起始注释之后最近的正文行 */
function jumpToPage(page: number): void {
  if (!chapter.value) return
  const marker = chapter.value.pageMarkers.find((entry) => entry.pdfPage === page)
  if (marker) void router.replace({ query: { ...route.query, line: marker.line + 1 } })
}

watch(
  () => [bookId.value, chapterId.value],
  async () => {
    await workspace.loadBooks()
    searchEntries.value = null
    await loadChapter()
    await scrollToLine()
  },
  { immediate: true },
)
watch(
  () => route.query.line,
  () => void scrollToLine(),
)
onMounted(() => void workspace.loadBooks())
</script>

<template>
  <div class="book-reader">
    <template v-if="book">
      <header class="reader-head">
        <span class="eyebrow">{{ book.title }} · {{ book.edition }}</span>
        <h1 v-if="chapterMeta" id="chapter-title" tabindex="-1">{{ chapterMeta.title }}</h1>
        <h1 v-else id="chapter-title">{{ book.title }}</h1>
        <p v-if="chapterMeta" class="knowledge-muted">
          {{ chapterMeta.part || '章节' }} · 原文 {{ chapterMeta.lines }} 行 · 原书 PDF 第
          {{ chapter?.pdfPages[0] }}—{{ chapter?.pdfPages.at(-1) }} 页
        </p>
      </header>

      <section class="reader-controls" aria-label="章内检索与跳页">
        <label class="reader-chapter-select"
          >本章
          <select
            :value="chapterId"
            aria-label="选择章节"
            @change="goChapter(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="entry in book.chapters" :key="entry.id" :value="entry.id">
              {{ entry.title }}
            </option>
          </select>
        </label>
        <label class="reader-page-select" v-if="chapter?.pdfPages.length"
          >跳页
          <select
            aria-label="按原书 PDF 页跳转"
            @change="jumpToPage(Number(($event.target as HTMLSelectElement).value))"
          >
            <option value="" selected disabled>PDF 页</option>
            <option v-for="page in chapter.pdfPages" :key="page" :value="page">
              PDF 第 {{ page }} 页
            </option>
          </select>
        </label>
        <div class="search-field reader-search">
          <Search :size="16" aria-hidden="true" />
          <input
            v-model="bookQuery"
            type="search"
            aria-label="本书内检索"
            placeholder="在本书内检索…"
            maxlength="60"
            autocomplete="off"
            @focus="ensureSearch"
          />
        </div>
      </section>
      <section v-if="bookQuery.trim()" class="manual-search-results" aria-label="书内检索结果">
        <p role="status">
          本书找到 {{ bookResults.length }} 处{{ bookResults.length >= 60 ? '（仅列前 60）' : '' }}
        </p>
        <ul>
          <li v-for="(entry, index) in bookResults" :key="index">
            <button type="button" class="text-link" @click="goResult(entry)">
              {{ entry.t }}
            </button>
            <small
              >{{ book.chapters.find((entry2) => entry2.id === entry.c)?.title }} · MD 第
              {{ entry.l }} 行</small
            >
          </li>
        </ul>
      </section>

      <ErrorPanel v-if="error" :message="error" @retry="loadChapter" />
      <div v-else-if="loading" class="loading-panel" role="status">正在加载章节…</div>
      <template v-else-if="chapter">
        <nav
          v-if="catalogRelations.length"
          class="chapter-relations"
          aria-label="本章相关检验项目"
        >
          <span class="chapter-relations-label">本章相关检验项目</span>
          <RouterLink
            v-for="relation in catalogRelations"
            :key="relation.id"
            class="chapter-relation-link"
            :to="{ name: 'item', params: { itemId: relation.id } }"
          >
            {{ relation.name }}<small v-if="relation.abbreviation">{{ relation.abbreviation }}</small>
          </RouterLink>
        </nav>
        <article class="manual-reading content-section chapter-body">
        <template v-for="section in chapter.sections" :key="section.id">
          <h2
            v-if="section.title && section.title !== chapterMeta?.title"
            class="chapter-section-heading"
          >
            {{ section.title }}
          </h2>
          <template v-for="block in section.blocks" :key="block.line">
            <p
              v-if="block.kind === 'paragraph'"
              :id="`L${block.line}`"
              class="chapter-paragraph"
              :class="{ 'manual-target-row': block.line === highlightLine }"
              tabindex="-1"
            >
              <ManualInline :text="block.text" />
            </p>
            <div
              v-else
              class="manual-table-scroll"
              role="region"
              :aria-label="`原文表格（第 ${block.line} 行起），可横向滚动`"
              tabindex="0"
            >
              <table class="manual-table">
                <thead>
                  <tr>
                    <th v-for="(header, column) in block.headers" :key="column" scope="col">
                      <ManualInline :text="header" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in block.rows"
                    :id="`L${row.line}`"
                    :key="row.line"
                    :class="{ 'manual-target-row': row.line === highlightLine }"
                  >
                    <td v-for="(cell, column) in row.cells" :key="column">
                      <ManualInline :text="cell" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </template>
        <nav class="manual-pagination" aria-label="按原书顺序阅读">
          <button
            type="button"
            :disabled="chapterIndex <= 0"
            @click="goChapter(book.chapters[chapterIndex - 1]!.id)"
          >
            上一章
          </button>
          <span>{{ chapterIndex + 1 }} / {{ book.chapters.length }}</span>
          <button
            type="button"
            :disabled="chapterIndex >= book.chapters.length - 1"
            @click="goChapter(book.chapters[chapterIndex + 1]!.id)"
          >
            下一章
          </button>
        </nav>
        </article>
      </template>
      <section v-else class="empty-panel">
        <h2>从左侧目录选择一章开始阅读</h2>
        <p>共 {{ book.chapters.length }} 章；窄屏点左上角 ☰ 打开目录。</p>
      </section>
    </template>
    <ErrorPanel
      v-else-if="state.booksError"
      :message="state.booksError"
      @retry="workspace.loadBooks"
    />
    <div v-else class="loading-panel" role="status">正在加载教材目录…</div>
  </div>
</template>

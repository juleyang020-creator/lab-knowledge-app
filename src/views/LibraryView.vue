<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import ErrorPanel from '../components/ErrorPanel.vue'
import { LibrarySchema } from '../domain/library'
import type { Library } from '../domain/library'
import '../library.css'
const PdfPage = defineAsyncComponent(() => import('../components/PdfPage.vue'))
const route = useRoute()
const router = useRouter()
const library = ref<Library | null>(null)
const error = ref('')
let controller: AbortController | undefined
async function load(): Promise<void> {
  controller?.abort()
  const request = new AbortController()
  controller = request
  error.value = ''
  library.value = null
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}library/index.json`, {
      signal: request.signal,
      cache: 'no-store',
    })
    if (!response.ok) throw new Error('目录读取失败')
    const result = LibrarySchema.parse(await response.json())
    if (!request.signal.aborted) library.value = result
  } catch {
    if (!request.signal.aborted) error.value = '资料库目录加载失败或版本不一致，请重试。'
  }
}
onMounted(load)
onBeforeUnmount(() => controller?.abort())
const query = computed({
  get: () => (typeof route.query.q === 'string' ? route.query.q : ''),
  set: (q: string) => void router.replace({ query: { q: q || undefined } }),
})
const books = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  return (
    library.value?.documents.filter(
      (book) =>
        !needle ||
        `${book.title} ${book.outline.map((entry) => entry.title).join(' ')}`
          .toLocaleLowerCase()
          .includes(needle),
    ) ?? []
  )
})
const book = computed(() =>
  library.value?.documents.find((entry) => entry.id === route.params.documentId),
)
const page = computed(() =>
  route.query.page === undefined
    ? 1
    : typeof route.query.page === 'string' && /^\d+$/.test(route.query.page)
      ? Number(route.query.page)
      : NaN,
)
const validPage = computed(
  () =>
    Number.isSafeInteger(page.value) && page.value >= 1 && page.value <= (book.value?.pages ?? 0),
)
const pageInput = ref('1')
watch(
  () => [route.params.documentId, route.query.page],
  () => {
    pageInput.value = String(page.value)
  },
  { immediate: true },
)
function goToPage(value: string | number): void {
  void router.push({ query: { ...route.query, page: String(value) } })
}
const original = computed(() =>
  book.value
    ? `${import.meta.env.BASE_URL}${book.value.asset}#page=${validPage.value ? page.value : 1}`
    : '',
)
</script>
<template>
  <header class="page-heading directory-heading">
    <h1>{{ book?.title ?? (route.params.documentId && library ? '未找到这份资料' : '资料库') }}</h1>
    <span v-if="library && !route.params.documentId" class="directory-count"
      >{{ library.totals.documents }}份 · {{ library.totals.pages }}页</span
    >
  </header>
  <ErrorPanel v-if="error" :message="error" @retry="load" />
  <p v-else-if="!library" role="status">正在加载资料目录…</p>
  <template v-else-if="!route.params.documentId">
    <div class="search-panel">
      <div class="search-field">
        <input
          v-model="query"
          type="search"
          aria-label="搜索书名或章节"
          placeholder="搜索书名或章节"
          maxlength="100"
          autocomplete="off"
        />
      </div>
    </div>
    <p class="library-scope">完整原文件已接入；此处检索书名和目录，不是教材全文检索。</p>
    <article v-for="entry in books" :key="entry.id" class="library-book">
      <h2>
        <RouterLink
          :to="{ name: 'library-document', params: { documentId: entry.id }, query: route.query }"
          >{{ entry.title }}</RouterLink
        >
      </h2>
      <span
        >{{ entry.edition }} · {{ entry.pages }}页 ·
        {{ (entry.bytes / 1024 / 1024).toFixed(1) }} MB</span
      >
      <small>{{ entry.imageOnly ? '扫描版 · 未做OCR' : '原文件阅读 · 尚未逐项结构化' }}</small>
      <RouterLink
        class="text-link"
        :to="{ name: 'library-document', params: { documentId: entry.id }, query: route.query }"
        >阅读原文件 →</RouterLink
      >
    </article>
    <p v-if="!books.length" class="library-scope">
      书名和目录中没有匹配项；不代表正文没有相关内容。
    </p>
  </template>
  <template v-else-if="book">
    <div class="library-links">
      <RouterLink class="text-link" :to="{ name: 'library', query: { q: route.query.q } }"
        >返回资料库</RouterLink
      >
      <a class="text-link" :href="original" target="_blank" rel="noopener noreferrer"
        >打开原始PDF</a
      >
      <RouterLink v-if="book.id === 'xwh-manual-2026'" class="text-link" to="/professional/manual"
        >手册文字版与全文检索</RouterLink
      >
    </div>
    <div class="pdf-controls">
      <button type="button" :disabled="!validPage || page <= 1" @click="goToPage(page - 1)">
        上一页
      </button>
      <form @submit.prevent="goToPage(pageInput)">
        <label
          ><span class="sr-only">PDF物理页码</span
          ><input
            v-model="pageInput"
            type="number"
            min="1"
            :max="book.pages"
            aria-label="PDF物理页码"
            required
        /></label>
        <span>/ {{ book.pages }}</span
        ><button type="submit">跳转</button>
      </form>
      <button
        type="button"
        :disabled="!validPage || page >= book.pages"
        @click="goToPage(page + 1)"
      >
        下一页
      </button>
    </div>
    <details v-if="book.outline.length" class="library-outline">
      <summary>章节目录 · {{ book.outline.length }}</summary>
      <ul>
        <li
          v-for="(entry, index) in book.outline"
          :key="index"
          :class="{ 'outline-child': entry.level > 1 }"
        >
          <RouterLink :to="{ query: { ...route.query, page: entry.page } }"
            >{{ entry.title }} <span>p{{ entry.page }}</span></RouterLink
          >
        </li>
      </ul>
    </details>
    <p v-if="!validPage" role="alert">页码无效，请输入1到{{ book.pages }}之间的PDF物理页码。</p>
    <PdfPage v-else :key="book.id" :book="book" :page="page" />
    <p class="library-scope">
      {{ book.edition }} · PDF物理页码可能与印刷页码不同。{{
        book.imageOnly ? '本书为扫描版，未完成文字检索。' : ''
      }}原文件仅供专业查阅，未由本软件医学校订。
    </p>
  </template>
  <RouterLink v-else class="text-link" to="/library">返回资料库</RouterLink>
</template>

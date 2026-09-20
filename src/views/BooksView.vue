<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { BookOpen, Files, SquareArrowOutUpRight } from '@lucide/vue'
import ErrorPanel from '../components/ErrorPanel.vue'
import { useWorkspace } from '../state/workspace'

const workspace = useWorkspace()
const { state } = workspace
const books = computed(() => state.books?.books ?? [])
const totalChapters = computed(() =>
  books.value.reduce((sum, book) => sum + book.chapters.length, 0),
)
const totalLines = computed(() =>
  books.value.reduce(
    (sum, book) => sum + book.chapters.reduce((acc, chapter) => acc + chapter.lines, 0),
    0,
  ),
)
onMounted(() => {
  void workspace.loadBooks()
})
</script>

<template>
  <header class="page-heading">
    <h1>教材全文阅读</h1>
    <span class="items-count">{{ books.length }} 本书 · {{ totalChapters }} 章</span>
  </header>
  <p class="knowledge-muted shelf-note">
    原文按章照录（共 {{ totalLines }} 行），机器 OCR 转录，数值、公式与表格请回查原书
    PDF；章节内容与 PDF 原件一一对应，PDF 在「资料库」模块阅读。
  </p>
  <ErrorPanel v-if="state.booksError" :message="state.booksError" @retry="workspace.loadBooks" />
  <div v-else-if="!state.books" class="loading-panel" role="status">正在加载教材目录…</div>
  <div v-else class="book-grid">
    <RouterLink
      v-for="book in books"
      :key="book.id"
      class="book-card"
      :to="{ name: 'book', params: { bookId: book.id } }"
    >
      <span class="book-card-icon"><BookOpen :size="22" aria-hidden="true" /></span>
      <span class="book-card-body">
        <strong>{{ book.title }}</strong>
        <small>{{ book.publisher }} · {{ book.edition }}</small>
        <span class="book-card-stats"
          >{{ book.chapters.length }} 章 ·
          {{ book.chapters.reduce((sum, chapter) => sum + chapter.lines, 0) }} 行原文</span
        >
      </span>
      <SquareArrowOutUpRight :size="16" aria-hidden="true" class="book-card-go" />
    </RouterLink>
    <RouterLink class="book-card book-card-manual" to="/manual">
      <span class="book-card-icon"><Files :size="22" aria-hidden="true" /></span>
      <span class="book-card-body">
        <strong>2026 标本采集手册</strong>
        <small>首都医科大学宣武医院检验科 · XWH-JY-CJ</small>
        <span class="book-card-stats">院内手册全文 · 9 张项目分组表</span>
      </span>
      <SquareArrowOutUpRight :size="16" aria-hidden="true" class="book-card-go" />
    </RouterLink>
  </div>
  <p class="knowledge-muted shelf-note">
    《全国临床检验操作规程》（2015年第4版）为扫描版，未完成文字识别，请在<RouterLink
      class="text-link"
      to="/library"
      >资料库</RouterLink
    >中按页阅读 PDF。
  </p>
</template>

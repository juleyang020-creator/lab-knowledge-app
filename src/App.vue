<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { FlaskConical, Search, X } from '@lucide/vue'
import ErrorPanel from './components/ErrorPanel.vue'
import { useWorkspace } from './state/workspace'

const workspace = useWorkspace()
const { state } = workspace
const route = useRoute()
const router = useRouter()

const MODULES = [
  { name: 'items', label: '查项目', paths: ['/items', '/saved'] },
  { name: 'diseases', label: '查病种', paths: ['/diseases'] },
  { name: 'books', label: '读教材', paths: ['/books'] },
  { name: 'manual', label: '采集手册', paths: ['/manual'] },
  { name: 'library', label: '资料库', paths: ['/library'] },
  { name: 'sources', label: '来源', paths: ['/sources'] },
] as const
const activeModule = computed(() => {
  const found = MODULES.find((module) => route.path.startsWith(module.paths[0]))
  return found?.name ?? 'items'
})

const searchInput = ref<HTMLInputElement | null>(null)
const searchText = ref('')
function submitSearch(): void {
  const q = searchText.value.trim()
  if (!q) return
  void router.push({ path: '/search', query: { q } })
}
function clearSearch(): void {
  searchText.value = ''
  searchInput.value?.focus()
}
function onGlobalKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    searchInput.value?.focus()
    searchInput.value?.select()
  } else if (event.key === '/' && !(event.target instanceof HTMLInputElement)) {
    event.preventDefault()
    searchInput.value?.focus()
  }
}

function focusMain(): void {
  const main = document.getElementById('main')
  main?.focus({ preventScroll: true })
  main?.scrollIntoView({ block: 'start' })
}

/* 侧边栏：读教材模块给书目/章节树；查项目用顶部科室页签，其余模块无侧栏 */
const sidebarOpen = ref(false)
function closeSidebar(): void {
  sidebarOpen.value = false
}
const books = computed(() => state.books?.books ?? [])
const currentBook = computed(() =>
  activeModule.value === 'books' && typeof route.params.bookId === 'string'
    ? (books.value.find((book) => book.id === route.params.bookId) ?? null)
    : null,
)
const bookParts = computed(() => {
  if (!currentBook.value) return []
  const parts = new Map<string, { id: string; title: string }[]>()
  for (const chapter of currentBook.value.chapters) {
    const key = chapter.part || '章节'
    parts.set(key, [...(parts.get(key) ?? []), { id: chapter.id, title: chapter.title }])
  }
  return [...parts].map(([part, chapters]) => ({ part, chapters }))
})
const hasSidebar = computed(() => activeModule.value === 'books')

watch(
  () => route.path,
  () => {
    closeSidebar()
    if (activeModule.value === 'books') void workspace.loadBooks()
    document.title = `${typeof route.meta?.title === 'string' ? `${route.meta.title} · ` : ''}检验知识库`
  },
  { immediate: true },
)
watch(
  () => route.query.q,
  (q) => {
    if (route.name === 'search') searchText.value = typeof q === 'string' ? q : ''
  },
  { immediate: true },
)
onMounted(async () => {
  document.addEventListener('keydown', onGlobalKeydown)
  await workspace.loadCatalog()
})
onBeforeUnmount(() => document.removeEventListener('keydown', onGlobalKeydown))
</script>

<template>
  <a class="skip-link" href="#main" @click.prevent="focusMain">跳到正文</a>
  <header class="topbar">
    <button
      v-if="hasSidebar"
      class="menu-btn"
      type="button"
      aria-label="目录"
      aria-controls="sidebar"
      :aria-expanded="sidebarOpen"
      @click="sidebarOpen = !sidebarOpen"
    >
      ☰
    </button>
    <RouterLink class="brand" to="/items" aria-label="检验知识库首页">
      <FlaskConical :size="20" aria-hidden="true" />
      <span class="brand-name">检验知识库<span class="brand-sub">专业速查 · 试验版</span></span>
    </RouterLink>
    <div class="search-wrap" role="search">
      <Search class="search-icon" :size="16" aria-hidden="true" />
      <input
        ref="searchInput"
        v-model="searchText"
        class="search"
        type="search"
        placeholder="搜索项目、手册与教材全文"
        autocomplete="off"
        enterkeyhint="search"
        aria-label="全库搜索"
        maxlength="100"
        @keydown.enter.prevent="submitSearch"
        @keydown.esc="clearSearch"
      />
      <button
        v-if="searchText"
        class="search-clear"
        type="button"
        aria-label="清空搜索"
        @click="clearSearch"
      >
        <X :size="14" aria-hidden="true" />
      </button>
      <kbd class="search-shortcut" aria-hidden="true">⌘K</kbd>
    </div>
    <nav class="module-tabs" aria-label="功能模块">
      <RouterLink
        v-for="module in MODULES"
        :key="module.name"
        :to="module.paths[0]"
        class="module-tab"
        :class="{ active: activeModule === module.name }"
      >
        {{ module.label }}
      </RouterLink>
      <RouterLink to="/saved" class="module-tab" :class="{ active: route.name === 'saved' }">
        收藏<span v-if="state.savedIds.length" class="nav-count">{{ state.savedIds.length }}</span>
      </RouterLink>
    </nav>
  </header>

  <div class="layout" :class="{ 'no-sidebar': !hasSidebar }">
    <template v-if="hasSidebar">
      <aside
        id="sidebar"
        class="sidebar"
        :class="{ open: sidebarOpen }"
        aria-label="目录"
        tabindex="-1"
      >
        <div v-for="book in books" :key="book.id" class="side-book">
          <RouterLink
            class="side-group"
            :class="{ active: currentBook?.id === book.id }"
            :title="`${book.title}（${book.edition}）`"
            :to="{ name: 'book', params: { bookId: book.id } }"
          >
            {{ book.shortTitle }}<span class="side-count">{{ book.chapters.length }}章</span>
          </RouterLink>
          <template v-if="currentBook?.id === book.id">
            <div v-for="group in bookParts" :key="group.part" class="side-part">
              <div class="side-part-title">{{ group.part }}</div>
              <RouterLink
                v-for="chapter in group.chapters"
                :key="chapter.id"
                class="side-chapter"
                :class="{ active: route.params.chapterId === chapter.id }"
                :to="{
                  name: 'chapter',
                  params: { bookId: book.id, chapterId: chapter.id },
                }"
              >
                {{ chapter.title }}
              </RouterLink>
            </div>
          </template>
        </div>
      </aside>
      <div
        class="nav-backdrop"
        :class="{ show: sidebarOpen }"
        aria-hidden="true"
        @click="closeSidebar"
      ></div>
    </template>
    <main id="main" class="main" tabindex="-1">
      <p v-if="!state.persistent" class="storage-notice" role="status">
        当前浏览器无法保存偏好，收藏仅在本次打开期间有效。
      </p>
      <ErrorPanel
        v-if="state.catalogError"
        :message="state.catalogError"
        @retry="workspace.retryAll"
      />
      <div v-else-if="!state.catalog" class="loading-panel" role="status">正在加载项目资料…</div>
      <RouterView v-else />
    </main>
  </div>

  <footer class="site-footer">
    <span
      >仅供学习参考 · <strong>不构成诊疗依据</strong> ·
      内容未经医学审核，数值与表述以原书及本院制度为准。</span
    >
    <span>{{ state.catalog?.version ?? '0.1.0-experimental' }}</span>
  </footer>
</template>

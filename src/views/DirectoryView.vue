<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { Search, X, Bookmark } from '@lucide/vue'
import ItemCard from '../components/ItemCard.vue'
import { AudienceSchema } from '../domain/content'
import type { CatalogItem } from '../domain/content'
import { filterCatalog } from '../domain/search'
import { useWorkspace } from '../state/workspace'
const { state } = useWorkspace()
const route = useRoute()
const router = useRouter()
const audience = computed(() => {
  const parsed = AudienceSchema.safeParse(route.params.audience)
  return parsed.success ? parsed.data : (state.rememberedAudience ?? 'professional')
})
const savedOnly = computed(() => route.name === 'saved')
const items = computed(() => state.catalog?.items ?? [])
const categories = computed(() => [...new Set(items.value.map((item) => item.category))])
function setQuery(key: string, value: string): void {
  void router.replace({
    query: {
      ...route.query,
      page: undefined,
      ...(key === 'kind' ? { category: undefined } : key === 'category' ? { kind: undefined } : {}),
      [key]: value || undefined,
    },
  })
}
const query = computed({
  get: () => (typeof route.query.q === 'string' ? route.query.q : ''),
  set: (value: string) => setQuery('q', value),
})
const category = computed(() =>
  typeof route.query.category === 'string' ? route.query.category : '',
)
const provenance = computed<'all' | 'document' | 'model'>(() =>
  route.query.source === 'document' || route.query.source === 'model' ? route.query.source : 'all',
)
const kind = computed<'all' | 'panel' | 'individual'>(() =>
  route.query.kind === 'panel' || route.query.kind === 'individual' ? route.query.kind : 'all',
)
const filtered = computed(() => {
  const results = filterCatalog(
    savedOnly.value ? items.value.filter((item) => state.savedIds.includes(item.id)) : items.value,
    query.value,
    { category: category.value, provenance: provenance.value, kind: kind.value },
  )
  // Browse combinations first, but preserve name-match ranking for an explicit query.
  return query.value.trim()
    ? results
    : results.sort(
        (a, b) =>
          Number(Boolean(b.manual && b.kind === 'panel')) -
          Number(Boolean(a.manual && a.kind === 'panel')),
      )
})
const pageSize = 24
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)))
const page = computed(() => {
  const value =
    typeof route.query.page === 'string' && /^\d+$/.test(route.query.page)
      ? Number(route.query.page)
      : 1
  return Math.min(pageCount.value, Math.max(1, value))
})
const visibleGroups = computed(() => {
  const groups = new Map<string, CatalogItem[]>()
  for (const item of filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize)) {
    const title = item.manual ? item.category : `通用知识参考 · ${item.category}`
    groups.set(title, [...(groups.get(title) ?? []), item])
  }
  return [...groups].map(([title, entries]) => ({ title, entries }))
})
const manualSource = computed(() => state.catalog?.sources.find((source) => source.manual))
const manualCount = computed(
  () => manualSource.value?.manual?.groups.reduce((sum, group) => sum + group.count, 0) ?? 0,
)
async function setPage(value: number): Promise<void> {
  await router.push({ query: { ...route.query, page: value === 1 ? undefined : String(value) } })
  const target = document.getElementById('directory-results')
  if (target) {
    target.style.scrollMarginTop = `${(document.querySelector('.top-shell')?.getBoundingClientRect().height ?? 0) + 16}px`
    target.focus({ preventScroll: true })
    target.scrollIntoView({ block: 'start' })
  }
}
</script>
<template>
  <header class="page-heading directory-heading">
    <h1>{{ savedOnly ? '我的收藏' : audience === 'professional' ? '专业速查' : '查检验项目' }}</h1>
    <span class="directory-count">{{ savedOnly ? state.savedIds.length : items.length }} 项</span>
  </header>
  <section class="search-panel" aria-label="查找与筛选">
    <div class="search-field">
      <Search :size="21" aria-hidden="true" /><input
        v-model="query"
        type="search"
        aria-label="搜索检验项目"
        placeholder="项目名称、缩写，或组合内的指标…"
        maxlength="100"
        autocomplete="off"
      />
      <button
        v-if="query"
        class="icon-button"
        type="button"
        aria-label="清空搜索"
        @click="query = ''"
      >
        <X :size="18" aria-hidden="true" />
      </button>
    </div>
    <div class="search-controls">
      <div class="kind-switch" aria-label="项目类型">
        <button type="button" :aria-pressed="kind === 'all'" @click="setQuery('kind', '')">
          全部项目
        </button>
        <button type="button" :aria-pressed="kind === 'panel'" @click="setQuery('kind', 'panel')">
          组合项目
        </button>
        <button
          type="button"
          aria-label="单项 / 检验记录"
          :aria-pressed="kind === 'individual'"
          @click="setQuery('kind', 'individual')"
        >
          单项
        </button>
      </div>
      <details class="directory-filters" :open="Boolean(category) || provenance !== 'all'">
        <summary>筛选{{ category || provenance !== 'all' ? ' · 已选' : '' }}</summary>
        <div class="category-scroll" aria-label="项目分类">
          <button type="button" :aria-pressed="!category" @click="setQuery('category', '')">
            全部
          </button>
          <button
            v-for="entry in categories"
            :key="entry"
            type="button"
            :aria-label="entry"
            :aria-pressed="category === entry"
            @click="setQuery('category', entry)"
          >
            {{ entry }} · {{ items.filter((item) => item.category === entry).length }}
          </button>
        </div>
        <label class="source-filter"
          >概述来源<select
            :value="provenance"
            aria-label="概述来源"
            @change="setQuery('source', ($event.target as HTMLSelectElement).value)"
          >
            <option value="all">全部来源</option>
            <option value="document">有文件依据</option>
            <option value="model">模型补充</option>
          </select></label
        >
      </details>
    </div>
  </section>
  <div id="directory-results" class="result-toolbar" tabindex="-1">
    <span role="status"
      >找到 <strong>{{ filtered.length }}</strong> 项参考</span
    >
  </div>
  <template v-if="filtered.length">
    <section v-for="group in visibleGroups" :key="group.title" :aria-label="group.title">
      <h2 class="manual-group-heading">{{ group.title }}</h2>
      <div class="item-grid" aria-label="检验项目列表">
        <ItemCard v-for="item in group.entries" :key="item.id" :item="item" :audience="audience" />
      </div>
    </section>
    <nav v-if="pageCount > 1" class="manual-pagination" aria-label="检验项目分页">
      <button type="button" :disabled="page === 1" @click="setPage(page - 1)">上一页</button>
      <span>第 {{ page }} / {{ pageCount }} 页</span>
      <button type="button" :disabled="page === pageCount" @click="setPage(page + 1)">
        下一页
      </button>
    </nav>
  </template>
  <section v-else class="empty-panel">
    <Bookmark v-if="savedOnly" :size="28" aria-hidden="true" /><Search
      v-else
      :size="28"
      aria-hidden="true"
    />
    <h2>{{ savedOnly && !state.savedIds.length ? '还没有收藏' : '暂时没有匹配的项目' }}</h2>
    <p>当前目录依据已接入的文件，未找到不代表本院没有开展。</p>
    <RouterLink
      v-if="savedOnly && !state.savedIds.length"
      class="primary-button"
      :to="`/${audience}`"
      >去查项目</RouterLink
    ><button v-else class="primary-button" type="button" @click="router.replace({ query: {} })">
      清除筛选
    </button>
  </section>
  <nav v-if="!savedOnly" class="directory-tools" aria-label="查询快捷入口">
    <RouterLink :to="`/${audience}/specimens`">按疾病 / 症状找线索 →</RouterLink>
    <RouterLink v-if="manualSource?.manual" :to="`/${audience}/manual`"
      >采集手册全文 · {{ manualCount }}条记录 →</RouterLink
    >
  </nav>
</template>

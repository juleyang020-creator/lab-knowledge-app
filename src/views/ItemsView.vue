<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { Search, X, Bookmark } from '@lucide/vue'
import type { CatalogItem } from '../domain/content'
import { filterCatalog } from '../domain/search'
import { fieldValue } from '../domain/knowledge'
import { departmentLabel } from '../domain/reading'
import { useWorkspace } from '../state/workspace'
import ManualInline from '../components/ManualInline.vue'

const { state, toggleSaved } = useWorkspace()
const route = useRoute()
const router = useRouter()
const savedOnly = computed(() => route.name === 'saved')
const items = computed(() =>
  savedOnly.value
    ? (state.catalog?.items ?? []).filter((item) => state.savedIds.includes(item.id))
    : (state.catalog?.items ?? []),
)

/** 科室页签：手册分组沿用原表顺序，教学参考殿后 */
const manualGroups = computed(
  () => state.catalog?.sources.find((source) => source.manual)?.manual?.groups ?? [],
)
const teachingCount = computed(() => items.value.filter((item) => !item.manual).length)

function setQuery(key: string, value: string): void {
  void router.replace({
    query: { ...route.query, page: undefined, [key]: value || undefined },
  })
}
const query = computed({
  get: () => (typeof route.query.q === 'string' ? route.query.q : ''),
  set: (value: string) => setQuery('q', value),
})
const category = computed(() =>
  typeof route.query.category === 'string' ? route.query.category : '',
)
const kind = computed<'all' | 'panel' | 'individual'>(() =>
  route.query.kind === 'panel' || route.query.kind === 'individual' ? route.query.kind : 'all',
)
const filtered = computed(() => {
  const teaching = category.value === '__teaching__'
  const pool = teaching ? items.value.filter((item) => !item.manual) : items.value
  const results = filterCatalog(pool, query.value, {
    category: teaching ? '' : category.value,
    kind: kind.value,
  })
  return query.value.trim()
    ? results
    : results.sort(
        (a, b) =>
          Number(Boolean(b.manual && b.kind === 'panel')) -
          Number(Boolean(a.manual && a.kind === 'panel')),
      )
})

const pageSize = 40
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)))
const page = computed(() => {
  const value =
    typeof route.query.page === 'string' && /^\d+$/.test(route.query.page)
      ? Number(route.query.page)
      : 1
  return Math.min(pageCount.value, Math.max(1, value))
})
const visible = computed(() =>
  filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize),
)
async function setPage(value: number): Promise<void> {
  await router.push({ query: { ...route.query, page: value === 1 ? undefined : String(value) } })
  document.getElementById('items-results')?.scrollIntoView({ block: 'start' })
}
function rowTarget(item: CatalogItem) {
  return {
    name: 'item' as const,
    params: { itemId: item.id },
    query: savedOnly.value ? { from: 'saved' } : { ...route.query },
  }
}
</script>

<template>
  <div class="items-view">
    <header class="items-head">
      <h1>{{ savedOnly ? '我的收藏' : '检验项目速查' }}</h1>
      <span class="items-count">{{ filtered.length }} 项</span>
    </header>

    <nav v-if="!savedOnly" class="dept-tabs" aria-label="科室分组">
      <RouterLink
        class="dept-tab"
        :class="{ active: !category }"
        :to="{ path: '/items', query: { kind: route.query.kind, q: route.query.q } }"
        >全部</RouterLink
      >
      <RouterLink
        v-for="group in manualGroups"
        :key="group.id"
        class="dept-tab"
        :class="{ active: category === group.name }"
        :to="{
          path: '/items',
          query: { category: group.name, kind: route.query.kind, q: route.query.q },
        }"
        >{{ group.name.replace(/(检验)?项目$/, '') || group.name }}</RouterLink
      >
      <RouterLink
        v-if="teachingCount"
        class="dept-tab"
        :class="{ active: category === '__teaching__' }"
        :to="{ path: '/items', query: { category: '__teaching__' } }"
        >教学参考 · {{ teachingCount }}</RouterLink
      >
    </nav>

    <section class="items-toolbar" aria-label="查找与筛选">
      <div class="search-field">
        <Search :size="18" aria-hidden="true" />
        <input
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
          <X :size="16" aria-hidden="true" />
        </button>
      </div>
      <div class="kind-switch" aria-label="项目类型">
        <button type="button" :aria-pressed="kind === 'all'" @click="setQuery('kind', '')">
          全部
        </button>
        <button type="button" :aria-pressed="kind === 'panel'" @click="setQuery('kind', 'panel')">
          组合
        </button>
        <button
          type="button"
          :aria-pressed="kind === 'individual'"
          @click="setQuery('kind', 'individual')"
        >
          单项
        </button>
      </div>
    </section>

    <div id="items-results" class="result-toolbar" tabindex="-1">
      <span role="status"
        >找到 <strong>{{ filtered.length }}</strong> 项</span
      >
    </div>

    <div v-if="visible.length" class="item-rows" role="list" aria-label="检验项目列表">
      <div v-for="item in visible" :key="item.id" class="item-row" role="listitem">
        <div class="item-row-main">
          <span class="item-row-title">
            <RouterLink class="item-name" :to="rowTarget(item)"
              ><strong>{{ item.name }}</strong></RouterLink
            >
            <span v-if="item.abbreviation" class="abbreviation">{{ item.abbreviation }}</span>
            <span class="department-label">{{ departmentLabel(item) }}</span>
          </span>
          <span class="item-row-facts">
            <span v-if="item.manual" class="fact"
              ><span class="fact-label">标本</span
              ><ManualInline :text="fieldValue(item, '标本要求') || '原文未填'"
            /></span>
            <span v-if="fieldValue(item, '参考区间')" class="fact"
              ><span class="fact-label">参考</span
              ><ManualInline :text="fieldValue(item, '参考区间')"
            /></span>
            <span v-if="item.kind === 'panel'" class="fact fact-panel">组合项目</span>
            <span
              v-if="!item.manual && item.summary.provenance.kind === 'model'"
              class="provenance-badge model"
              >概述为模型补充 · 待核实</span
            >
          </span>
        </div>
        <button
          class="icon-button bookmark-button"
          type="button"
          :class="{ saved: state.savedIds.includes(item.id) }"
          :aria-label="`${state.savedIds.includes(item.id) ? '取消收藏' : '收藏'}${item.name}`"
          :aria-pressed="state.savedIds.includes(item.id)"
          @click="toggleSaved(item.id)"
        >
          <Bookmark :size="16" aria-hidden="true" />
        </button>
      </div>
    </div>
    <nav v-if="pageCount > 1" class="manual-pagination" aria-label="检验项目分页">
      <button type="button" :disabled="page === 1" @click="setPage(page - 1)">上一页</button>
      <span>第 {{ page }} / {{ pageCount }} 页</span>
      <button type="button" :disabled="page === pageCount" @click="setPage(page + 1)">
        下一页
      </button>
    </nav>

    <section v-if="!filtered.length" class="empty-panel">
      <Bookmark v-if="savedOnly" :size="28" aria-hidden="true" /><Search
        v-else
        :size="28"
        aria-hidden="true"
      />
      <h2>{{ savedOnly && !state.savedIds.length ? '还没有收藏' : '暂时没有匹配的项目' }}</h2>
      <p>当前目录依据已接入的文件，未找到不代表本院没有开展。</p>
      <RouterLink v-if="savedOnly && !state.savedIds.length" class="primary-button" to="/items"
        >去查项目</RouterLink
      ><button v-else class="primary-button" type="button" @click="router.replace({ query: {} })">
        清除筛选
      </button>
    </section>
  </div>
</template>

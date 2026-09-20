<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Search } from '@lucide/vue'
import ErrorPanel from '../components/ErrorPanel.vue'
import { useWorkspace } from '../state/workspace'

const workspace = useWorkspace()
const { state } = workspace

const query = ref('')
const diseases = computed(() => {
  const words = query.value.trim().normalize('NFKC').toLocaleLowerCase()
  const list = state.diseases?.diseases ?? []
  const filtered = words
    ? list.filter((disease) => disease.name.normalize('NFKC').toLocaleLowerCase().includes(words))
    : list
  return [...filtered].sort(
    (a, b) =>
      b.mentions.length - a.mentions.length || a.name.localeCompare(b.name, 'zh-Hans-CN'),
  )
})
function directionCount(disease: (typeof diseases.value)[number], direction: string): number {
  return disease.mentions.filter((mention) => mention.direction === direction).length
}
onMounted(() => void workspace.loadDiseases())
</script>

<template>
  <header class="page-heading">
    <div>
      <span class="eyebrow">病种关联 · 照录手册临床意义原文</span>
      <h1>查病种</h1>
      <p>
        从手册「临床意义」原文抽取的病种索引，共 {{ state.diseases?.diseaseCount ?? '…' }}
        个。病名是检索标签，关联不代表诊断或选检建议。
      </p>
    </div>
  </header>
  <ErrorPanel v-if="state.diseasesError" :message="state.diseasesError" @retry="workspace.loadDiseases" />
  <template v-else-if="state.diseases">
    <div class="search-field disease-filter">
      <Search :size="16" aria-hidden="true" />
      <input
        v-model="query"
        type="search"
        aria-label="筛选病种"
        placeholder="输入病名筛选…"
        maxlength="40"
        autocomplete="off"
      />
    </div>
    <p role="status" class="disease-count">{{ diseases.length }} 个病种</p>
    <div v-if="diseases.length" class="disease-list">
      <RouterLink
        v-for="disease in diseases"
        :key="disease.id"
        class="disease-row"
        :to="{ name: 'disease', params: { diseaseId: disease.id } }"
      >
        <span class="disease-name">{{ disease.name }}</span>
        <span class="disease-meta">
          <small v-if="directionCount(disease, 'increase')">↑{{ directionCount(disease, 'increase') }}</small>
          <small v-if="directionCount(disease, 'decrease')">↓{{ directionCount(disease, 'decrease') }}</small>
          <small v-if="directionCount(disease, 'related')">·{{ directionCount(disease, 'related') }}</small>
          {{ disease.mentions.length }} 项关联
        </span>
      </RouterLink>
    </div>
    <section v-else class="empty-panel">
      <h2>没有匹配「{{ query }}」的病种</h2>
      <p>换个关键词试试；病种来自手册临床意义原文，未收录的病种不会出现在这里。</p>
    </section>
  </template>
  <div v-else class="loading-panel" role="status">正在加载病种关联…</div>
</template>

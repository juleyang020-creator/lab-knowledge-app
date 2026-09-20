<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ArrowLeft } from '@lucide/vue'
import ErrorPanel from '../components/ErrorPanel.vue'
import ManualInline from '../components/ManualInline.vue'
import { useWorkspace } from '../state/workspace'

const route = useRoute()
const workspace = useWorkspace()
const { state } = workspace

const disease = computed(() =>
  state.diseases?.diseases.find((entry) => entry.id === route.params.diseaseId),
)
const itemsById = computed(
  () => new Map((state.catalog?.items ?? []).map((item) => [item.id, item])),
)
const DIRECTIONS = [
  { key: 'increase', label: '结果升高相关' },
  { key: 'decrease', label: '结果降低相关' },
  { key: 'related', label: '其他关联' },
] as const
const groups = computed(() => {
  if (!disease.value) return []
  return DIRECTIONS.map((direction) => ({
    ...direction,
    mentions: disease.value!.mentions.filter((mention) => mention.direction === direction.key),
  })).filter((group) => group.mentions.length)
})
onMounted(() => void workspace.loadDiseases())
</script>

<template>
  <RouterLink class="back-link" :to="{ name: 'diseases' }"
    ><ArrowLeft :size="17" aria-hidden="true" />返回病种列表</RouterLink
  >
  <ErrorPanel v-if="state.diseasesError" :message="state.diseasesError" @retry="workspace.loadDiseases" />
  <template v-else-if="disease">
    <header class="page-heading">
      <div>
        <span class="eyebrow">病种关联 · 照录手册原文 · 未经医学审核</span>
        <h1>{{ disease.name }}</h1>
        <p>
          以下 {{ disease.mentions.length }}
          条关联来自手册「临床意义」原文。病名是索引标签，不构成诊断或选检建议；异常结果须由医生结合临床判断。
        </p>
      </div>
    </header>
    <section v-for="group in groups" :key="group.key" class="content-section disease-group">
      <h2>{{ group.label }}（{{ group.mentions.length }}）</h2>
      <div v-for="mention in group.mentions" :key="mention.itemId" class="disease-mention">
        <template v-if="itemsById.get(mention.itemId)">
          <div class="disease-mention-head">
            <RouterLink class="disease-item-link" :to="{ name: 'item', params: { itemId: mention.itemId } }">
              {{ itemsById.get(mention.itemId)!.name }}
              <small v-if="itemsById.get(mention.itemId)!.abbreviation">{{
                itemsById.get(mention.itemId)!.abbreviation
              }}</small>
            </RouterLink>
            <RouterLink
              class="citation-link"
              :to="{
                name: 'manual',
                query: {
                  section: itemsById.get(mention.itemId)!.manual!.location.sectionId,
                  line: mention.line,
                },
              }"
            >
              原文 · {{ itemsById.get(mention.itemId)!.manual!.location.printedPages.join('、') }}页 ↗
            </RouterLink>
          </div>
          <p class="disease-quote">
            <ManualInline :text="mention.quote" />
          </p>
        </template>
      </div>
    </section>
  </template>
  <section v-else-if="state.diseases" class="empty-panel">
    <h1>未找到这个病种</h1>
    <p>病种索引来自手册临床意义原文，未收录的病种不会出现在这里。</p>
  </section>
  <div v-else class="loading-panel" role="status">正在加载病种关联…</div>
</template>

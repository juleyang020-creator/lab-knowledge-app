<script setup lang="ts">
import { computed, nextTick, toRef, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Search, X, ArrowRight, ShieldCheck } from '@lucide/vue'
import { AudienceSchema } from '../domain/content'
import { fieldValue, suggestSpecimens } from '../domain/knowledge'
import { collectionGuides } from '../domain/collection'
import { useWorkspace } from '../state/workspace'
import ManualInline from '../components/ManualInline.vue'
const { state, knowledge } = useWorkspace()
const route = useRoute()
const audience = computed(() => AudienceSchema.parse(route.params.audience))
const hits = computed(() => suggestSpecimens(knowledge.value, state.specimenQuery))
const page = toRef(state, 'specimenPage')
const pageSize = 12
const pageCount = computed(() => Math.max(1, Math.ceil(hits.value.length / pageSize)))
watch(
  pageCount,
  (count) => {
    page.value = Math.min(count, Math.max(1, page.value))
  },
  { immediate: true },
)
const visible = computed(() => hits.value.slice((page.value - 1) * pageSize, page.value * pageSize))
watch(
  () => state.specimenQuery,
  () => {
    page.value = 1
  },
)
async function setPage(value: number): Promise<void> {
  page.value = value
  await nextTick()
  const target = document.getElementById('specimen-results')
  if (!target) return
  target.style.scrollMarginTop = `${(document.querySelector('.top-shell')?.getBoundingClientRect().height ?? 0) + 16}px`
  target.focus({ preventScroll: true })
  target.scrollIntoView({ block: 'start' })
}
</script>
<template>
  <header class="page-heading">
    <div>
      <span class="eyebrow">从查询词到项目，再核对标本</span>
      <h1>标本查询助手</h1>
      <p>
        输入疾病、症状或项目关键词，查找手册中的相关条目与标本要求。这里给出查阅线索，不生成检查单。
      </p>
    </div>
  </header>
  <section class="specimen-search" aria-label="标本查询">
    <label for="specimen-query">你想了解什么检查或情况？</label>
    <div class="search-field">
      <Search :size="22" aria-hidden="true" />
      <input
        id="specimen-query"
        v-model="state.specimenQuery"
        type="search"
        aria-label="疾病、症状或项目关键词"
        placeholder="例如：糖尿病、贫血、黄疸、ALT…"
        maxlength="100"
        autocomplete="off"
        aria-describedby="specimen-search-help"
      />
      <button
        v-if="state.specimenQuery"
        class="icon-button"
        type="button"
        aria-label="清空标本查询"
        @click="state.specimenQuery = ''"
      >
        <X :size="18" aria-hidden="true" />
      </button>
    </div>
    <p id="specimen-search-help" class="knowledge-muted">
      多个词用空格或逗号分开，结果须同时包含这些词。仅作文字匹配，不理解病史中的否定、时间或严重程度；请勿输入姓名、病历或个人报告。
    </p>
    <div class="query-examples" aria-label="示例查询">
      <span>试着查</span>
      <button
        v-for="term in ['糖尿病', '贫血', '黄疸', '肝功', '尿液']"
        :key="term"
        type="button"
        @click="state.specimenQuery = term"
      >
        {{ term }}
      </button>
    </div>
    <p class="query-privacy">
      <ShieldCheck
        :size="15"
        aria-hidden="true"
      />查询仅在本次页面内存中，不上传、不写入地址或浏览器存储；刷新即清除。
    </p>
  </section>
  <div
    v-if="state.specimenQuery.trim()"
    id="specimen-results"
    class="specimen-results-heading"
    tabindex="-1"
  >
    <h2>可查阅的项目线索</h2>
    <p role="status">
      找到 {{ hits.length }} 条原文记录 · 按文字相关度排列，不代表疾病概率或检查优先级
    </p>
  </div>
  <div v-if="state.specimenQuery.trim() && hits.length" class="specimen-result-grid">
    <article
      v-for="hit in visible"
      :key="hit.knowledge.item.id"
      class="specimen-result"
      :data-item-id="hit.knowledge.item.id"
    >
      <div class="card-meta">
        <span>{{ hit.knowledge.item.category }}</span
        ><span>{{ hit.knowledge.item.kind === 'panel' ? '组合项目' : '单项 / 检验记录' }}</span>
      </div>
      <h3>{{ hit.knowledge.item.name }}</h3>
      <div class="result-specimen">
        <span>标本 / 容器 · 原表要求</span
        ><strong
          ><ManualInline
            :text="fieldValue(hit.knowledge.item, '标本要求') || '原文未填写，请联系检验科确认'"
            :audience="audience"
        /></strong>
      </div>
      <div class="match-evidence">
        <h4>命中依据</h4>
        <div v-for="(evidence, index) in hit.evidence" :key="index">
          <span>{{ evidence.label }}</span>
          <p><ManualInline :text="evidence.text" :audience="audience" /></p>
        </div>
      </div>
      <p class="knowledge-muted">
        宣武医院2026手册 · 原书{{ hit.knowledge.item.manual!.location.printedPages.join('、') }}页 ·
        MD第{{ hit.knowledge.item.manual!.location.line }}行 · 未校订
      </p>
      <RouterLink
        class="text-link"
        :to="{
          name: 'item',
          params: { audience, itemId: hit.knowledge.item.id },
          query: { from: 'specimens' },
        }"
        >查看采集要求与临床意义 <ArrowRight :size="16" aria-hidden="true"
      /></RouterLink>
    </article>
  </div>
  <nav v-if="hits.length && pageCount > 1" class="manual-pagination" aria-label="标本查询分页">
    <button type="button" :disabled="page === 1" @click="setPage(page - 1)">上一页</button>
    <span>第 {{ page }} / {{ pageCount }} 页</span>
    <button type="button" :disabled="page === pageCount" @click="setPage(page + 1)">下一页</button>
  </nav>
  <section v-if="state.specimenQuery.trim() && !hits.length" class="empty-panel">
    <Search :size="28" aria-hidden="true" />
    <h2>没有找到有原文依据的线索</h2>
    <p>
      请改用项目名称、缩写或更短的关键词（中文至少两字）。未命中不表示无需检查，也不表示医院未开展；软件不会自动补造建议。
    </p>
    <button type="button" class="primary-button" @click="state.specimenQuery = ''">
      清空并查看采集入口
    </button>
  </section>
  <section v-if="!state.specimenQuery.trim()" class="collection-library" aria-label="常用采集入口">
    <div class="section-title-row">
      <h2>常用标本，从这里查</h2>
      <span>宣武医院手册 · 通用章节导航</span>
    </div>
    <div class="collection-library-grid">
      <RouterLink
        v-for="guide in collectionGuides"
        :key="guide.id"
        :to="{
          name: 'manual',
          params: { audience },
          query: { section: guide.excerpts[0]!.sectionId, line: guide.excerpts[0]!.line },
        }"
      >
        <strong>{{ guide.title }}</strong
        ><span>{{ guide.scope }}</span
        ><small>阅读原文 <ArrowRight :size="15" aria-hidden="true" /></small>
      </RouterLink>
    </div>
  </section>
  <p class="knowledge-warning">
    这是知识库检索，不是分诊或个体化选检工具。具体开检项目、标本类型、采集时间及准备要求，由临床医生和就诊医院检验科确认；请勿自行停药或执行穿刺采样。
  </p>
</template>

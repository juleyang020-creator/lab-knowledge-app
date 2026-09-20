<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ArrowLeft, Bookmark, CircleAlert, BookOpen } from '@lucide/vue'
import ClaimBlock from '../components/ClaimBlock.vue'
import ErrorPanel from '../components/ErrorPanel.vue'
import ManualItemDetails from '../components/ManualItemDetails.vue'
import ItemOverview from '../components/ItemOverview.vue'
import PanelRelations from '../components/PanelRelations.vue'
import { departmentLabel } from '../domain/reading'
import { findBookRelations } from '../domain/book'
import type { BookRelation } from '../domain/book'
import { diseasesByItem } from '../domain/disease'
import type { Disease } from '../domain/disease'
import { useWorkspace } from '../state/workspace'
const route = useRoute()
const workspace = useWorkspace()
const { state, knowledge } = workspace
const item = computed(() => state.catalog?.items.find((entry) => entry.id === route.params.itemId))
const article = computed(() =>
  state.articles?.articles.find((entry) => entry.itemId === item.value?.id),
)

/* 教材同名条目互链：目录名称与手册照录别名按规范化全名精确匹配，同名不合并 */
const bookRelations = ref<BookRelation[]>([])
async function loadBookItems(): Promise<void> {
  bookRelations.value = []
  if (!item.value || !(await workspace.loadBooks())) return
  const payloads = await Promise.all(
    (state.books?.books ?? []).map((book) => workspace.getBookItems(book.id).catch(() => null)),
  )
  bookRelations.value = findBookRelations(
    item.value.name,
    item.value.aliases,
    payloads.filter((payload) => payload !== null),
  )
}
function bookTitle(bookId: string): string {
  return state.books?.books.find((book) => book.id === bookId)?.title ?? bookId
}

/* 相关病种：病种关联库按项目反查，照录手册临床意义原文 */
const relatedDiseases = ref<Disease[]>([])
async function loadDiseases(): Promise<void> {
  relatedDiseases.value = []
  if (!item.value?.manual || !(await workspace.loadDiseases()) || !state.diseases) return
  relatedDiseases.value = diseasesByItem(state.diseases).get(item.value.id) ?? []
}
watch(item, () => {
  void loadBookItems()
  void loadDiseases()
})
function jumpTo(id: string): void {
  const target = document.getElementById(id)
  if (!target) return
  const height = document.querySelector('.detail-nav')?.getBoundingClientRect().height ?? 44
  target.style.scrollMarginTop = `${height + 10}px`
  target.focus({ preventScroll: true })
  target.scrollIntoView({ block: 'start' })
}
onMounted(() => {
  if (item.value && !item.value.manual) void workspace.loadArticles()
  void loadBookItems()
  void loadDiseases()
})
</script>
<template>
  <RouterLink
    class="back-link"
    :to="
      route.query.from === 'saved'
        ? { name: 'saved', query: { ...route.query, from: undefined } }
        : { name: 'items', query: { ...route.query, from: undefined } }
    "
    ><ArrowLeft :size="17" aria-hidden="true" />返回{{
      route.query.from === 'saved' ? '收藏' : '项目列表'
    }}</RouterLink
  >
  <template v-if="item">
    <header class="detail-heading">
      <div>
        <div class="detail-title">
          <h1>{{ item.name }}</h1>
          <span class="department-label">{{ departmentLabel(item) }}</span>
        </div>
        <p class="detail-aliases">
          <span v-if="item.abbreviation">{{ item.abbreviation }} · </span>
          {{ item.manual ? '宣武医院手册 · 非本院制度' : '通用教学参考' }}
          <RouterLink
            v-if="item.manual"
            class="citation-link"
            :to="{
              name: 'manual',
              query: { section: item.manual.location.sectionId, line: item.manual.location.line },
            }"
          >
            原文 · {{ item.manual.location.printedPages.join('、') }}页 ↗
          </RouterLink>
          <RouterLink
            class="citation-link"
            :to="{ name: 'search', query: { q: item.name, scope: 'books' } }"
          >
            <BookOpen :size="13" aria-hidden="true" /> 在教材中找「{{ item.name }}」↗
          </RouterLink>
        </p>
      </div>
      <button
        class="save-button"
        type="button"
        :class="{ saved: state.savedIds.includes(item.id) }"
        :aria-pressed="state.savedIds.includes(item.id)"
        :aria-label="`${state.savedIds.includes(item.id) ? '取消收藏' : '收藏'}${item.name}`"
        @click="workspace.toggleSaved(item.id)"
      >
        <Bookmark :size="19" aria-hidden="true" />{{
          state.savedIds.includes(item.id) ? '已收藏' : '收藏'
        }}
      </button>
    </header>
    <nav class="detail-nav" aria-label="词条速查">
      <button type="button" @click="jumpTo('clinical')">临床意义</button>
      <button type="button" @click="jumpTo('reference')">参考范围</button>
      <button v-if="item.manual" type="button" @click="jumpTo('specimen')">标本要求</button>
      <button type="button" @click="jumpTo('other')">其他资料</button>
    </nav>
    <div class="detail-layout">
      <div class="detail-body">
        <section
          v-if="bookRelations.length"
          id="textbook"
          class="content-section textbook-items"
        >
          <h2>教材同名条目（原文切片 · OCR 未校订）</h2>
          <p class="knowledge-muted">
            按规范化全名精确匹配（含手册照录别名），同名不合并；OCR 数值请回查原书。
          </p>
          <details v-for="relation in bookRelations" :key="relation.item.id" class="member-row">
            <summary>
              <span class="member-token">{{ relation.item.name }}</span>
              <span class="member-status"
                >{{ bookTitle(relation.bookId) }} · {{ relation.item.chapterTitle }} · MD 第
                {{ relation.item.lineStart }}—{{ relation.item.lineEnd }} 行</span
              >
            </summary>
            <div class="member-reading">
              <dl class="book-fields">
                <div v-for="(field, index) in relation.item.fields" :key="index">
                  <dt>{{ field.label }}</dt>
                  <dd>{{ field.text }}</dd>
                </div>
              </dl>
              <RouterLink
                class="text-link"
                :to="{
                  name: 'chapter',
                  params: { bookId: relation.bookId, chapterId: relation.item.chapterId },
                  query: { line: relation.item.lineStart },
                }"
                >阅读原文章节 ↗</RouterLink
              >
            </div>
          </details>
        </section>
        <nav v-if="relatedDiseases.length" class="chapter-relations" aria-label="相关病种">
          <span class="chapter-relations-label">相关病种</span>
          <RouterLink
            v-for="disease in relatedDiseases"
            :key="disease.id"
            class="chapter-relation-link"
            :to="{ name: 'disease', params: { diseaseId: disease.id } }"
          >
            {{ disease.name }}
          </RouterLink>
        </nav>
        <template v-if="item.manual">
          <ItemOverview :key="`overview-${item.id}`" :item="item" />
          <div id="other" tabindex="-1" class="other-information">
            <PanelRelations
              v-if="knowledge.get(item.id)"
              :key="`relations-${item.id}`"
              :knowledge="knowledge.get(item.id)!"
            />
            <details :key="item.id" class="raw-record">
              <summary>完整原表字段与表后说明</summary>
              <ManualItemDetails :entry="item.manual" />
            </details>
          </div>
        </template>
        <template v-else>
          <section id="clinical" class="content-section overview-section" tabindex="-1">
            <h2>临床意义</h2>
            <ClaimBlock :claim="item.summary" :sources="state.catalog?.sources ?? []" />
            <template v-for="section in article?.sections.slice(0, 1) ?? []" :key="section.id">
              <h3>{{ section.title }}</h3>
              <ClaimBlock
                v-for="claim in section.claims"
                :key="claim.id"
                :claim="claim"
                :sources="state.catalog?.sources ?? []"
              />
            </template>
          </section>
          <section id="reference" class="content-section reference-overview" tabindex="-1">
            <h2>参考范围与解释</h2>
            <p class="knowledge-muted">
              此教学条目未收录适用人群与方法明确的参考范围，请以检验报告单为准。
            </p>
            <template v-for="section in article?.sections.slice(1, 2) ?? []" :key="section.id">
              <h3>{{ section.title }}</h3>
              <ClaimBlock
                v-for="claim in section.claims"
                :key="claim.id"
                :claim="claim"
                :sources="state.catalog?.sources ?? []"
              />
            </template>
          </section>
          <ErrorPanel
            v-if="state.articlesError"
            :message="state.articlesError"
            @retry="workspace.retryArticles"
          />
          <div v-else-if="!article" class="loading-panel" role="status">正在加载详细说明…</div>
          <div v-else id="other" tabindex="-1" class="other-information">
            <section
              v-for="section in article?.sections.slice(2) ?? []"
              :key="section.id"
              class="content-section"
            >
              <h2>{{ section.title }}</h2>
              <ClaimBlock
                v-for="claim in section.claims"
                :key="claim.id"
                :claim="claim"
                :sources="state.catalog?.sources ?? []"
              />
            </section>
          </div>
        </template>
      </div>
      <div v-if="item.manual" class="detail-aside">
        <details class="source-disclosure">
          <summary>来源与适用范围</summary>
          <aside class="institution-panel">
            <CircleAlert :size="22" aria-hidden="true" />
            <h2>宣武医院手册信息</h2>
            <p>来源：首都医科大学宣武医院检验科《标本采集手册》2026版，文件编号 XWH-JY-CJ。</p>
            <p>
              科室标签沿用原手册的检验分组，不代表本院实际业务归属。报告时效及送检安排见完整原表；原文空白不补填。
            </p>
            <small
              >原表未提供医院开单代码。软件内部编号不等于医院项目代码，同名的不同记录不合并。</small
            >
          </aside>
        </details>
      </div>
    </div>
  </template>
  <section v-else class="empty-panel">
    <h1>未找到这个项目</h1>
    <p>条目可能尚未接入或已调整，请返回项目列表查找。</p>
  </section>
</template>

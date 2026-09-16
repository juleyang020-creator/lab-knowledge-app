<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ArrowLeft, Bookmark, CircleAlert } from '@lucide/vue'
import ClaimBlock from '../components/ClaimBlock.vue'
import ErrorPanel from '../components/ErrorPanel.vue'
import FeedbackDraft from '../components/FeedbackDraft.vue'
import ManualItemDetails from '../components/ManualItemDetails.vue'
import ItemOverview from '../components/ItemOverview.vue'
import PanelRelations from '../components/PanelRelations.vue'
import { AudienceSchema } from '../domain/content'
import { departmentLabel } from '../domain/reading'
import { useWorkspace } from '../state/workspace'
const route = useRoute()
const workspace = useWorkspace()
const { state, knowledge } = workspace
const audience = computed(() => AudienceSchema.parse(route.params.audience))
const item = computed(() => state.catalog?.items.find((entry) => entry.id === route.params.itemId))
const article = computed(() =>
  state.payloads[audience.value]?.articles.find((entry) => entry.itemId === item.value?.id),
)
function jumpTo(id: string): void {
  const target = document.getElementById(id)
  if (!target) return
  const height = document.querySelector('.detail-nav')?.getBoundingClientRect().height ?? 44
  target.style.scrollMarginTop = `${height + 10}px`
  target.focus({ preventScroll: true })
  target.scrollIntoView({ block: 'start' })
}
const localLabels = {
  orderName: '本院开单名称',
  orderCode: '本院项目代码',
  specimen: '本院标本要求',
  turnaround: '本院报告时效',
  location: '本院采样地点',
}
</script>
<template>
  <RouterLink
    class="back-link"
    :to="{
      name:
        route.query.from === 'specimens'
          ? 'specimens'
          : route.query.from === 'saved'
            ? 'saved'
            : 'directory',
      params: { audience },
      query: { ...route.query, from: undefined },
    }"
    ><ArrowLeft :size="17" aria-hidden="true" />返回{{
      route.query.from === 'specimens'
        ? '标本查询'
        : route.query.from === 'saved'
          ? '收藏'
          : '项目列表'
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
              params: { audience },
              query: { section: item.manual.location.sectionId, line: item.manual.location.line },
            }"
          >
            原文 · {{ item.manual.location.printedPages.join('、') }}页 ↗
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
        <template v-if="item.manual">
          <ItemOverview :key="`overview-${item.id}`" :item="item" :audience="audience" />
          <div id="other" tabindex="-1" class="other-information">
            <PanelRelations
              v-if="knowledge.get(item.id)"
              :key="`relations-${item.id}`"
              :knowledge="knowledge.get(item.id)!"
              :audience="audience"
            />
            <details :key="item.id" class="raw-record">
              <summary>完整原表字段与表后说明</summary>
              <ManualItemDetails :entry="item.manual" :audience="audience" />
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
            v-if="state.errors[audience]"
            :message="state.errors[audience]"
            @retry="workspace.retryAudience(audience)"
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
      <div class="detail-aside">
        <details class="source-disclosure">
          <summary>来源、适用范围与本院信息</summary>
          <aside v-if="item.manual" class="institution-panel">
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
          <aside v-else class="institution-panel">
            <CircleAlert :size="22" aria-hidden="true" />
            <h2>本院信息待补充</h2>
            <p>通用知识不能替代本院送检手册。缺少文件依据的业务信息不填造。</p>
            <dl>
              <div v-for="(label, key) in localLabels" :key="key">
                <dt>{{ label }}</dt>
                <dd>
                  <ClaimBlock
                    v-if="item.institutional[key]"
                    :claim="item.institutional[key]"
                    :sources="state.catalog?.sources ?? []"
                  />
                  <template v-else>待本院文件核实</template>
                </dd>
              </div>
            </dl>
            <small>试验版不提交医嘱、不收集个人检验结果。</small>
          </aside>
        </details>
        <FeedbackDraft
          :key="`${item.id}:${audience}`"
          :item-id="item.id"
          :item-name="item.name"
          :audience="audience"
          :version="state.catalog?.version ?? 'experimental'"
        />
      </div>
    </div>
  </template>
  <section v-else class="empty-panel">
    <h1>未找到这个项目</h1>
    <p>条目可能尚未接入或已调整，请返回项目列表查找。</p>
  </section>
</template>

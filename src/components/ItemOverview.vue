<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import type { CatalogItem } from '../domain/content'
import { fieldValue, manualField } from '../domain/knowledge'
import { collectionGuidesFor } from '../domain/collection'
import ManualInline from './ManualInline.vue'
const props = defineProps<{ item: CatalogItem }>()
const route = useRoute()
const guides = computed(() => collectionGuidesFor(props.item))
const specimen = computed(() => manualField(props.item, '标本要求'))
const clinical = computed(() => fieldValue(props.item, '临床意义'))
const reference = computed(() => fieldValue(props.item, '参考区间'))
</script>
<template>
  <div v-if="item.manual" class="knowledge-overview">
    <section
      id="clinical"
      class="content-section clinical-overview"
      aria-labelledby="clinical-title"
      tabindex="-1"
    >
      <h2 id="clinical-title">临床意义</h2>
      <p v-if="clinical" class="clinical-text">
        <ManualInline :text="clinical" />
      </p>
      <p v-else class="knowledge-muted">
        {{
          item.kind === 'panel'
            ? '原组合表未单列临床意义，请查阅下方细分项目。'
            : '原表未填写临床意义。'
        }}
      </p>
    </section>
    <section
      id="reference"
      class="content-section reference-overview"
      aria-labelledby="reference-title"
      tabindex="-1"
    >
      <h2 id="reference-title">参考范围与解释</h2>
      <p v-if="reference" class="reference-value">
        <ManualInline :text="reference" />
      </p>
      <p v-else class="knowledge-muted">
        {{
          item.kind === 'panel' ? '组合无统一参考范围，请分别查看各单项。' : '原表未填写参考区间。'
        }}
      </p>
      <p class="knowledge-muted">
        {{
          clinical ? '对应解释见上方临床意义。' : '原文未单列对应解释。'
        }}请以报告单所列人群、方法和范围为准。
      </p>
    </section>
    <section
      id="specimen"
      class="content-section specimen-overview"
      aria-labelledby="specimen-title"
      tabindex="-1"
    >
      <h2 id="specimen-title">标本采集要求</h2>
      <p v-if="specimen?.value" class="specimen-value">
        <ManualInline :text="fieldValue(item, '标本要求')" />
      </p>
      <p v-else class="knowledge-muted">原表未填写标本要求，请联系检验科确认；不根据名称推断。</p>
      <p v-if="specimen?.inheritedFrom" class="knowledge-muted">
        原文为“同上”，此处展示本表所指内容。
        <RouterLink
          class="text-link"
          :to="{
            name: 'item',
            params: { itemId: specimen.inheritedFrom.itemId },
            query: route.query,
          }"
          >查看所指记录</RouterLink
        >
      </p>
      <p class="knowledge-muted">
        宣武医院2026手册原字段。管盖颜色是该院配置，不代表所有医院通用要求。
      </p>
      <RouterLink
        class="text-link"
        :to="{
          name: 'manual',
          query: { section: item.manual.location.sectionId, line: item.manual.location.line },
        }"
      >
        核对标本原表 · 原书{{ item.manual.location.printedPages.join('、') }}页
      </RouterLink>
      <details v-for="guide in guides" :key="guide.id" class="collection-reading">
        <summary>{{ guide.title }}</summary>
        <p class="knowledge-muted">
          {{ guide.scope }}以下为宣武医院手册专业原文摘录，未经医学校订。
        </p>
        <div v-for="excerpt in guide.excerpts" :key="excerpt.line" class="collection-excerpt">
          <p><ManualInline :text="excerpt.text" /></p>
          <RouterLink
            class="text-link"
            :to="{
              name: 'manual',
              query: { section: excerpt.sectionId, line: excerpt.line },
            }"
          >
            原书第{{ excerpt.printedPage }}页 · MD第{{ excerpt.line }}行
          </RouterLink>
        </div>
      </details>
      <RouterLink
        v-if="!guides.length"
        class="text-link"
        :to="{ name: 'manual', query: { section: 'chapter-2' } }"
        >查阅完整采集方法（未自动关联）</RouterLink
      >
    </section>
  </div>
</template>

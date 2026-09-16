<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import type { Audience, ManualEntry } from '../domain/content'
import ManualInline from './ManualInline.vue'
defineProps<{ entry: ManualEntry; audience: Audience }>()
const route = useRoute()
</script>
<template>
  <section class="content-section">
    <span class="eyebrow">宣武医院2026手册 · 原字段照录</span>
    <h2>原手册项目资料</h2>
    <p class="manual-notice">
      <strong v-if="audience === 'patient'">专业手册原文，不是患者自行操作指南。</strong
      >参考区间、临床意义和业务要求未经本软件医学校订。请以检验报告及就诊医院现行规定为准，不据此自行诊断、停药或采样。
    </p>
    <p class="manual-location">
      原书第 {{ entry.location.printedPages.join('、') }} 页 · MD 第 {{ entry.location.line }} 行 ·
      原表第 {{ entry.row }} 行
    </p>
    <RouterLink
      class="manual-source-link"
      :to="{
        name: 'manual',
        params: { audience },
        query: { section: entry.location.sectionId, line: entry.location.line },
      }"
      >查看原表与上下文</RouterLink
    >
    <dl class="manual-fields">
      <div v-for="(field, index) in entry.fields" :key="index">
        <dt>{{ field.label }}</dt>
        <dd>
          <ManualInline v-if="field.value" :text="field.value" :audience="audience" />
          <span v-else class="manual-empty">原文空白（未补填）</span>
          <span v-if="field.inheritedFrom" class="manual-inherited"
            >原文“同上”，按本表同列向上定位：<ManualInline
              :text="field.inheritedFrom.value"
              :audience="audience"
            /><br /><RouterLink
              :to="{
                name: 'item',
                params: { audience, itemId: field.inheritedFrom.itemId },
                query: route.query,
              }"
              >查看同上所指记录</RouterLink
            ></span
          >
        </dd>
      </div>
    </dl>
    <section v-if="entry.notes.length" class="manual-notes">
      <h2>本组表后说明</h2>
      <p v-for="(note, index) in entry.notes" :key="index">
        <ManualInline :text="note" :audience="audience" />
      </p>
    </section>
    <p v-else class="manual-location">本组原文无独立表后说明；请结合手册正文查看采集要求。</p>
  </section>
</template>

<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import type { Audience } from '../domain/content'
import type { ItemKnowledge } from '../domain/knowledge'
import { fieldValue } from '../domain/knowledge'
import ManualInline from './ManualInline.vue'
defineProps<{ knowledge: ItemKnowledge; audience: Audience }>()
const route = useRoute()
</script>
<template>
  <section
    v-if="knowledge.members.length"
    class="content-section relationship-panel"
    aria-label="组合与细分项目"
  >
    <span class="eyebrow">03 · 组合展开看</span>
    <h2>组合与细分项目</h2>
    <p class="knowledge-muted">
      按原表列出的名称或缩写查找同源条目，点击展开临床意义和标本要求。同名关联仅供查阅，不是医嘱等价确认，不能据此合管采样。
    </p>
    <div class="relation-stats">
      <span
        >{{
          knowledge.members.filter((member) => member.status === 'linked').length
        }}
        处唯一同名关联</span
      >
      <span
        >{{
          knowledge.members.filter((member) => member.status !== 'linked').length
        }}
        处待核对</span
      >
    </div>
    <div class="member-list">
      <details v-for="(member, index) in knowledge.members" :key="index" class="member-row">
        <summary>
          <span class="member-token"
            ><ManualInline :text="member.label" :audience="audience"
          /></span>
          <span class="member-status">{{
            member.status === 'linked'
              ? member.candidates[0]!.name
              : member.status === 'ambiguous'
                ? `${member.candidates.length}条同名记录 · 需辨别`
                : '未匹配 · 保留原词'
          }}</span>
        </summary>
        <div v-if="!member.candidates.length" class="member-reading">
          <p class="knowledge-muted">
            没有可确定的同名条目，可能存在缩写差异或未单列项目。未猜测对应关系，也未补造子项目。
          </p>
          <RouterLink
            class="text-link"
            :to="{ name: 'directory', params: { audience }, query: { q: member.label } }"
            >按原词查找项目</RouterLink
          >
        </div>
        <div v-for="candidate in member.candidates" :key="candidate.id" class="member-reading">
          <RouterLink
            class="text-link member-name"
            :to="{ name: 'item', params: { audience, itemId: candidate.id }, query: route.query }"
            >{{ candidate.name }}</RouterLink
          >
          <p class="knowledge-muted">
            {{ candidate.category }} · 原表第{{ candidate.manual?.row }}行
          </p>
          <p>
            <strong>该条目标本：</strong
            ><ManualInline
              :text="fieldValue(candidate, '标本要求') || '原文未填写'"
              :audience="audience"
            />
          </p>
          <p>
            <strong>临床意义：</strong
            ><ManualInline
              :text="fieldValue(candidate, '临床意义') || '原文未填写'"
              :audience="audience"
            />
          </p>
        </div>
      </details>
    </div>
  </section>
  <section
    v-if="knowledge.panels.length"
    class="content-section relationship-panel"
    aria-label="相关组合"
  >
    <span class="eyebrow">从单项回看组合</span>
    <h2>相关组合</h2>
    <p class="knowledge-muted">
      以下组合的原文中包含此名称或缩写。不同组合的采集要求各自保留，不把它们当成可互换的开单项目。
    </p>
    <div class="related-panels">
      <RouterLink
        v-for="panel in knowledge.panels"
        :key="panel.id"
        :to="{ name: 'item', params: { audience, itemId: panel.id }, query: route.query }"
        >{{ panel.name }}</RouterLink
      >
    </div>
  </section>
</template>

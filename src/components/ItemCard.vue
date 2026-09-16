<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Bookmark } from '@lucide/vue'
import type { Audience, CatalogItem } from '../domain/content'
import { useWorkspace } from '../state/workspace'
import { fieldValue } from '../domain/knowledge'
import { departmentLabel } from '../domain/reading'
import ManualInline from './ManualInline.vue'
const props = defineProps<{ item: CatalogItem; audience: Audience }>()
const route = useRoute()
const { state, knowledge, toggleSaved } = useWorkspace()
const relation = computed(() => knowledge.value.get(props.item.id))
const target = computed(() => ({
  name: 'item',
  params: { audience: props.audience, itemId: props.item.id },
  query: { ...route.query, from: route.name === 'saved' ? 'saved' : undefined },
}))
</script>
<template>
  <article class="item-card" :data-item-id="item.id">
    <div class="card-heading">
      <div class="card-title">
        <h2>
          <RouterLink :to="target">{{ item.name }}</RouterLink>
        </h2>
        <span class="department-label">{{ departmentLabel(item) }}</span>
        <span v-if="item.abbreviation" class="abbreviation">{{ item.abbreviation }}</span>
      </div>
      <button
        class="icon-button bookmark-button"
        type="button"
        :class="{ saved: state.savedIds.includes(item.id) }"
        :aria-label="`${state.savedIds.includes(item.id) ? '取消收藏' : '收藏'}${item.name}`"
        :aria-pressed="state.savedIds.includes(item.id)"
        @click="toggleSaved(item.id)"
      >
        <Bookmark :size="18" aria-hidden="true" />
      </button>
    </div>
    <p class="card-summary">{{ item.summary.text }}</p>
    <div class="card-facts">
      <span v-if="item.manual"
        ><span class="fact-label">标本</span>
        <ManualInline :text="fieldValue(item, '标本要求') || '原文未填'" :audience="audience"
      /></span>
      <span v-if="fieldValue(item, '参考区间')"
        ><span class="fact-label">参考</span>
        <ManualInline :text="fieldValue(item, '参考区间')" :audience="audience"
      /></span>
      <span
        v-if="!item.manual && item.summary.provenance.kind === 'model'"
        class="provenance-badge model"
        >概述为模型补充 · 待核实</span
      >
      <span v-else class="card-origin">{{ item.manual ? '宣武医院手册' : '通用教学' }}</span>
    </div>
    <details v-if="relation?.members.length" class="card-member-disclosure">
      <summary>细分项目 · {{ relation.members.length }}</summary>
      <div class="card-members">
        <template v-for="(member, index) in relation.members.slice(0, 4)" :key="index">
          <RouterLink
            v-if="member.status === 'linked'"
            :title="member.candidates[0]!.name"
            :to="{ ...target, params: { audience, itemId: member.candidates[0]!.id } }"
          >
            <ManualInline :text="member.label" :audience="audience" />
          </RouterLink>
          <span v-else><ManualInline :text="member.label" :audience="audience" /></span>
        </template>
        <RouterLink :to="target">查看全部 →</RouterLink>
      </div>
    </details>
  </article>
</template>

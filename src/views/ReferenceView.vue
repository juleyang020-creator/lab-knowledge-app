<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import ClaimBlock from '../components/ClaimBlock.vue'
import ItemCard from '../components/ItemCard.vue'
import ErrorPanel from '../components/ErrorPanel.vue'
import { AudienceSchema } from '../domain/content'
import { useWorkspace } from '../state/workspace'
const route = useRoute()
const workspace = useWorkspace()
const { state } = workspace
const audience = computed(() => AudienceSchema.parse(route.params.audience))
const payload = computed(() => state.payloads[audience.value])
const topics = computed(
  () =>
    payload.value?.topics.map((topic) => ({
      ...topic,
      items: topic.itemIds.flatMap((id) => {
        const item = state.catalog?.items.find((entry) => entry.id === id)
        return item ? [item] : []
      }),
    })) ?? [],
)
</script>
<template>
  <header class="page-heading">
    <div>
      <span class="eyebrow">{{
        audience === 'professional' ? '目的、差异与解读边界' : '从理解检查，到做好准备'
      }}</span>
      <h1>{{ audience === 'professional' ? '辅助选检' : '检查准备与指南' }}</h1>
      <p>
        {{
          audience === 'professional'
            ? '以下是通用项目对照主题，不是固定开单方案。实际选检需结合临床问题和本院目录。'
            : '先看本次医院通知，再查一般说明。具体采样安排和个人报告请以医院正式渠道为准。'
        }}
      </p>
    </div>
  </header>
  <ErrorPanel
    v-if="state.errors[audience]"
    :message="state.errors[audience]"
    @retry="workspace.retryAudience(audience)"
  />
  <div v-else-if="!payload" class="loading-panel" role="status">正在加载参考内容…</div>
  <template v-else-if="audience === 'professional'">
    <section v-for="topic in topics" :key="topic.id" class="topic-section">
      <div class="topic-intro">
        <span class="eyebrow">专业参考主题</span>
        <h2>{{ topic.title }}</h2>
        <ClaimBlock :claim="topic.summary" :sources="state.catalog?.sources ?? []" />
      </div>
      <div class="topic-items">
        <ItemCard v-for="item in topic.items" :key="item.id" :item="item" :audience="audience" />
      </div>
    </section>
  </template>
  <div v-else class="guide-grid">
    <section v-for="guide in payload.guides" :key="guide.id" class="content-section">
      <h2>{{ guide.title }}</h2>
      <ClaimBlock
        v-for="claim in guide.claims"
        :key="claim.id"
        :claim="claim"
        :sources="state.catalog?.sources ?? []"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { FlaskConical, BookOpen, Bookmark, Files, Droplets } from '@lucide/vue'
import AudienceTabs from './components/AudienceTabs.vue'
import ErrorPanel from './components/ErrorPanel.vue'
import { AudienceSchema } from './domain/content'
import type { Audience } from './domain/content'
import { nextAudiencePath } from './domain/navigation'
import { useWorkspace } from './state/workspace'

const workspace = useWorkspace()
const { state } = workspace
const route = useRoute()
const router = useRouter()
const audience = computed(() => {
  const parsed = AudienceSchema.safeParse(route.params.audience)
  return parsed.success
    ? parsed.data
    : route.name === 'home'
      ? (state.rememberedAudience ?? 'professional')
      : null
})
function focusContent(): void {
  const panel = document.getElementById('audience-panel')
  panel?.focus({ preventScroll: true })
  panel?.scrollIntoView({ block: 'start' })
}
function selectAudience(target: Audience): void {
  workspace.rememberAudience(target)
  void router.push({
    path: nextAudiencePath(target, { name: route.name, itemId: route.params.itemId }),
    query: route.query,
  })
}
async function retry(): Promise<void> {
  if (await workspace.loadCatalog()) {
    if (audience.value) await workspace.loadAudience(audience.value)
  }
}
watch(
  audience,
  (value) => {
    if (!value) return
    workspace.rememberAudience(value)
    void workspace.loadAudience(value)
  },
  { immediate: true },
)
onMounted(async () => {
  await workspace.loadCatalog()
})
watch(
  () => route.fullPath,
  () => {
    document.title = `${audience.value === 'professional' ? '专业参考' : audience.value === 'patient' ? '患者阅读' : '双入口'} · 检验知识库试验版`
  },
  { immediate: true },
)
</script>

<template>
  <a class="skip-link" href="#audience-panel" @click.prevent="focusContent">跳到正文</a>
  <div class="top-shell">
    <header class="site-header shell">
      <RouterLink class="brand" to="/" aria-label="检验知识库首页">
        <span class="brand-icon"><FlaskConical :size="22" aria-hidden="true" /></span>
        <span>检验知识库<small>试验版 · 未医学审核</small></span>
      </RouterLink>
      <div class="header-links">
        <RouterLink class="source-nav-link" to="/library"
          ><Files :size="16" aria-hidden="true" />资料库</RouterLink
        >
        <RouterLink class="source-nav-link" to="/sources" aria-label="来源与进度">来源</RouterLink>
      </div>
    </header>
    <div class="shell"><AudienceTabs :selected="audience" @select="selectAudience" /></div>
    <nav v-if="audience" class="section-nav shell" aria-label="当前入口导航">
      <RouterLink
        :to="`/${audience}`"
        :class="{
          active:
            route.name === 'directory' ||
            (route.name === 'item' && route.query.from !== 'specimens'),
        }"
        ><BookOpen :size="17" aria-hidden="true" />查项目</RouterLink
      >
      <RouterLink
        :to="`/${audience}/specimens`"
        :class="{
          active:
            route.name === 'specimens' ||
            (route.name === 'item' && route.query.from === 'specimens'),
        }"
        ><Droplets :size="17" aria-hidden="true" />查标本</RouterLink
      >
      <RouterLink
        :to="audience === 'professional' ? '/professional/topics' : '/patient/guide'"
        :class="{ active: route.name === 'topics' || route.name === 'guide' }"
        >{{ audience === 'professional' ? '辅助选检' : '检查准备' }}</RouterLink
      >
      <RouterLink :to="`/${audience}/saved`" :class="{ active: route.name === 'saved' }"
        ><Bookmark :size="17" aria-hidden="true" />收藏<span
          v-if="state.savedIds.length"
          class="nav-count"
          >{{ state.savedIds.length }}</span
        ></RouterLink
      >
      <RouterLink
        v-if="state.catalog?.sources.some((source) => source.manual)"
        :to="`/${audience}/manual`"
        :class="{ active: route.name === 'manual' }"
        >采集手册</RouterLink
      >
    </nav>
  </div>
  <main
    id="audience-panel"
    class="shell main-content"
    role="tabpanel"
    :aria-labelledby="audience ? `tab-${audience}` : undefined"
    :aria-label="audience ? undefined : '选择一个阅读入口'"
    tabindex="-1"
  >
    <p v-if="!state.persistent && audience" class="storage-notice" role="status">
      当前浏览器无法保存偏好，收藏仅在本次打开期间有效。
    </p>
    <ErrorPanel v-if="state.catalogError" :message="state.catalogError" @retry="retry" />
    <div v-else-if="!state.catalog" class="loading-panel" role="status">正在加载项目资料…</div>
    <RouterView v-else />
  </main>
  <footer class="shell site-footer">
    <span>未医学审核 · 不用于个体诊断或实际开单。机构要求以就诊医院为准。</span>
    <span>{{ state.catalog?.version ?? '0.1.0-experimental' }}</span>
  </footer>
</template>

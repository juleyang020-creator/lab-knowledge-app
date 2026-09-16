import { computed, inject, reactive } from 'vue'
import type { InjectionKey } from 'vue'
import { AudienceSchema } from '../domain/content'
import type { Audience, AudiencePayload, Catalog } from '../domain/content'
import type { KnowledgeRepository } from '../domain/repository'
import { readPreferences, writePreferences } from '../adapters/preferences'
import type { StoragePort } from '../adapters/preferences'
import { createKnowledgeIndex } from '../domain/knowledge'

export function createWorkspace(repository: KnowledgeRepository, storage: StoragePort | null) {
  const preferences = readPreferences(storage)
  let contentGeneration = 0
  const state = reactive({
    catalog: null as Catalog | null,
    catalogLoading: false,
    catalogError: '',
    payloads: { professional: null, patient: null } as Record<Audience, AudiencePayload | null>,
    loading: { professional: false, patient: false },
    errors: { professional: '', patient: '' },
    savedIds: preferences.savedIds,
    rememberedAudience: preferences.audience,
    persistent: preferences.persistent,
    // Ephemeral input: deliberately excluded from persist(), URLs and content requests.
    specimenQuery: '',
    specimenPage: 1,
  })
  const knowledge = computed(() => createKnowledgeIndex(state.catalog?.items ?? []))
  function invalidateContent(): void {
    // Pending reads may finish, but cannot publish into the next content generation.
    contentGeneration += 1
    repository.invalidateContent()
    state.catalog = null
    state.catalogLoading = false
    state.catalogError = ''
    for (const audience of ['professional', 'patient'] as const) {
      state.payloads[audience] = null
      state.loading[audience] = false
      state.errors[audience] = ''
    }
  }
  function persist(): void {
    state.persistent = writePreferences(storage, {
      savedIds: state.savedIds,
      audience: state.rememberedAudience,
    })
  }
  async function loadCatalog(): Promise<boolean> {
    if (state.catalog) return true
    const generation = contentGeneration
    state.catalogLoading = true
    state.catalogError = ''
    try {
      const catalog = await repository.getCatalog()
      if (generation !== contentGeneration) return false
      state.catalog = catalog
      const knownIds = new Set(state.catalog.items.map((item) => item.id))
      state.savedIds = state.savedIds.filter((id) => knownIds.has(id))
      persist()
      return true
    } catch {
      if (generation === contentGeneration) {
        state.catalogError = '项目资料加载失败。请检查连接后重试；不会以模型内容自动填补加载错误。'
      }
      return false
    } finally {
      if (generation === contentGeneration) state.catalogLoading = false
    }
  }
  async function loadAudience(audience: Audience): Promise<boolean> {
    if (state.payloads[audience]) return true
    const generation = contentGeneration
    state.loading[audience] = true
    state.errors[audience] = ''
    try {
      if (!(await loadCatalog()) || generation !== contentGeneration) return false
      const payload = await repository.getAudience(audience)
      if (generation !== contentGeneration) return false
      state.payloads[audience] = payload
      return true
    } catch {
      if (generation === contentGeneration) {
        state.errors[audience] = '该入口的详细资料加载失败，请重试。'
      }
      return false
    } finally {
      if (generation === contentGeneration) state.loading[audience] = false
    }
  }
  async function retryAudience(audience: Audience): Promise<boolean> {
    invalidateContent()
    return loadAudience(audience)
  }
  function toggleSaved(id: string): void {
    if (!state.catalog?.items.some((item) => item.id === id)) return
    state.savedIds = state.savedIds.includes(id)
      ? state.savedIds.filter((saved) => saved !== id)
      : [...state.savedIds, id]
    persist()
  }
  function rememberAudience(value: Audience): void {
    state.rememberedAudience = AudienceSchema.parse(value)
    persist()
  }
  return {
    state,
    knowledge,
    invalidateContent,
    loadCatalog,
    loadAudience,
    retryAudience,
    toggleSaved,
    rememberAudience,
  }
}
export type Workspace = ReturnType<typeof createWorkspace>
export const workspaceKey: InjectionKey<Workspace> = Symbol('lab-knowledge-workspace')
export function useWorkspace(): Workspace {
  const workspace = inject(workspaceKey)
  if (!workspace) throw new Error('阅读工作区尚未初始化')
  return workspace
}

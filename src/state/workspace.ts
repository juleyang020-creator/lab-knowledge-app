import { computed, inject, reactive } from 'vue'
import type { InjectionKey } from 'vue'
import type { AudiencePayload, Catalog, ContentBundle } from '../domain/content'
import type { DiseasesPayload } from '../domain/disease'
import type {
  BookItemsPayload,
  BookSearchEntry,
  BooksManifest,
  ChapterContent,
} from '../domain/book'
import type { KnowledgeRepository } from '../domain/repository'
import { readPreferences, writePreferences } from '../adapters/preferences'
import type { StoragePort } from '../adapters/preferences'
import { createKnowledgeIndex } from '../domain/knowledge'
import { validateBundle } from '../domain/validation'

export function createWorkspace(repository: KnowledgeRepository, storage: StoragePort | null) {
  const preferences = readPreferences(storage)
  let contentGeneration = 0
  const state = reactive({
    catalog: null as Catalog | null,
    catalogLoading: false,
    catalogError: '',
    articles: null as AudiencePayload | null,
    articlesLoading: false,
    articlesError: '',
    books: null as BooksManifest | null,
    booksError: '',
    diseases: null as DiseasesPayload | null,
    diseasesError: '',
    /** 来源页跨文件一致性校验结果（catalog+professional 两文件） */
    qa: null as ContentBundle | null,
    qaError: '',
    savedIds: preferences.savedIds,
    persistent: preferences.persistent,
  })
  const knowledge = computed(() => createKnowledgeIndex(state.catalog?.items ?? []))
  function invalidateContent(): void {
    // Pending reads may finish, but cannot publish into the next content generation.
    contentGeneration += 1
    repository.invalidateContent()
    state.catalog = null
    state.catalogLoading = false
    state.catalogError = ''
    state.articles = null
    state.articlesLoading = false
    state.articlesError = ''
    state.books = null
    state.booksError = ''
    state.diseases = null
    state.diseasesError = ''
    state.qa = null
    state.qaError = ''
  }
  function persist(): void {
    state.persistent = writePreferences(storage, { savedIds: state.savedIds })
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
  async function loadArticles(): Promise<boolean> {
    if (state.articles) return true
    const generation = contentGeneration
    state.articlesLoading = true
    state.articlesError = ''
    try {
      if (!(await loadCatalog()) || generation !== contentGeneration) return false
      const payload = await repository.getArticles()
      if (generation !== contentGeneration) return false
      state.articles = payload
      return true
    } catch {
      if (generation === contentGeneration) state.articlesError = '详细资料加载失败，请重试。'
      return false
    } finally {
      if (generation === contentGeneration) state.articlesLoading = false
    }
  }
  async function loadBooks(): Promise<boolean> {
    if (state.books) return true
    const generation = contentGeneration
    state.booksError = ''
    try {
      const manifest = await repository.getBooksManifest()
      if (generation !== contentGeneration) return false
      state.books = manifest
      return true
    } catch {
      if (generation === contentGeneration)
        state.booksError = '教材目录加载失败。本机首次使用请先运行 pnpm books:import。'
      return false
    }
  }
  async function loadDiseases(): Promise<boolean> {
    if (state.diseases) return true
    const generation = contentGeneration
    state.diseasesError = ''
    try {
      if (!(await loadCatalog()) || generation !== contentGeneration) return false
      const payload = await repository.getDiseases()
      if (generation !== contentGeneration) return false
      state.diseases = payload
      return true
    } catch {
      if (generation === contentGeneration)
        state.diseasesError = '病种关联加载失败。本机首次使用请先运行 pnpm diseases:build。'
      return false
    }
  }
  /**
   * 来源页数据 QA：拉齐两文件跑 validateBundle。
   * 结果缓存在 state.qa；重挂载/重复调用共享同一份，不重复取数。
   */
  async function loadSourcesQA(): Promise<boolean> {
    if (state.qa) return true
    const generation = contentGeneration
    state.qaError = ''
    try {
      if (!(await loadCatalog()) || !(await loadArticles())) {
        state.qaError = '部分资料未能加载，暂时不能统计来源。'
        return false
      }
      if (generation !== contentGeneration) return false
      const [catalog, professional] = await Promise.all([
        repository.getCatalog(),
        repository.getArticles(),
      ])
      if (generation !== contentGeneration) return false
      state.qa = validateBundle({ catalog, professional })
      return true
    } catch {
      if (generation === contentGeneration)
        state.qaError = '资料之间的来源信息不一致，请检查内容文件后重试。'
      return false
    }
  }
  async function retrySourcesQA(): Promise<boolean> {
    invalidateContent()
    return loadSourcesQA()
  }
  async function retryAll(): Promise<void> {
    invalidateContent()
    await loadCatalog()
  }
  async function retryArticles(): Promise<boolean> {
    invalidateContent()
    return (await loadCatalog()) && (await loadArticles())
  }
  function toggleSaved(id: string): void {
    if (!state.catalog?.items.some((item) => item.id === id)) return
    state.savedIds = state.savedIds.includes(id)
      ? state.savedIds.filter((saved) => saved !== id)
      : [...state.savedIds, id]
    persist()
  }
  return {
    state,
    knowledge,
    invalidateContent,
    loadCatalog,
    loadArticles,
    loadBooks,
    loadDiseases,
    loadSourcesQA,
    retrySourcesQA,
    retryAll,
    retryArticles,
    toggleSaved,
    getChapter: (bookId: string, chapterId: string): Promise<ChapterContent> =>
      repository.getChapter(bookId, chapterId),
    getBookSearch: (bookId: string): Promise<BookSearchEntry[]> => repository.getBookSearch(bookId),
    getBookItems: (bookId: string): Promise<BookItemsPayload | null> =>
      repository.getBookItems(bookId),
  }
}
export type Workspace = ReturnType<typeof createWorkspace>
export const workspaceKey: InjectionKey<Workspace> = Symbol('lab-knowledge-workspace')
export function useWorkspace(): Workspace {
  const workspace = inject(workspaceKey)
  if (!workspace) throw new Error('阅读工作区尚未初始化')
  return workspace
}

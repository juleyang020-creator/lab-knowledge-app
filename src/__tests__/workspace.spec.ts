import { describe, expect, it } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createHttpRepository } from '../adapters/httpRepository'
import { PREFERENCE_KEY } from '../adapters/preferences'
import { createWorkspace } from '../state/workspace'
import { contentBundle, deferred, jsonResponse } from './fixtures'
import type { KnowledgeRepository } from '../domain/repository'
import type { BookSearchEntry, BooksManifest, ChapterContent } from '../domain/book'

function stubRepository(bundle: ReturnType<typeof contentBundle>): KnowledgeRepository {
  return {
    getCatalog: async () => bundle.catalog,
    getArticles: async () => bundle.professional,
    getDiseases: async () => {
      throw new Error('no diseases in test')
    },
    getBooksManifest: async () => ({}) as BooksManifest,
    getChapter: async () => ({}) as ChapterContent,
    getBookSearch: async () => [] as BookSearchEntry[],
    getBookItems: async () => null,
    invalidateContent: () => {},
  }
}

describe('内容失效后的在途请求隔离', () => {
  describe.each(['catalog', 'professional'] as const)('%s 工作区数据', (name) => {
    describe.each(['pending', 'resolved'])('新请求 %s', (status) => {
      it.each(['success', 'failure'])(
        '旧请求 %s 不能改写新一代数据、错误或加载状态',
        async (outcome) => {
          const oldBundle = contentBundle()
          oldBundle.catalog.version = 'stale'
          if (name === 'catalog') oldBundle.catalog.items[0]!.id = 'outdated'
          else oldBundle.professional.articles[0]!.sections[0]!.title = '旧正文'
          const freshBundle = contentBundle()
          freshBundle.catalog.version = 'fresh'
          const stale = deferred<Response>()
          const fresh = deferred<Response>()
          let calls = 0
          const repository = createHttpRepository('/', async (url) => {
            if (url.endsWith(`/${name}.json`)) {
              calls += 1
              return calls === 1 ? stale.promise : fresh.promise
            }
            return jsonResponse(freshBundle.catalog)
          })
          const preferences = JSON.stringify({ version: 1, savedIds: ['sample'] })
          const stored = new Map([[PREFERENCE_KEY, preferences]])
          const workspace = createWorkspace(repository, {
            getItem: (key) => stored.get(key) ?? null,
            setItem: (key, value) => {
              stored.set(key, value)
            },
          })
          const load = () =>
            name === 'catalog' ? workspace.loadCatalog() : workspace.loadArticles()
          const data = () =>
            name === 'catalog' ? workspace.state.catalog : workspace.state.articles
          const loading = () =>
            name === 'catalog' ? workspace.state.catalogLoading : workspace.state.articlesLoading
          const error = () =>
            name === 'catalog' ? workspace.state.catalogError : workspace.state.articlesError
          const oldRequest = load()
          await flushPromises()
          expect(calls).toBe(1)

          workspace.invalidateContent()
          expect(workspace.state.catalog).toBeNull()
          expect(workspace.state.articles).toBeNull()
          expect(workspace.state.savedIds).toEqual(['sample'])
          expect(stored.get(PREFERENCE_KEY)).toBe(preferences)
          const freshRequest = load()
          await flushPromises()
          expect(calls).toBe(2)
          const freshPayload = name === 'catalog' ? freshBundle.catalog : freshBundle.professional
          const stalePayload = name === 'catalog' ? oldBundle.catalog : oldBundle.professional
          if (status === 'resolved') {
            fresh.resolve(jsonResponse(freshPayload))
            await freshRequest
          }
          if (outcome === 'success') stale.resolve(jsonResponse(stalePayload))
          else stale.reject(new Error('旧请求失败'))
          const oldResult = await oldRequest

          expect.soft(data()).toEqual(status === 'pending' ? null : freshPayload)
          expect.soft(error()).toBe('')
          expect.soft(loading()).toBe(status === 'pending')
          expect.soft(oldResult).toBe(false)
          if (status === 'pending') fresh.resolve(jsonResponse(freshPayload))
          expect(await freshRequest).toBe(true)
          expect(data()).toEqual(freshPayload)
          expect(error()).toBe('')
          expect(loading()).toBe(false)
          expect(await load()).toBe(true)
          expect(calls).toBe(2)
          expect(workspace.state.savedIds).toEqual(['sample'])
          expect(stored.get(PREFERENCE_KEY)).toBe(preferences)
        },
      )
    })
  })

  it.each(['pending', 'resolved'])(
    '目录 %s 时失效，旧的正文加载不会继续发起请求',
    async (status) => {
      const bundle = contentBundle()
      const catalog = deferred<Response>()
      const requests: string[] = []
      let firstCatalog = true
      const workspace = createWorkspace(
        createHttpRepository('/', async (url) => {
          requests.push(url)
          if (url.endsWith('/catalog.json')) {
            if (firstCatalog) {
              firstCatalog = false
              return catalog.promise
            }
            return jsonResponse(bundle.catalog)
          }
          return jsonResponse(bundle.professional)
        }),
        null,
      )
      if (status === 'resolved') {
        catalog.resolve(jsonResponse(bundle.catalog))
        await workspace.loadCatalog()
      }
      const stale = workspace.loadArticles()
      workspace.invalidateContent()
      expect(await workspace.loadCatalog()).toBe(true)
      if (status === 'pending') catalog.resolve(jsonResponse(bundle.catalog))
      expect(await stale).toBe(false)
      expect(workspace.state.articles).toBeNull()
      expect(requests).toEqual(['/content/catalog.json', '/content/catalog.json'])
    },
  )
})

describe('专业速查工作区', () => {
  it('收藏在会话内可用，存储不可用时明确降级', async () => {
    expect(createWorkspace).toBeTypeOf('function')
    const bundle = contentBundle()
    const workspace = createWorkspace(stubRepository(bundle), null)
    await workspace.loadCatalog()
    workspace.toggleSaved('sample')
    await workspace.loadArticles()
    expect(workspace.state.savedIds).toEqual(['sample'])
    expect(workspace.state.persistent).toBe(false)
    expect(workspace.state.articles?.audience).toBe('professional')
    workspace.toggleSaved('sample')
    expect(workspace.state.savedIds).toEqual([])
  })
  it('未知项目不能进入收藏，加载错误会显示并可重试', async () => {
    let broken = true
    const bundle = contentBundle()
    const repository = stubRepository(bundle)
    repository.getCatalog = async () => {
      if (broken) throw new Error('offline')
      return bundle.catalog
    }
    const workspace = createWorkspace(repository, null)
    expect(await workspace.loadCatalog()).toBe(false)
    expect(workspace.state.catalogError).not.toBe('')
    workspace.toggleSaved('missing')
    expect(workspace.state.savedIds).toEqual([])
    broken = false
    expect(await workspace.loadCatalog()).toBe(true)
    expect(workspace.state.catalogError).toBe('')
  })
  it('教材清单失败时给出可操作的提示', async () => {
    const bundle = contentBundle()
    const repository = stubRepository(bundle)
    repository.getBooksManifest = async () => {
      throw new Error('404')
    }
    const workspace = createWorkspace(repository, null)
    expect(await workspace.loadBooks()).toBe(false)
    expect(workspace.state.booksError).toContain('books:import')
  })
})

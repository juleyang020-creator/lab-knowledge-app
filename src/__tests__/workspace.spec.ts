import { describe, expect, it } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createHttpRepository } from '../adapters/httpRepository'
import { PREFERENCE_KEY } from '../adapters/preferences'
import { createWorkspace } from '../state/workspace'
import { contentBundle, deferred, jsonResponse } from './fixtures'

describe('内容失效后的在途请求隔离', () => {
  describe.each(['catalog', 'patient', 'professional'] as const)('%s 工作区数据', (name) => {
    describe.each(['pending', 'resolved'])('新请求 %s', (status) => {
      it.each(['success', 'failure'])(
        '旧请求 %s 不能改写新一代数据、错误或加载状态',
        async (outcome) => {
          const oldBundle = contentBundle()
          oldBundle.catalog.version = 'stale'
          if (name === 'catalog') oldBundle.catalog.items[0]!.id = 'outdated'
          else oldBundle[name].articles[0]!.sections[0]!.title = '旧正文'
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
          const preferences = JSON.stringify({
            version: 1,
            savedIds: ['sample'],
            audience: 'patient',
          })
          const stored = new Map([[PREFERENCE_KEY, preferences]])
          const workspace = createWorkspace(repository, {
            getItem: (key) => stored.get(key) ?? null,
            setItem: (key, value) => {
              stored.set(key, value)
            },
          })
          const load = () =>
            name === 'catalog' ? workspace.loadCatalog() : workspace.loadAudience(name)
          const data = () =>
            name === 'catalog' ? workspace.state.catalog : workspace.state.payloads[name]
          const loading = () =>
            name === 'catalog' ? workspace.state.catalogLoading : workspace.state.loading[name]
          const error = () =>
            name === 'catalog' ? workspace.state.catalogError : workspace.state.errors[name]
          const oldRequest = load()
          await flushPromises()
          expect(calls).toBe(1)

          workspace.invalidateContent()
          expect(workspace.state.catalog).toBeNull()
          expect(workspace.state.payloads).toEqual({ professional: null, patient: null })
          expect(workspace.state.savedIds).toEqual(['sample'])
          expect(workspace.state.rememberedAudience).toBe('patient')
          expect(stored.get(PREFERENCE_KEY)).toBe(preferences)
          const freshRequest = load()
          await flushPromises()
          expect(calls).toBe(2)
          if (status === 'resolved') {
            fresh.resolve(jsonResponse(freshBundle[name]))
            await freshRequest
          }
          if (outcome === 'success') stale.resolve(jsonResponse(oldBundle[name]))
          else stale.reject(new Error('旧请求失败'))
          const oldResult = await oldRequest

          expect.soft(data()).toEqual(status === 'pending' ? null : freshBundle[name])
          expect.soft(error()).toBe('')
          expect.soft(loading()).toBe(status === 'pending')
          expect.soft(oldResult).toBe(false)
          if (status === 'pending') fresh.resolve(jsonResponse(freshBundle[name]))
          expect(await freshRequest).toBe(true)
          expect(data()).toEqual(freshBundle[name])
          expect(error()).toBe('')
          expect(loading()).toBe(false)
          expect(await load()).toBe(true)
          expect(calls).toBe(2)
          expect(workspace.state.savedIds).toEqual(['sample'])
          expect(workspace.state.rememberedAudience).toBe('patient')
          expect(stored.get(PREFERENCE_KEY)).toBe(preferences)
        },
      )
    })
  })

  it.each(['pending', 'resolved'])(
    '目录 %s 时失效，旧入口调用不会继续发起正文请求',
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
          return jsonResponse(url.endsWith('/patient.json') ? bundle.patient : bundle.professional)
        }),
        null,
      )
      if (status === 'resolved') {
        catalog.resolve(jsonResponse(bundle.catalog))
        await workspace.loadCatalog()
      }
      const stale = workspace.loadAudience('professional')
      workspace.invalidateContent()
      expect(await workspace.loadAudience('patient')).toBe(true)
      if (status === 'pending') catalog.resolve(jsonResponse(bundle.catalog))
      expect(await stale).toBe(false)
      expect(workspace.state.payloads.professional).toBeNull()
      expect(workspace.state.payloads.patient).toEqual(bundle.patient)
      expect(requests).toEqual([
        '/content/catalog.json',
        '/content/catalog.json',
        '/content/patient.json',
      ])
    },
  )
})

describe('试验版阅读工作区', () => {
  it('同一项目收藏在两个入口共享，存储不可用时仍可在会话内操作', async () => {
    expect(createWorkspace).toBeTypeOf('function')
    const bundle = contentBundle()
    const workspace = createWorkspace(
      {
        getCatalog: async () => bundle.catalog,
        getAudience: async (audience) => bundle[audience],
        invalidateContent: () => {},
      },
      null,
    )
    await workspace.loadCatalog()
    workspace.toggleSaved('sample')
    workspace.rememberAudience('patient')
    await workspace.loadAudience('patient')
    workspace.rememberAudience('professional')
    await workspace.loadAudience('professional')
    expect(workspace.state.savedIds).toEqual(['sample'])
    expect(workspace.state.persistent).toBe(false)
    expect(workspace.state.payloads.patient?.audience).toBe('patient')
    expect(workspace.state.payloads.professional?.audience).toBe('professional')
    workspace.toggleSaved('sample')
    expect(workspace.state.savedIds).toEqual([])
  })
  it('未知项目不能进入收藏，加载错误会显示并可重试', async () => {
    let broken = true
    const bundle = contentBundle()
    const workspace = createWorkspace(
      {
        getCatalog: async () => {
          if (broken) throw new Error('offline')
          return bundle.catalog
        },
        getAudience: async (audience) => bundle[audience],
        invalidateContent: () => {},
      },
      null,
    )
    expect(await workspace.loadCatalog()).toBe(false)
    expect(workspace.state.catalogError).not.toBe('')
    workspace.toggleSaved('missing')
    expect(workspace.state.savedIds).toEqual([])
    broken = false
    expect(await workspace.loadCatalog()).toBe(true)
    expect(workspace.state.catalogError).toBe('')
  })
})

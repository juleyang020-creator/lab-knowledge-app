import { describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createHttpRepository } from '../adapters/httpRepository'
import { contentBundle, deferred, jsonResponse } from './fixtures'
import type { Audience } from '../domain/content'

describe('按阅读入口加载并验证内容', () => {
  it('默认网络取数使用 no-store，内容失效后不被浏览器缓存挡住刷新', async () => {
    const bundle = contentBundle()
    const fetcher = vi.fn(async (url: string) =>
      jsonResponse(url.endsWith('/catalog.json') ? bundle.catalog : bundle.patient),
    )
    vi.stubGlobal('fetch', fetcher)
    try {
      const repository = createHttpRepository('/')
      await repository.getAudience('patient')
      await repository.getAudience('patient')
      repository.invalidateContent()
      await repository.getAudience('patient')
      expect(fetcher.mock.calls).toEqual([
        ['/content/catalog.json', { cache: 'no-store' }],
        ['/content/patient.json', { cache: 'no-store' }],
        ['/content/catalog.json', { cache: 'no-store' }],
        ['/content/patient.json', { cache: 'no-store' }],
      ])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  describe.each(['catalog', 'patient', 'professional'] as const)('%s 缓存失效', (name) => {
    it.each(['pending', 'resolved'])('旧失败不能删除新的 %s 请求缓存', async (status) => {
      const bundle = contentBundle()
      const stale = deferred<Response>()
      const fresh = deferred<Response>()
      let calls = 0
      const repository = createHttpRepository('/', async (url) => {
        if (url.endsWith(`/${name}.json`)) {
          calls += 1
          return (calls === 1 ? stale.promise : fresh.promise).then((response) => response.clone())
        }
        return jsonResponse(bundle.catalog)
      })
      const load = () =>
        name === 'catalog' ? repository.getCatalog() : repository.getAudience(name)
      const oldRequest = load()
      const oldFailure = oldRequest.catch((error: unknown) => error)
      await flushPromises()
      expect(calls).toBe(1)

      repository.invalidateContent()
      const freshRequest = load()
      await flushPromises()
      expect(calls).toBe(2)
      if (status === 'resolved') {
        fresh.resolve(jsonResponse(bundle[name]))
        await freshRequest
      }
      stale.reject(new Error('旧请求失败'))
      expect(await oldFailure).toEqual(new Error('旧请求失败'))
      const concurrentRequest = load()
      if (status === 'pending') fresh.resolve(jsonResponse(bundle[name]))
      const [current, concurrent] = await Promise.all([freshRequest, concurrentRequest])

      expect(current).toEqual(bundle[name])
      expect(concurrent).toBe(current)
      expect(await load()).toBe(current)
      expect(calls).toBe(2)
    })
  })

  it('患者阅读不会提前加载专业正文，重复请求复用结果', async () => {
    expect(createHttpRepository).toBeTypeOf('function')
    const bundle = contentBundle()
    const requests: string[] = []
    const fetcher = async (url: string) => {
      requests.push(url)
      return jsonResponse(url.endsWith('catalog.json') ? bundle.catalog : bundle.patient)
    }
    const repository = createHttpRepository('/demo/', fetcher)
    expect(requests).toEqual([])
    await Promise.all([repository.getAudience('patient'), repository.getAudience('patient')])
    expect(requests).toEqual(['/demo/content/catalog.json', '/demo/content/patient.json'])
  })
  it('网络失败后可以重试，不缓存失败结果', async () => {
    let calls = 0
    const repository = createHttpRepository('/', async () =>
      ++calls === 1
        ? new Response('Unavailable', { status: 503 })
        : jsonResponse(contentBundle().catalog),
    )
    await expect(repository.getCatalog()).rejects.toThrow('503')
    await expect(repository.getCatalog()).resolves.toHaveProperty('items')
    expect(calls).toBe(2)
  })
  it('拒绝把专业内容冒充患者内容', async () => {
    const bundle = contentBundle()
    const repository = createHttpRepository('/', async (url) =>
      jsonResponse(url.endsWith('catalog.json') ? bundle.catalog : bundle.professional),
    )
    await expect(repository.getAudience('patient')).rejects.toThrow('阅读入口')
  })
  it('非法入口参数不用于拼接读取路径', async () => {
    const requests: string[] = []
    const repository = createHttpRepository('/', async (url) => {
      requests.push(url)
      return jsonResponse(contentBundle().catalog)
    })
    await expect(repository.getAudience('../private' as Audience)).rejects.toThrow()
    expect(requests).toHaveLength(0)
  })
})

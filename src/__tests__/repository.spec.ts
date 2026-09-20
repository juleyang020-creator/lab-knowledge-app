import { describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createHttpRepository } from '../adapters/httpRepository'
import { contentBundle, deferred, jsonResponse } from './fixtures'
import type { BookSearchEntry, BooksManifest, ChapterContent } from '../domain/book'

function bookFixture(): {
  manifest: BooksManifest
  chapter: ChapterContent
  search: BookSearchEntry[]
} {
  return {
    manifest: {
      version: 'books-test',
      generatedAt: '2026-09-19',
      books: [
        {
          id: 'book-98',
          title: '临床生物化学检验技术',
          shortTitle: '生物化学',
          edition: '2025年第2版',
          publisher: '人民卫生出版社',
          year: 2025,
          sourceDir: '98-测试',
          chapters: [
            {
              id: '001',
              title: '绪论',
              part: '',
              file: '001.json',
              lines: 3,
              sha256: 'a'.repeat(64),
            },
          ],
        },
      ],
    },
    chapter: {
      bookId: 'book-98',
      id: '001',
      title: '绪论',
      part: '',
      sha256: 'a'.repeat(64),
      lineCount: 3,
      pdfPages: [23],
      pageMarkers: [{ line: 1, pdfPage: 23, printedPage: 1 }],
      sections: [
        {
          id: 's1',
          title: '绪论',
          level: 1,
          lineStart: 1,
          lineEnd: 3,
          blocks: [{ kind: 'paragraph', text: '测试正文', line: 2 }],
        },
      ],
    },
    search: [{ c: '001', l: 2, t: '测试正文' }],
  }
}

describe('内容仓库', () => {
  it('默认网络取数使用 no-store，内容失效后不被浏览器缓存挡住刷新', async () => {
    const bundle = contentBundle()
    const fetcher = vi.fn(async (url: string) =>
      jsonResponse(url.endsWith('/catalog.json') ? bundle.catalog : bundle.professional),
    )
    vi.stubGlobal('fetch', fetcher)
    try {
      const repository = createHttpRepository('/')
      await repository.getArticles()
      await repository.getArticles()
      repository.invalidateContent()
      await repository.getArticles()
      expect(fetcher.mock.calls).toEqual([
        ['/content/catalog.json', { cache: 'no-store' }],
        ['/content/professional.json', { cache: 'no-store' }],
        ['/content/catalog.json', { cache: 'no-store' }],
        ['/content/professional.json', { cache: 'no-store' }],
      ])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  describe.each(['catalog', 'professional', 'books'] as const)('%s 缓存失效', (name) => {
    it.each(['pending', 'resolved'])('旧失败不能删除新的 %s 请求缓存', async (status) => {
      const bundle = contentBundle()
      const { manifest } = bookFixture()
      const payloads = {
        catalog: bundle.catalog,
        professional: bundle.professional,
        books: manifest,
      }
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
        name === 'catalog'
          ? repository.getCatalog()
          : name === 'professional'
            ? repository.getArticles()
            : repository.getBooksManifest()
      const oldRequest = load()
      const oldFailure = oldRequest.catch((error: unknown) => error)
      await flushPromises()
      expect(calls).toBe(1)

      repository.invalidateContent()
      const freshRequest = load()
      await flushPromises()
      expect(calls).toBe(2)
      if (status === 'resolved') {
        fresh.resolve(jsonResponse(payloads[name]))
        await freshRequest
      }
      stale.reject(new Error('旧请求失败'))
      expect(await oldFailure).toEqual(new Error('旧请求失败'))
      const concurrentRequest = load()
      if (status === 'pending') fresh.resolve(jsonResponse(payloads[name]))
      const [current, concurrent] = await Promise.all([freshRequest, concurrentRequest])

      expect(current).toEqual(payloads[name])
      expect(concurrent).toBe(current)
      expect(await load()).toBe(current)
      expect(calls).toBe(2)
    })
  })

  it('教材章节与检索索引按书懒加载并复用', async () => {
    const { chapter, search } = bookFixture()
    const requests: string[] = []
    const repository = createHttpRepository('/demo/', async (url) => {
      requests.push(url)
      return jsonResponse(url.endsWith('search.json') ? search : chapter)
    })
    expect(requests).toEqual([])
    await Promise.all([
      repository.getChapter('book-98', '001'),
      repository.getChapter('book-98', '001'),
    ])
    await repository.getBookSearch('book-98')
    expect(requests).toEqual([
      '/demo/content/books/book-98/001.json',
      '/demo/content/books/book-98/search.json',
    ])
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

  it('章节内容与声明不符（结构非法）直接拒绝', async () => {
    const repository = createHttpRepository('/', async () => jsonResponse({ bookId: 'book-98' }))
    await expect(repository.getChapter('book-98', '001')).rejects.toThrow()
  })

  it('非法书号或章节号不用于拼接读取路径', async () => {
    const requests: string[] = []
    const repository = createHttpRepository('/', async (url) => {
      requests.push(url)
      return jsonResponse(contentBundle().catalog)
    })
    expect(() => repository.getChapter('../private', '001')).toThrow()
    expect(() => repository.getChapter('book-98', '../secret')).toThrow()
    expect(() => repository.getBookSearch('../private')).toThrow()
    expect(requests).toHaveLength(0)
  })
})

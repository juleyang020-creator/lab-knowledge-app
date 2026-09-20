import type { AudiencePayload, Catalog } from '../domain/content'
import {
  BookIdSchema,
  BookItemsPayloadSchema,
  BooksManifestSchema,
  ChapterContentSchema,
  ChapterIdSchema,
  SearchEntrySchema,
} from '../domain/book'
import type {
  BookItemsPayload,
  BookSearchEntry,
  BooksManifest,
  ChapterContent,
} from '../domain/book'
import type { KnowledgeRepository } from '../domain/repository'
import { validateDiseases } from '../domain/disease'
import type { DiseasesPayload } from '../domain/disease'
import { validateCatalog, validateAudience } from '../domain/validation'
import { z } from 'zod'

export function createHttpRepository(
  baseUrl: string,
  // Memory promises still deduplicate reads; network reads must see corrected content.
  fetcher: (url: string) => Promise<Response> = (url) => fetch(url, { cache: 'no-store' }),
): KnowledgeRepository {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const cache = new Map<string, Promise<unknown>>()

  function invalidateContent(): void {
    cache.clear()
  }

  async function readJSON(path: string): Promise<unknown> {
    const response = await fetcher(`${base}content/${path}`)
    if (!response.ok) throw new Error(`资料加载失败（HTTP ${response.status}）`)
    return response.json()
  }
  function cached<T>(key: string, read: () => Promise<T>): Promise<T> {
    let promise = cache.get(key) as Promise<T> | undefined
    if (!promise) {
      promise = read().catch((error) => {
        if (cache.get(key) === promise) cache.delete(key)
        throw error
      })
      cache.set(key, promise)
    }
    return promise
  }

  function getCatalog(): Promise<Catalog> {
    return cached('catalog', () => readJSON('catalog.json').then(validateCatalog))
  }
  async function getArticles(): Promise<AudiencePayload> {
    return cached('articles', async () => {
      const catalog = await getCatalog()
      return validateAudience(await readJSON('professional.json'), catalog, 'professional')
    })
  }
  function getBooksManifest(): Promise<BooksManifest> {
    return cached('books', () =>
      readJSON('books.json').then((data) => BooksManifestSchema.parse(data)),
    )
  }
  function getDiseases(): Promise<DiseasesPayload> {
    return cached('diseases', async () => {
      const catalog = await getCatalog()
      return validateDiseases(await readJSON('diseases.json'), catalog)
    })
  }
  function getChapter(bookId: string, chapterId: string): Promise<ChapterContent> {
    const safeBook = BookIdSchema.parse(bookId)
    const safeChapter = ChapterIdSchema.parse(chapterId)
    return cached(`chapter:${safeBook}/${safeChapter}`, () =>
      readJSON(`books/${safeBook}/${safeChapter}.json`).then((data) =>
        ChapterContentSchema.parse(data),
      ),
    )
  }
  function getBookSearch(bookId: string): Promise<BookSearchEntry[]> {
    const safeBook = BookIdSchema.parse(bookId)
    return cached(`book-search:${safeBook}`, () =>
      readJSON(`books/${safeBook}/search.json`).then((data) =>
        z.array(SearchEntrySchema).parse(data),
      ),
    )
  }
  /** 教材条目切片是可选产物：404 视为该书尚未结构化，返回空而不是报错。 */
  function getBookItems(bookId: string): Promise<BookItemsPayload | null> {
    const safeBook = BookIdSchema.parse(bookId)
    return cached(`book-items:${safeBook}`, async () => {
      const response = await fetcher(`${base}content/books/${safeBook}-items.json`)
      if (response.status === 404) return null
      if (!response.ok) throw new Error(`资料加载失败（HTTP ${response.status}）`)
      return BookItemsPayloadSchema.parse(await response.json())
    })
  }
  return {
    invalidateContent,
    getCatalog,
    getArticles,
    getDiseases,
    getBooksManifest,
    getChapter,
    getBookSearch,
    getBookItems,
  }
}

import type { AudiencePayload, Catalog } from './content'
import type { DiseasesPayload } from './disease'
import type { BookItemsPayload, BookSearchEntry, BooksManifest, ChapterContent } from './book'

/** Content delivery is replaceable; a future authenticated service implements this boundary. */
export interface KnowledgeRepository {
  /** Forget all content together; reading preferences are outside this boundary. */
  invalidateContent(): void
  getCatalog(): Promise<Catalog>
  /** 专业端条目概述（原 professional 载荷）；患者入口已移除。 */
  getArticles(): Promise<AudiencePayload>
  /** 病种关联库（build-diseases.ts 生成，照录手册原文）。 */
  getDiseases(): Promise<DiseasesPayload>
  getBooksManifest(): Promise<BooksManifest>
  getChapter(bookId: string, chapterId: string): Promise<ChapterContent>
  getBookSearch(bookId: string): Promise<BookSearchEntry[]>
  /** 教材条目切片（可选产物，未结构化时返回 null）。 */
  getBookItems(bookId: string): Promise<BookItemsPayload | null>
}

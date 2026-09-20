import { z } from 'zod'
import { inlineTokens, manualText, parseManual, withoutComments } from './manual.ts'
import type { ManualSection } from './manual.ts'

/**
 * 教材分章阅读的数据契约。
 * 章节内容照录源 Markdown：sections 无损覆盖原文（parseManual 内置不变量），
 * blocks 覆盖每个标题下的全部正文行（coverage 由导入脚本独立核验）。
 */

export const BookIdSchema = z.string().regex(/^book-\d+$/)
export const ChapterIdSchema = z.string().regex(/^[a-z0-9.-]+$/)

export const PageMarkerSchema = z
  .object({
    line: z.number().int().positive(),
    pdfPage: z.number().int().positive(),
    printedPage: z.number().int().positive().nullable(),
  })
  .strict()
export type PageMarker = z.infer<typeof PageMarkerSchema>

export const ChapterBlockSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('paragraph'), text: z.string(), line: z.number().int().positive() })
    .strict(),
  z
    .object({
      kind: z.literal('table'),
      headers: z.array(z.string()).min(1),
      rows: z.array(
        z.object({ cells: z.array(z.string()).min(1), line: z.number().int().positive() }).strict(),
      ),
      line: z.number().int().positive(),
    })
    .strict(),
])
export type ChapterBlock = z.infer<typeof ChapterBlockSchema>

export const ChapterSectionSchema = z
  .object({
    id: z.string().min(1),
    title: z.string(),
    level: z.number().int().min(1).max(6),
    lineStart: z.number().int().positive(),
    lineEnd: z.number().int().positive(),
    blocks: z.array(ChapterBlockSchema),
  })
  .strict()
export type ChapterSection = z.infer<typeof ChapterSectionSchema>

export const ChapterContentSchema = z
  .object({
    bookId: BookIdSchema,
    id: ChapterIdSchema,
    title: z.string().min(1),
    part: z.string(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    lineCount: z.number().int().positive(),
    pdfPages: z.array(z.number().int().positive()),
    pageMarkers: z.array(PageMarkerSchema),
    sections: z.array(ChapterSectionSchema).min(1),
  })
  .strict()
export type ChapterContent = z.infer<typeof ChapterContentSchema>

export const BookChapterMetaSchema = z
  .object({
    id: ChapterIdSchema,
    title: z.string().min(1),
    part: z.string(),
    file: z.string().min(1),
    lines: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
export type BookChapterMeta = z.infer<typeof BookChapterMetaSchema>

export const BookMetaSchema = z
  .object({
    id: BookIdSchema,
    title: z.string().min(1),
    shortTitle: z.string().min(1),
    edition: z.string().min(1),
    publisher: z.string().min(1),
    year: z.number().int(),
    sourceDir: z.string().min(1),
    chapters: z.array(BookChapterMetaSchema).min(1),
  })
  .strict()
export type BookMeta = z.infer<typeof BookMetaSchema>

export const BooksManifestSchema = z
  .object({
    version: z.string().min(1),
    generatedAt: z.iso.date(),
    books: z.array(BookMetaSchema).min(1),
  })
  .strict()
export type BooksManifest = z.infer<typeof BooksManifestSchema>

export const SearchEntrySchema = z
  .object({
    c: ChapterIdSchema,
    l: z.number().int().positive(),
    t: z.string().min(1),
  })
  .strict()
export type BookSearchEntry = z.infer<typeof SearchEntrySchema>

/** 教材条目切片（extract-book-items.ts 生成）：原文照录，未医学审校 */
export const BookItemSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    chapterId: ChapterIdSchema,
    chapterTitle: z.string().min(1),
    lineStart: z.number().int().positive(),
    lineEnd: z.number().int().positive(),
    fields: z.array(
      z
        .object({
          label: z.string().min(1),
          text: z.string(),
          line: z.number().int().positive(),
        })
        .strict(),
    ),
    reviewStatus: z.literal('unreviewed'),
  })
  .strict()
export type BookItem = z.infer<typeof BookItemSchema>
export const BookItemsPayloadSchema = z
  .object({
    bookId: BookIdSchema,
    generatedFrom: z.string(),
    note: z.string(),
    itemCount: z.number().int().nonnegative(),
    items: z.array(BookItemSchema),
  })
  .strict()
export type BookItemsPayload = z.infer<typeof BookItemsPayloadSchema>

/** 教材同名关联只按规范化全名精确匹配，不做缩写/近义猜测 */
export function bookItemNameKey(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase().replace(/[\s▲]/g, '')
}

/**
 * 互链用名称键：在规范化全名之外，仅剥离「的测定/测定/的检测/检测」程序性后缀
 * （「血清总蛋白测定」与「血清总蛋白」是同一项目，不是近义猜测）。
 * 目录侧用 inlineTokens 去掉上下标等行内标记后再取同一键。
 */
export function relationNameKey(text: string): string {
  return bookItemNameKey(text).replace(/(的测定|测定|的检测|检测)$/, '')
}
export function catalogNameKey(text: string): string {
  return relationNameKey(
    inlineTokens(text)
      .map((token) => token.text)
      .join(''),
  )
}

/** 目录项目在教材条目里的命中：按目录名称与手册照录别名取键，同名全部列出 */
export interface BookRelation {
  bookId: string
  item: BookItem
}
export function findBookRelations(
  name: string,
  aliases: readonly string[],
  payloads: readonly BookItemsPayload[],
): BookRelation[] {
  const keys = new Set([name, ...aliases].map(catalogNameKey))
  keys.delete('')
  const relations: BookRelation[] = []
  for (const payload of payloads)
    for (const entry of payload.items)
      if (keys.has(relationNameKey(entry.name))) relations.push({ bookId: payload.bookId, item: entry })
  return relations
}

/** 章节反向关联：本章教材条目命中的目录项目，按名称键精确匹配，同键多条全列 */
export function chapterCatalogRelations(
  chapterId: string,
  payload: BookItemsPayload | null,
  catalogItems: readonly { id: string; name: string; abbreviation: string; aliases: string[] }[],
): { id: string; name: string; abbreviation: string }[] {
  if (!payload) return []
  const byKey = new Map<string, { id: string; name: string; abbreviation: string }[]>()
  for (const item of catalogItems)
    for (const key of new Set([item.name, ...item.aliases].map(catalogNameKey))) {
      if (!key) continue
      byKey.set(key, [...(byKey.get(key) ?? []), item])
    }
  const found = new Map<string, { id: string; name: string; abbreviation: string }>()
  for (const entry of payload.items) {
    if (entry.chapterId !== chapterId) continue
    for (const item of byKey.get(relationNameKey(entry.name)) ?? []) found.set(item.id, item)
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
}

/* ---------- 解析 ---------- */

/** 章节页码注释：<!-- 源PDF页: 0032；书内页码: 9 --> （书内页码可能缺失或为说明文字） */
export function pageMarkers(markdown: string): PageMarker[] {
  const markers: PageMarker[] = []
  const lines = markdown.split('\n')
  for (let index = 0; index < lines.length; index++) {
    for (const comment of lines[index]!.matchAll(/<!--[^]*?-->/g)) {
      const match = /源PDF页[:：]\s*(\d+)[；;]\s*书内页码[:：]\s*(\d+)/.exec(comment[0])
      if (match)
        markers.push({
          line: index + 1,
          pdfPage: Number(match[1]),
          printedPage: Number(match[2]),
        })
    }
  }
  return markers
}

function tableCells(line: string): string[] {
  return line
    .trim()
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim())
}

/**
 * 与 manualBlocks 同规则，但 OCR 表格列数不齐时降级为逐行段落（照录原文行，不丢字）。
 * 返回降级标记，导入脚本汇总到报告。
 */
export function chapterBlocks(section: ManualSection): {
  blocks: ChapterBlock[]
  degraded: boolean
} {
  const lines = section.markdown.split('\n')
  const blocks: ChapterBlock[] = []
  let degraded = false
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index]!
    const clean = withoutComments(raw).trim()
    if (!clean || /^#{1,6} /.test(clean) || /^<a id="[a-z0-9.-]+"><\/a>$/.test(clean)) continue
    if (clean.startsWith('|') && /^\|(?:\s*:?-+:?\s*\|)+\s*$/.test(lines[index + 1] ?? '')) {
      const headers = tableCells(clean)
      const rows: { cells: string[]; line: number }[] = []
      let cursor = index + 2
      let broken = false
      while (lines[cursor]?.trim().startsWith('|')) {
        const cells = tableCells(lines[cursor]!)
        if (cells.length !== headers.length) {
          broken = true
          break
        }
        rows.push({ cells, line: section.lineStart + cursor })
        cursor++
      }
      if (broken) {
        // 列数不齐：整张表退回逐行段落，原文一个字符都不丢
        degraded = true
        blocks.push({ kind: 'paragraph', text: clean, line: section.lineStart + index })
        for (let row = index + 1; row < lines.length && lines[row]?.trim().startsWith('|'); row++)
          blocks.push({
            kind: 'paragraph',
            text: withoutComments(lines[row]!).trim(),
            line: section.lineStart + row,
          })
        index = cursor - 1
        continue
      }
      blocks.push({ kind: 'table', headers, rows, line: section.lineStart + index })
      index = cursor - 1
    } else
      blocks.push({
        kind: 'paragraph',
        text: clean.replace(/^>\s?/, ''),
        line: section.lineStart + index,
      })
  }
  return { blocks, degraded }
}

export interface ParsedChapter {
  sections: ChapterSection[]
  degradedTables: number
}

/** 把一章 Markdown 解析成阅读用结构；parseManual 保证无损覆盖原文。 */
export function parseChapter(bookId: string, markdown: string): ParsedChapter {
  const manualSections = parseManual(markdown)
  let degradedTables = 0
  const sections: ChapterSection[] = manualSections.map((section, index) => {
    const { blocks, degraded } = chapterBlocks(section)
    if (degraded) degradedTables++
    return {
      id: `s${index + 1}`,
      title: section.title,
      level: section.level,
      lineStart: section.lineStart,
      lineEnd: section.lineEnd,
      blocks,
    }
  })
  void bookId
  return { sections, degradedTables }
}

/** 检索条目：段落整段一条，表格每行一条（含表头上下文），跳过纯图片行与过短行。 */
export function chapterSearchEntries(
  chapterId: string,
  sections: ChapterSection[],
): BookSearchEntry[] {
  const entries: BookSearchEntry[] = []
  for (const section of sections)
    for (const block of section.blocks) {
      if (block.kind === 'paragraph') {
        const text = manualText(block.text)
        if (/^!\[[^\]]*\]\([^)]*\)$/.test(text)) continue
        if (text.replace(/[\s\p{P}]/gu, '').length < 2) continue
        entries.push({ c: chapterId, l: block.line, t: text.slice(0, 300) })
      } else {
        const header = block.headers.map((cell) => manualText(cell)).join('/')
        for (const row of block.rows) {
          const cells = row.cells.map((cell) => manualText(cell)).join(' / ')
          const text = `${header}｜${cells}`
          if (text.replace(/[\s\p{P}]/gu, '').length < 2) continue
          entries.push({ c: chapterId, l: row.line, t: text.slice(0, 300) })
        }
      }
    }
  return entries
}

export { inlineTokens, manualText }

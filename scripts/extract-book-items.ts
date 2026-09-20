import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { manualText, parseManual, withoutComments } from '../src/domain/manual.ts'

/**
 * 教材条目结构化：把分章 Markdown 按标题模式切成「条目」。
 * OCR 标题全部扁平化为 ##，逻辑层级按标题文字模式重建：
 * 第X节 > 一、（测定类） > （一）条目 > 1. 字段（结构A）；
 * 一、级本身是条目，（X）级是字段小节（结构B，以首个（X）子标题是否字段名判别）。
 * 条目正文照录原文行，不补写、不改写；--check 与已生成文件逐字节对账。
 * 用法：node --experimental-strip-types scripts/extract-book-items.ts [--check]
 */

const args = process.argv.slice(2)
const check = args.length === 1 && args[0] === '--check'
if (args.length && !check)
  throw new Error('用法：node --experimental-strip-types scripts/extract-book-items.ts [--check]')

const LIBRARY_ROOT =
  process.env.LAB_LIBRARY_ROOT ?? `${process.env.HOME}/Documents/资料库/检验科知识库`

const BOOKS: { id: string; dir: string }[] = [
  { id: 'book-92', dir: '92-临床微生物学检验技术-人卫2025-第2版' },
  { id: 'book-96', dir: '96-全国临床检验操作规程-人卫2015-第4版' },
  { id: 'book-97', dir: '97-临床分子生物学检验技术-人卫2015-第1版' },
  { id: 'book-98', dir: '98-临床生物化学检验技术-人卫2025-第2版' },
  { id: 'book-99', dir: '99-临床免疫学检验技术-人卫2015-第1版' },
  { id: 'book-100', dir: '100-临床基础检验学技术-人卫2025-第2版' },
  { id: 'book-101', dir: '101-临床输血学检验技术-人卫2025-第2版' },
]

const sourceAvailable = await readdir(LIBRARY_ROOT).then(
  () => true,
  () => false,
)
if (!sourceAvailable) {
  if (process.env.CI_SOURCE_ONLY === 'true') {
    console.log('CI_SOURCE_ONLY：本机无教材源库，跳过教材条目对账（不算作原件验证）。')
    process.exit(0)
  }
  throw new Error(`找不到教材源库：${LIBRARY_ROOT}（可用 LAB_LIBRARY_ROOT 指定）`)
}

export const BookItemSchema = z
  .object({
    id: z.string().regex(/^book\d+\.c[a-z0-9]+\.i\d+$/),
    name: z.string().min(1),
    chapterId: z.string().min(1),
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

const PAREN_ITEM = /^[（(][一二三四五六七八九十]+[）)]\s*(.+)$/
const NUMBERED_FIELD = /^(\d+)[.、．]\s*(.+)$/
const SECTION_1 = /^[一二三四五六七八九十]+、(.+)$/
/** 一、级标题里哪些算「测定类」小节（条目挂在它们下面） */
const MEASURE_SECTION = /(测定|试验|检测|监测|评价)\s*$/
/** （X）级标题若为字段名，说明「一、」级本身就是条目（结构B） */
const FIELD_VOCAB =
  /生化及生理|检测方法|参考区间|参考范围|临床意义|应用评价|影响因素|方法学评价|质量控制|标本要求|干扰/

interface Heading {
  level: number
  title: string
  line: number
}

function logicalHeadings(markdown: string): Heading[] {
  const sections = parseManual(markdown)
  return sections.map((section) => {
    const title = section.title
    let level = 9
    if (/^第[一二三四五六七八九十百]+章/.test(title)) level = 1
    else if (/^第[一二三四五六七八九十]+篇/.test(title)) level = 1
    else if (/^第[一二三四五六七八九十]+节/.test(title)) level = 3
    else if (SECTION_1.test(title)) level = 4
    else if (PAREN_ITEM.test(title)) level = 5
    else if (NUMBERED_FIELD.test(title)) level = 6
    else if (/^通过本章学习|^学习目标/.test(title)) level = 2
    return { level, title, line: section.lineStart }
  })
}

function extractChapter(chapterId: string, chapterTitle: string, markdown: string): BookItem[] {
  const headings = logicalHeadings(markdown)
  const lines = markdown.split('\n')

  /** 切出 [from, to] 行范围内的字段：numbered 或 （X）字段标题作为字段名，正文逐行照录 */
  function sliceFields(
    from: number,
    to: number,
    fieldHeading: 'numbered' | 'paren',
  ): BookItem['fields'] {
    const fields: BookItem['fields'] = []
    let current: { label: string; text: string[]; line: number } | null = null
    const flush = () => {
      if (current && current.text.join('').trim())
        fields.push({
          label: current.label,
          text: current.text.join('\n').trim(),
          line: current.line,
        })
      current = null
    }
    for (let line = from; line <= to && line <= lines.length; line++) {
      const raw = lines[line - 1]!
      const clean = withoutComments(raw).trim()
      const headingText = /^#{1,6}\s+(.+)$/.exec(clean)?.[1]?.trim()
      if (headingText !== undefined) {
        const label =
          fieldHeading === 'numbered'
            ? NUMBERED_FIELD.exec(headingText)?.[2]?.trim()
            : PAREN_ITEM.exec(headingText)?.[1]?.trim()
        if (label) {
          flush()
          current = { label, text: [], line }
          continue
        }
        // 非字段标题：条目边界在调用方已限定，标题本身不进入字段正文
        continue
      }
      if (!clean) continue
      const text = manualText(clean)
      if (!text) continue
      if (!current) current = { label: '概述', text: [], line }
      current.text.push(text)
    }
    flush()
    return fields
  }

  /** 下一个 level<=max 的标题行号（不含），缺省为全文末尾 */
  function boundary(fromIndex: number, max: number): number {
    for (let cursor = fromIndex + 1; cursor < headings.length; cursor++)
      if (headings[cursor]!.level <= max) return headings[cursor]!.line - 1
    return lines.length
  }

  const items: BookItem[] = []
  let measureParent: string | null = null
  let itemOrdinal = 0
  const idPrefix = chapterId.startsWith('f') ? chapterId : chapterId
  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index]!
    if (heading.level <= 3) {
      measureParent = null
      continue
    }
    if (heading.level === 4) {
      // 看首个（X）子标题是不是字段名，判定结构B（一、级即条目）
      const child = headings.slice(index + 1).find((entry) => entry.level <= 5)
      const isStructureB = child?.level === 5 && FIELD_VOCAB.test(child.title)
      if (isStructureB) {
        const name = SECTION_1.exec(heading.title)?.[1]?.trim() ?? heading.title
        const end = boundary(index, 4)
        const fields = sliceFields(heading.line, end, 'paren')
        if (fields.length) {
          itemOrdinal += 1
          items.push({
            id: `${BOOK_ID}.c${idPrefix}.i${itemOrdinal}`,
            name,
            chapterId,
            chapterTitle,
            lineStart: heading.line,
            lineEnd: end,
            fields,
            reviewStatus: 'unreviewed',
          })
        }
        measureParent = null
      } else {
        measureParent = MEASURE_SECTION.test(heading.title) ? heading.title : null
      }
      continue
    }
    if (heading.level !== 5 || !measureParent || FIELD_VOCAB.test(heading.title)) continue
    // 结构A：测定类小节下的（X）级条目，字段为 1. 级标题
    const name = PAREN_ITEM.exec(heading.title)?.[1]?.trim()
    if (!name) continue
    const end = boundary(index, 5)
    const fields = sliceFields(heading.line, end, 'numbered')
    if (!fields.length) continue
    itemOrdinal += 1
    items.push({
      id: `${BOOK_ID}.c${idPrefix}.i${itemOrdinal}`,
      name,
      chapterId,
      chapterTitle,
      lineStart: heading.line,
      lineEnd: end,
      fields,
      reviewStatus: 'unreviewed',
    })
  }
  return items
}

let BOOK_ID = ''

async function buildBook(book: (typeof BOOKS)[number]): Promise<{
  payload: string
  items: BookItem[]
}> {
  BOOK_ID = book.id.replace('-', '')
  const dir = `${LIBRARY_ROOT}/${book.dir}/分章`
  const names = (await readdir(dir))
    .filter((name) => name.endsWith('.md') && !name.startsWith('000-'))
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN', { numeric: true }))
  const items: BookItem[] = []
  const hash = createHash('sha256')
  for (const name of names) {
    const bytes = await readFile(`${dir}/${name}`)
    hash.update(bytes)
    const markdown = bytes.toString('utf8')
    const stem = name.replace(/\.md$/, '')
    const prefix = stem.split('-')[0]!
    const chapterId = /^\d+$/.test(prefix)
      ? prefix
      : `f${prefix.replace(/\D/g, '').padStart(2, '0')}`
    const chapterTitle = stem.slice(stem.indexOf('-') + 1)
    items.push(...extractChapter(chapterId, chapterTitle, markdown))
  }
  const ids = items.map((item) => item.id)
  if (new Set(ids).size !== ids.length) throw new Error(`${book.dir}：条目编号重复`)
  const namesSeen = new Map<string, number>()
  for (const item of items) namesSeen.set(item.name, (namesSeen.get(item.name) ?? 0) + 1)
  console.log(
    `${book.id}：共 ${items.length} 条；同名条目 ${[...namesSeen].filter(([, count]) => count > 1).length} 组（不合并，各自保留章节定位）`,
  )
  const payload = JSON.stringify({
    bookId: book.id,
    generatedFrom: `${book.dir}/分章（sha256 ${hash.digest('hex')}）`,
    note: '按 OCR 标题模式重建的条目切片，原文照录未校订；同名不合并，编号为软件内部定位，非原书编号。',
    itemCount: items.length,
    items: items.map((item) => BookItemSchema.parse(item)),
  })
  return { payload, items }
}

const results: { file: string; payload: string }[] = []
for (const book of BOOKS) {
  const { payload } = await buildBook(book)
  results.push({ file: `${book.id}-items.json`, payload })
}

if (check) {
  for (const { file, payload } of results) {
    const actual = await readFile(new URL(`../public/content/books/${file}`, import.meta.url), 'utf8').catch(
      () => null,
    )
    if (actual !== payload)
      throw new Error(`${file} 与源不一致，请重新运行 extract-book-items.ts`)
  }
  console.log(`books-items:check 通过，${results.length} 本书的条目与源逐字节一致。`)
} else {
  for (const { file, payload } of results)
    await writeFile(new URL(`../public/content/books/${file}`, import.meta.url), payload)
  console.log(`已生成 ${results.length} 个教材条目文件（public/content/books/，不入 Git）。`)
}

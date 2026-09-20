import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import {
  BooksManifestSchema,
  ChapterContentSchema,
  chapterSearchEntries,
  pageMarkers,
  parseChapter,
} from '../src/domain/book.ts'
import type {
  BookChapterMeta,
  BookMeta,
  BookSearchEntry,
  ChapterContent,
} from '../src/domain/book.ts'
import { withoutComments } from '../src/domain/manual.ts'

/**
 * 教材分章 → 阅读/检索 JSON 导入管线。
 * 用法：node --experimental-strip-types scripts/import-textbooks.ts [--check]
 * 默认从 ~/Documents/资料库/检验科知识库 只读扫描；--check 全量重算并与已生成文件逐字节对账。
 */

const args = process.argv.slice(2)
const check = args.length === 1 && args[0] === '--check'
if (args.length && !check)
  throw new Error('用法：node --experimental-strip-types scripts/import-textbooks.ts [--check]')

const LIBRARY_ROOT =
  process.env.LAB_LIBRARY_ROOT ?? `${process.env.HOME}/Documents/资料库/检验科知识库`
const sourceAvailable = await readdir(LIBRARY_ROOT).then(
  () => true,
  () => false,
)
if (!sourceAvailable) {
  if (process.env.CI_SOURCE_ONLY === 'true') {
    console.log('CI_SOURCE_ONLY：本机无教材源库，跳过教材对账（不算作原件验证）。')
    process.exit(0)
  }
  throw new Error(`找不到教材源库：${LIBRARY_ROOT}（可用 LAB_LIBRARY_ROOT 指定）`)
}

const BOOKS: {
  id: string
  dir: string
  title: string
  shortTitle: string
  edition: string
  publisher: string
  year: number
}[] = [
  {
    id: 'book-92',
    dir: '92-临床微生物学检验技术-人卫2025-第2版',
    title: '临床微生物学检验技术',
    shortTitle: '微生物',
    edition: '2025年第2版',
    publisher: '人民卫生出版社',
    year: 2025,
  },
  {
    id: 'book-97',
    dir: '97-临床分子生物学检验技术-人卫2015-第1版',
    title: '临床分子生物学检验技术',
    shortTitle: '分子生物',
    edition: '2015年第1版',
    publisher: '人民卫生出版社',
    year: 2015,
  },
  {
    id: 'book-98',
    dir: '98-临床生物化学检验技术-人卫2025-第2版',
    title: '临床生物化学检验技术',
    shortTitle: '生物化学',
    edition: '2025年第2版',
    publisher: '人民卫生出版社',
    year: 2025,
  },
  {
    id: 'book-96',
    dir: '96-全国临床检验操作规程-人卫2015-第4版',
    title: '全国临床检验操作规程',
    shortTitle: '操作规程',
    edition: '2015年第4版',
    publisher: '人民卫生出版社',
    year: 2015,
  },
  {
    id: 'book-99',
    dir: '99-临床免疫学检验技术-人卫2015-第1版',
    title: '临床免疫学检验技术',
    shortTitle: '免疫学',
    edition: '2015年第1版',
    publisher: '人民卫生出版社',
    year: 2015,
  },
  {
    id: 'book-100',
    dir: '100-临床基础检验学技术-人卫2025-第2版',
    title: '临床基础检验学技术',
    shortTitle: '基础检验',
    edition: '2025年第2版',
    publisher: '人民卫生出版社',
    year: 2025,
  },
  {
    id: 'book-101',
    dir: '101-临床输血学检验技术-人卫2025-第2版',
    title: '临床输血学检验技术',
    shortTitle: '输血',
    edition: '2025年第2版',
    publisher: '人民卫生出版社',
    year: 2025,
  },
]

const root = new URL('../', import.meta.url)
const outDir = new URL('public/content/books/', root)

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** 章节 id：数字章号照用，附录01 → f01。同一本书内必须唯一。 */
function chapterId(stem: string): string {
  const prefix = stem.split('-')[0]!
  if (/^\d+$/.test(prefix)) return prefix
  const appendix = /^附录(\d+)$/.exec(prefix)
  if (appendix) return `f${appendix[1]!.padStart(2, '0')}`
  throw new Error(`无法识别的章节文件名前缀：${stem}`)
}

/** 从分章索引表取「篇」归属；列序各书不同，按单元格内容启发识别。 */
async function chapterParts(dir: string): Promise<Map<string, string>> {
  const parts = new Map<string, string>()
  let index: string
  try {
    index = await readFile(`${LIBRARY_ROOT}/${dir}/分章索引.md`, 'utf8')
  } catch {
    return parts
  }
  for (const line of index.split('\n')) {
    if (!line.startsWith('|')) continue
    const file = /\]\(分章\/([^)]+?\.md)\)/.exec(line)?.[1]
    if (!file || file.includes('/')) continue
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim())
    const part = cells.find((cell) => /^第.+篇/.test(cell)) ?? ''
    parts.set(file, part)
  }
  return parts
}

interface BuiltChapter {
  meta: BookChapterMeta
  content: ChapterContent
  degradedTables: number
}

async function buildChapter(
  book: (typeof BOOKS)[number],
  file: string,
  part: string,
): Promise<BuiltChapter> {
  const bytes = await readFile(`${LIBRARY_ROOT}/${book.dir}/分章/${file}`)
  const markdown = bytes.toString('utf8')
  const stem = file.replace(/\.md$/, '')
  const id = chapterId(stem)
  const title = stem.slice(stem.indexOf('-') + 1)
  const { sections, degradedTables } = parseChapter(book.id, markdown)
  const markers = pageMarkers(markdown)
  const pdfPages = [...new Set(markers.map((marker) => marker.pdfPage))].sort((a, b) => a - b)

  // 独立覆盖核验：每个正文行（非空/非标题/非锚点/非纯注释）必须恰好被一个 block 覆盖
  const lines = markdown.split('\n')
  const expected = new Set<number>()
  for (let index = 0; index < lines.length; index++) {
    const clean = withoutComments(lines[index]!).trim()
    if (!clean || /^#{1,6} /.test(clean) || /^<a id="[a-z0-9.-]+"><\/a>$/.test(clean)) continue
    expected.add(index + 1)
  }
  const covered = new Set<number>()
  for (const section of sections)
    for (const block of section.blocks) {
      const blockLines =
        block.kind === 'table'
          ? [block.line, block.line + 1, ...block.rows.map((row) => row.line)]
          : [block.line]
      for (const line of blockLines) {
        if (covered.has(line)) throw new Error(`${book.dir}/${file}：第 ${line} 行被重复覆盖`)
        covered.add(line)
      }
    }
  const missing = [...expected].filter((line) => !covered.has(line))
  const extra = [...covered].filter((line) => !expected.has(line))
  if (missing.length || extra.length)
    throw new Error(
      `${book.dir}/${file}：正文覆盖不完整（缺 ${missing.slice(0, 5).join(',')} 多 ${extra.slice(0, 5).join(',')}）`,
    )

  const content: ChapterContent = ChapterContentSchema.parse({
    bookId: book.id,
    id,
    title,
    part,
    sha256: sha256(bytes),
    lineCount: markdown.endsWith('\n') ? lines.length - 1 : lines.length,
    pdfPages,
    pageMarkers: markers,
    sections,
  })
  const meta: BookChapterMeta = {
    id,
    title,
    part,
    file: `${id}.json`,
    lines: content.lineCount,
    sha256: content.sha256,
  }
  return { meta, content, degradedTables }
}

async function build(): Promise<{
  manifest: string
  files: Map<string, string>
  report: string[]
}> {
  const files = new Map<string, string>()
  const report: string[] = []
  const books: BookMeta[] = []
  for (const book of BOOKS) {
    const chapterDir = `${LIBRARY_ROOT}/${book.dir}/分章`
    const names = (await readdir(chapterDir))
      .filter((name) => name.endsWith('.md'))
      .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN', { numeric: true }))
    if (!names.length) throw new Error(`${book.dir}：分章目录没有 Markdown 文件`)
    const parts = await chapterParts(book.dir)
    const chapters: BookChapterMeta[] = []
    const search: BookSearchEntry[] = []
    let degraded = 0
    const seen = new Set<string>()
    for (const name of names) {
      const built = await buildChapter(book, name, parts.get(name) ?? '')
      if (seen.has(built.meta.id)) throw new Error(`${book.dir}：章节编号重复 ${built.meta.id}`)
      seen.add(built.meta.id)
      chapters.push(built.meta)
      degraded += built.degradedTables
      files.set(`${book.id}/${built.meta.id}.json`, JSON.stringify(built.content))
      search.push(...chapterSearchEntries(built.meta.id, built.content.sections))
    }
    files.set(`${book.id}/search.json`, JSON.stringify(search))
    books.push({
      id: book.id,
      title: book.title,
      shortTitle: book.shortTitle,
      edition: book.edition,
      publisher: book.publisher,
      year: book.year,
      sourceDir: book.dir,
      chapters,
    })
    report.push(
      `${book.id} ${book.title}：${chapters.length} 章，${chapters.reduce((sum, chapter) => sum + chapter.lines, 0)} 行，检索条目 ${search.length} 条，降级表格 ${degraded} 张`,
    )
  }
  const today = new Date().toISOString().slice(0, 10)
  const manifest = JSON.stringify(
    BooksManifestSchema.parse({ version: `books-${today}`, generatedAt: today, books }),
  )
  files.set('../books.json', manifest)
  return { manifest, files, report }
}

const { files, report } = await build()
for (const line of report) console.log(line)

if (check) {
  let compared = 0
  // books.json 的 version/generatedAt 取自生成当天日期，对账时忽略这两个字段，
  // 否则隔天跑 --check 必然误报不一致；章节内容仍逐字节对账。
  const normalizeManifest = (text: string): string => {
    const parsed = JSON.parse(text) as Record<string, unknown>
    delete parsed.version
    delete parsed.generatedAt
    return JSON.stringify(parsed)
  }
  for (const [name, expected] of files) {
    const actual = await readFile(new URL(name, outDir), 'utf8').catch(() => null)
    if (actual === null) throw new Error(`缺少已生成文件：public/content/books/${name}`)
    const identical =
      actual === expected ||
      (name === '../books.json' && normalizeManifest(actual) === normalizeManifest(expected))
    if (!identical) throw new Error(`已生成文件与源不一致：public/content/books/${name}`)
    compared++
  }
  const onDisk = await readdir(new URL('.', outDir)).catch(() => [] as string[])
  for (const entry of onDisk) {
    if (entry === '..' || entry === '.') continue
  }
  console.log(`books:check 通过，${compared} 个文件与源逐字节一致。`)
} else {
  for (const book of BOOKS) await mkdir(new URL(`${book.id}/`, outDir), { recursive: true })
  for (const [name, content] of files) await writeFile(new URL(name, outDir), content)
  console.log(
    `已生成 books.json 与 ${files.size - 1} 个章节/检索文件（public/content/books/）。`,
  )
}

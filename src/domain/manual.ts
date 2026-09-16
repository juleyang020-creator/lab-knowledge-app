import type { CatalogItem, ManualEntry } from './content.ts'

export const MANUAL_SOURCE_ID = 'xwh-manual-2026'
export const MANUAL_ASSET = 'xwh-manual-2026.md'

export interface ManualSection {
  id: string
  title: string
  level: number
  lineStart: number
  lineEnd: number
  printedPages: number[]
  markdown: string
}
export type ManualBlock =
  | { kind: 'paragraph'; text: string; line: number }
  | { kind: 'table'; headers: string[]; rows: { cells: string[]; line: number }[]; line: number }
export interface InlineToken {
  kind: 'text' | 'br' | 'sup' | 'sub' | 'strong' | 'link'
  text: string
  target?: string
}

export function withoutComments(text: string): string {
  return text.replace(/<!--[^]*?-->/g, '')
}
function decodeEntities(text: string): string {
  const entities: Record<string, string> = {
    lt: '<',
    gt: '>',
    amp: '&',
    quot: '"',
    apos: "'",
    nbsp: '\u00a0',
  }
  return text
    .replace(/&(#x[\da-f]+|#\d+|lt|gt|amp|quot|apos|nbsp);/gi, (whole, entity: string) => {
      if (!entity.startsWith('#')) return entities[entity.toLowerCase()] ?? whole
      const code =
        entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1))
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    })
    .replace(/\\([*_[\]\\])/g, '$1')
}

/** Only the manual's inline vocabulary is interpreted; no source HTML is executed. */
export function inlineTokens(input: string): InlineToken[] {
  const text = withoutComments(input)
  const pattern =
    /<br\s*\/?\s*>|<(sup|sub)>([^]*?)<\/\1>|\*\*([^]*?)\*\*|\[([^\]]+)\]\(#([a-z][a-z0-9.-]*)\)/gi
  const tokens: InlineToken[] = []
  let offset = 0
  for (const match of text.matchAll(pattern)) {
    if (match.index > offset)
      tokens.push({ kind: 'text', text: decodeEntities(text.slice(offset, match.index)) })
    if (/^<br/i.test(match[0])) tokens.push({ kind: 'br', text: '\n' })
    else if (match[1])
      tokens.push({
        kind: match[1].toLowerCase() as 'sup' | 'sub',
        text: decodeEntities(match[2]!),
      })
    else if (match[3] !== undefined) tokens.push({ kind: 'strong', text: decodeEntities(match[3]) })
    else tokens.push({ kind: 'link', text: decodeEntities(match[4]!), target: match[5] })
    offset = match.index + match[0].length
  }
  if (offset < text.length) tokens.push({ kind: 'text', text: decodeEntities(text.slice(offset)) })
  return tokens
}

export function manualText(input: string): string {
  return inlineTokens(input)
    .map((token) =>
      token.kind === 'sup'
        ? `^(${token.text})`
        : token.kind === 'sub'
          ? `_(${token.text})`
          : token.text,
    )
    .join('')
    .trim()
}

function printedPages(input: string): number[] {
  const pages = new Set<number>()
  for (const comment of input.matchAll(/<!--[^]*?-->/g)) {
    for (const match of comment[0].matchAll(
      /原书(?:页码[：:]\s*([\d,，]+)|第(\d+)(?:[—-](\d+))?页)/g,
    )) {
      if (match[1]) match[1].split(/[,，]/).forEach((page) => pages.add(Number(page)))
      else
        for (let page = Number(match[2]); page <= Number(match[3] ?? match[2]); page++)
          pages.add(page)
    }
  }
  return [...pages].sort((a, b) => a - b)
}

/** Sections partition the original bytes; joining markdown restores the source exactly. */
export function parseManual(markdown: string): ManualSection[] {
  const lines = markdown.match(/[^\n]*\n|[^\n]+$/g) ?? []
  const headings: { index: number; start: number; level: number; title: string }[] = []
  for (let index = 0; index < lines.length; index++) {
    const heading = /^(#{1,6}) (.+?)\s*$/.exec(lines[index]!)
    if (!heading) continue
    let start = index
    while (
      start > 0 &&
      /^(?:\s*|\s*<!--.*-->\s*|\s*<a id="[a-z0-9.-]+"><\/a>\s*)$/.test(lines[start - 1]!)
    )
      start--
    headings.push({
      index,
      start: headings.length ? start : 0,
      level: heading[1]!.length,
      title: heading[2]!,
    })
  }
  if (!headings.length) throw new Error('手册缺少章节标题')
  const sections = headings.map((heading, index): ManualSection => {
    const end = headings[index + 1]?.start ?? lines.length
    const raw = lines.slice(heading.start, end).join('')
    const anchor = /<a id="([a-z][a-z0-9.-]*)"><\/a>/.exec(
      lines.slice(heading.start, heading.index).join(''),
    )
    return {
      id: anchor?.[1] ?? (index === 0 ? 'cover' : `section-${index + 1}`),
      title: manualText(heading.title),
      level: heading.level,
      lineStart: heading.start + 1,
      lineEnd: end,
      printedPages: printedPages(raw),
      markdown: raw,
    }
  })
  if (new Set(sections.map((section) => section.id)).size !== sections.length)
    throw new Error('手册章节编号重复')
  if (sections.map((section) => section.markdown).join('') !== markdown)
    throw new Error('手册章节未完整覆盖原文')
  return sections
}

function tableCells(line: string): string[] {
  return line
    .trim()
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim())
}
export function manualBlocks(section: ManualSection): ManualBlock[] {
  const lines = section.markdown.split('\n')
  const blocks: ManualBlock[] = []
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index]!
    const clean = withoutComments(raw).trim()
    if (!clean || /^#{1,6} /.test(clean) || /^<a id="[a-z0-9.-]+"><\/a>$/.test(clean)) continue
    if (clean.startsWith('|') && /^\|(?:\s*:?-+:?\s*\|)+\s*$/.test(lines[index + 1] ?? '')) {
      const table: Extract<ManualBlock, { kind: 'table' }> = {
        kind: 'table',
        headers: tableCells(clean),
        rows: [],
        line: section.lineStart + index,
      }
      index += 2
      while (lines[index]?.trim().startsWith('|')) {
        const cells = tableCells(lines[index]!)
        if (cells.length !== table.headers.length)
          throw new Error(`表格列数不一致：第 ${section.lineStart + index} 行`)
        table.rows.push({ cells, line: section.lineStart + index })
        index++
      }
      index--
      blocks.push(table)
    } else
      blocks.push({
        kind: 'paragraph',
        text: clean.replace(/^>\s?/, ''),
        line: section.lineStart + index,
      })
  }
  return blocks
}

export function importManualItems(sections: ManualSection[]): CatalogItem[] {
  return sections
    .filter((section) => /^table-4-[1-9]$/.test(section.id))
    .flatMap((section) => {
      const blocks = manualBlocks(section)
      const tables = blocks.filter((block) => block.kind === 'table')
      if (tables.length !== 1) throw new Error(`项目分组应只有一张表：${section.id}`)
      const table = tables[0]!
      const category = section.title.replace(/^表(?:4-)?\d+\s*/, '')
      const notes = blocks.filter((block) => block.kind === 'paragraph').map((block) => block.text)
      const previousFields = new Map<number, { itemId: string; value: string }>()
      return table.rows.flatMap((row, index): CatalogItem[] => {
        if (row.cells.every((cell) => !withoutComments(cell).trim())) {
          previousFields.clear()
          return []
        }
        const id = `xwh2026.${section.id}.${String(index + 1).padStart(3, '0')}`
        const fields: ManualEntry['fields'] = row.cells.map((cell, column) => {
          const value = withoutComments(cell).trim()
          const field: ManualEntry['fields'][number] = { label: table.headers[column]!, value }
          if (manualText(value) === '同上') {
            const previous = previousFields.get(column)
            if (previous) field.inheritedFrom = { ...previous }
          } else if (value) previousFields.set(column, { itemId: id, value })
          else previousFields.delete(column)
          return field
        })
        const pages = printedPages(row.cells.join(' '))
        if (!pages.length) throw new Error(`项目行缺少原书页码：${row.line}`)
        const location = { sectionId: section.id, line: row.line, printedPages: pages }
        const name = manualText(fields[0]!.value)
        const valueOf = (label: string) =>
          manualText(fields.find((field) => field.label === label)?.value ?? '')
        const summary = valueOf('临床意义') || valueOf('具体项目') || name
        return [
          {
            id,
            name,
            abbreviation: valueOf('检验项目：缩写'),
            aliases: [name.replace(/\s+/g, '').replace(/▲/g, '')],
            category,
            kind: section.id === 'table-4-8' ? 'panel' : 'test',
            summary: {
              id: `${id}.summary`,
              text: summary,
              provenance: {
                kind: 'document',
                sourceId: MANUAL_SOURCE_ID,
                manualLocation: location,
                quote: summary.slice(0, 240),
              },
              reviewStatus: 'unreviewed',
            },
            institutional: {
              orderName: null,
              orderCode: null,
              specimen: null,
              turnaround: null,
              location: null,
            },
            manual: { sourceId: MANUAL_SOURCE_ID, location, row: index + 1, fields, notes },
          },
        ]
      })
    })
}

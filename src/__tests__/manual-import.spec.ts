import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateCatalog } from '../domain/validation'
import {
  importManualItems,
  inlineTokens,
  manualBlocks,
  manualText,
  parseManual,
} from '../domain/manual'

const loadCatalog = () =>
  validateCatalog(JSON.parse(readFileSync(resolve('public/content/catalog.json'), 'utf8')))

const expectedGroups = {
  临床化学检验项目: 113,
  临床免疫学检验项目: 105,
  临床基础检验项目: 55,
  凝血检验项目: 14,
  临床微生物学检验项目: 40,
  特殊检验项目: 74,
  分子生物检验项目: 49,
  检验项目组合: 36,
  外送检验项目: 31,
}

describe('2026标本采集手册导入', () => {
  it('缺少整条项目或同上链接悬空时，运行时校验拒绝不完整的目录', () => {
    const missing = loadCatalog()
    missing.items.shift()
    expect(() => validateCatalog(missing)).toThrow('手册分组数量不一致')
    const dangling = loadCatalog()
    const field = dangling.items
      .flatMap((item) => item.manual?.fields ?? [])
      .find((field) => field.inheritedFrom)!
    field.inheritedFrom!.itemId = 'missing'
    expect(() => validateCatalog(dangling)).toThrow('同上引用无效')
  })

  it('按原书九个检验分组逐行录入，不把重名或组合条目合并掉', () => {
    const catalog = loadCatalog()
    const imported = catalog.items.filter(
      (item) =>
        item.summary.provenance.kind === 'document' &&
        item.summary.provenance.sourceId === 'xwh-manual-2026',
    )
    const counts = Object.fromEntries(
      Object.keys(expectedGroups).map((group) => [
        group,
        imported.filter((item) => item.category === group).length,
      ]),
    )
    expect(counts).toEqual(expectedGroups)
    expect(imported).toHaveLength(517)
    expect(imported.some((item) => item.id === 'xwh2026.table-4-7.010')).toBe(false)
    expect(catalog.items.filter((item) => !item.id.startsWith('xwh2026.'))).toHaveLength(11)
  })

  it('所有原文分节可字节级还原上传文件，封面、目录、空白表行、表后注均保留', () => {
    const bytes = readFileSync(resolve('public/content/xwh-manual-2026.md'))
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      'b18763b787ce90b1539aa209013050b094078d116cbe4e34e4763241b049cba7',
    )
    const sections = parseManual(bytes.toString('utf8'))
    expect(sections).toHaveLength(233)
    expect(Buffer.from(sections.map((section) => section.markdown).join(''))).toEqual(bytes)
    expect(sections.at(-1)?.lineEnd).toBe(2881)
    expect(sections.flatMap(manualBlocks).filter((block) => block.kind === 'table')).toHaveLength(
      21,
    )
    expect(
      sections.flatMap(manualBlocks).filter((block) => block.kind === 'paragraph'),
    ).toHaveLength(474)
    const anchors = [...bytes.toString('utf8').matchAll(/\]\(#([a-z0-9.-]+)\)/g)].map(
      (match) => match[1],
    )
    expect(anchors.every((anchor) => sections.some((section) => section.id === anchor))).toBe(true)
  })

  it('独立逐行比对全部4026个单元格，不补空值、不丢上下标、不串表列', () => {
    const source = readFileSync(resolve('public/content/xwh-manual-2026.md'), 'utf8')
    const lines = source.split('\n')
    const imported = loadCatalog().items.filter((item) => item.manual)
    const sourceRows = lines.flatMap((line, index) => {
      if (index < 2159 || !line.startsWith('|') || !line.includes('<!-- 原书页码：')) return []
      const values = line
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.replace(/<!--.*?-->/g, '').trim())
      return values.every((value) => !value) ? [] : [{ line: index + 1, values }]
    })
    expect(sourceRows).toHaveLength(517)
    expect(
      imported.map((item) => ({
        line: item.manual!.location.line,
        values: item.manual!.fields.map((field) => field.value),
      })),
    ).toEqual(sourceRows)
    expect(imported.flatMap((item) => item.manual!.fields)).toHaveLength(4026)
    expect(
      imported.flatMap((item) => item.manual!.fields).filter((field) => !field.value),
    ).toHaveLength(119)
    expect(
      imported.flatMap((item) => item.manual!.fields).filter((field) => field.inheritedFrom),
    ).toHaveLength(94)
    expect(importManualItems(parseManual(source))).toEqual(imported)
  })

  it('只解释源文件用到的安全行内标记，保留上下标含义和分隔符，不执行任意HTML', () => {
    expect(inlineTokens('10<sup>9</sup>/L<br>C<sub>3</sub> &lt;2 &#124;3')).toEqual([
      { kind: 'text', text: '10' },
      { kind: 'sup', text: '9' },
      { kind: 'text', text: '/L' },
      { kind: 'br', text: '\n' },
      { kind: 'text', text: 'C' },
      { kind: 'sub', text: '3' },
      { kind: 'text', text: ' <2 |3' },
    ])
    expect(manualText('10<sup>9</sup>/L')).toBe('10^(9)/L')
    expect(inlineTokens('<img src=x onerror=alert(1)>[危险](javascript:alert(1))')).toEqual([
      { kind: 'text', text: '<img src=x onerror=alert(1)>[危险](javascript:alert(1))' },
    ])
  })
})

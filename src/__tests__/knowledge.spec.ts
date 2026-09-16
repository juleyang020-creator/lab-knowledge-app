import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateCatalog } from '../domain/validation'
import { createKnowledgeIndex, fieldValue, suggestSpecimens } from '../domain/knowledge'
import { filterCatalog } from '../domain/search'

const catalog = validateCatalog(JSON.parse(readFileSync('public/content/catalog.json', 'utf8')))

describe('标本查询线索', () => {
  it('只匹配有原文的名称、意义及标本，不把模型或未知症状生成成建议', () => {
    const index = createKnowledgeIndex(catalog.items)
    const hits = suggestSpecimens(index, '糖尿病')
    const glucose = hits.find((hit) => hit.knowledge.item.id === 'xwh2026.table-4-1.034')!
    expect(
      glucose.evidence.some((field) => field.label === '临床意义' && field.text.includes('糖尿病')),
    ).toBe(true)
    expect(fieldValue(glucose.knowledge.item, '标本要求')).toBe('红盖管')
    expect(hits.every((hit) => hit.knowledge.item.manual)).toBe(true)
    expect(suggestSpecimens(index, '未知病名xyz')).toEqual([])
    expect(suggestSpecimens(index, '  ')).toEqual([])
    expect(suggestSpecimens(index, '，；')).toEqual([])
    expect(suggestSpecimens(index, '病')).toEqual([])
    expect(suggestSpecimens(index, 'ALT '.repeat(100))).toEqual([])
  })
})

describe('组合与细分项目的来源关联', () => {
  it('目录可按组合筛选，并通过成员缩写找到组合，但不改变源记录顺序和类型', () => {
    const ids = catalog.items.map((item) => item.id)
    expect(filterCatalog(catalog.items, 'ALT', { kind: 'panel' }).map((item) => item.id)).toContain(
      'xwh2026.table-4-8.005',
    )
    expect(
      filterCatalog(catalog.items, 'ALT', { kind: 'individual' }).every(
        (item) => item.kind !== 'panel',
      ),
    ).toBe(true)
    expect(
      filterCatalog(catalog.items, '', { kind: 'panel' }).every((item) => item.kind === 'panel'),
    ).toBe(true)
    expect(catalog.items.map((item) => item.id)).toEqual(ids)
  })
  it('保留组合原词，链接唯一同名记录；同缩写的不同标本不擅自归并', () => {
    const index = createKnowledgeIndex(catalog.items)
    const panel = index.get('xwh2026.table-4-8.005')!
    expect(
      panel.members.find((member) => member.label === 'ALT')?.candidates.map((item) => item.id),
    ).toEqual(['xwh2026.table-4-1.015'])
    const glucose = index
      .get('xwh2026.table-4-8.006')!
      .members.find((member) => member.label === 'GLU')!
    expect(glucose.status).toBe('ambiguous')
    expect(glucose.candidates.map((item) => item.id)).toEqual([
      'xwh2026.table-4-1.034',
      'xwh2026.table-4-3.032',
    ])
    const creatinine = index
      .get('xwh2026.table-4-8.006')!
      .members.find((member) => member.label === 'CREA')!
    expect(creatinine.status).toBe('unresolved')
    expect(index.get('xwh2026.table-4-1.015')!.panels.map((item) => item.name)).toContain(
      '肝功全项',
    )
    expect(index.get('glucose')!.panels).toEqual([])
  })
})

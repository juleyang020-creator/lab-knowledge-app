import { describe, expect, it } from 'vitest'
import { filterCatalog } from '../domain/search'
import { contentBundle, modelClaim } from './fixtures'
const base = contentBundle().catalog.items[0]!
const items = [
  {
    ...base,
    id: 'glucose',
    name: '葡萄糖',
    abbreviation: 'GLU',
    aliases: ['血糖'],
    category: '糖代谢',
  },
  {
    ...base,
    id: 'hba1c',
    name: '糖化血红蛋白',
    abbreviation: 'HbA1c',
    aliases: ['糖化'],
    category: '糖代谢',
  },
  {
    ...base,
    id: 'cbc',
    name: '血常规',
    abbreviation: 'CBC',
    aliases: ['血细胞'],
    category: '血液',
    summary: modelClaim(),
  },
]

describe('常用名称与缩写检索', () => {
  it.each([
    ['血糖', ['glucose']],
    ['  ｈｂＡ１ｃ ', ['hba1c']],
    ['糖化', ['hba1c']],
    ['血糖 GLU', ['glucose']],
    ['不存在', []],
    ['[', []],
  ])('%s', (query, expected) => {
    expect(filterCatalog).toBeTypeOf('function')
    expect(filterCatalog(items, query).map((item) => item.id)).toEqual(expected)
  })
  it('分类和概述来源筛选共同生效', () => {
    expect(
      filterCatalog(items, '', { category: '血液', provenance: 'model' }).map((item) => item.id),
    ).toEqual(['cbc'])
    expect(filterCatalog(items, '', { category: '血液', provenance: 'document' })).toEqual([])
  })
  it('空查询保留顺序且不修改原数组', () => {
    const order = items.map((item) => item.id)
    expect(filterCatalog(items, '  ').map((item) => item.id)).toEqual(order)
    expect(items.map((item) => item.id)).toEqual(order)
  })
})

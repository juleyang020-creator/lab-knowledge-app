import { describe, expect, it } from 'vitest'
import {
  catalogNameKey,
  chapterCatalogRelations,
  findBookRelations,
  relationNameKey,
} from '../domain/book'
import type { BookItemsPayload } from '../domain/book'

function payload(bookId: string, items: Partial<BookItemsPayload['items'][number]>[]): BookItemsPayload {
  return {
    bookId,
    generatedFrom: 'test',
    note: '测试',
    itemCount: items.length,
    items: items.map((item, index) => ({
      id: `${bookId.replace('-', '')}.c001.i${index + 1}`,
      name: '占位',
      chapterId: '001',
      chapterTitle: '测试章',
      lineStart: 10,
      lineEnd: 20,
      fields: [],
      reviewStatus: 'unreviewed',
      ...item,
    })),
  } as BookItemsPayload
}

describe('互链名称键', () => {
  it('规范化全名一致：大小写、空格、▲不敏感', () => {
    expect(catalogNameKey('白细胞计数▲')).toBe(catalogNameKey('白细胞计数'))
    expect(relationNameKey('C 反应蛋白')).toBe(relationNameKey('c反应蛋白'))
  })
  it('只剥程序性后缀，不做近义猜测', () => {
    expect(relationNameKey('血清总蛋白测定')).toBe(relationNameKey('血清总蛋白'))
    expect(relationNameKey('总胆汁酸的测定')).toBe(relationNameKey('总胆汁酸'))
    expect(relationNameKey('血浆葡萄糖')).not.toBe(relationNameKey('血清葡萄糖'))
    expect(relationNameKey('乳酸脱氢酶及其同工酶')).not.toBe(relationNameKey('乳酸脱氢酶'))
  })
})

describe('目录项目 → 教材条目', () => {
  it('按名称与手册照录别名匹配，跨书全部列出', () => {
    const relations = findBookRelations(
      '超敏C 反应蛋白',
      ['C反应蛋白'],
      [
        payload('book-98', [{ name: '超敏C反应蛋白', chapterId: '013' }]),
        payload('book-99', [{ name: 'C反应蛋白', chapterId: '006' }]),
        payload('book-100', [{ name: '红细胞沉降率' }]),
      ],
    )
    expect(relations.map((relation) => relation.bookId)).toEqual(['book-98', 'book-99'])
  })
  it('不匹配返回空', () => {
    expect(findBookRelations('血清钾', [], [payload('book-98', [{ name: '钠离子' }])])).toEqual([])
  })
})

describe('教材章节 → 目录项目', () => {
  const catalog = [
    { id: 'a', name: '孕酮', abbreviation: 'P', aliases: [] },
    { id: 'b', name: '孕酮', abbreviation: 'PROG', aliases: [] },
    { id: 'c', name: '睾酮', abbreviation: 'T', aliases: [] },
  ]
  it('同键多条目录记录全部列出，去重按项目编号', () => {
    const relations = chapterCatalogRelations(
      '021',
      payload('book-98', [
        { name: '孕酮', chapterId: '021' },
        { name: '睾酮', chapterId: '021' },
        { name: '孕酮', chapterId: '022' },
      ]),
      catalog,
    )
    expect(relations.map((item) => item.id).sort()).toEqual(['a', 'b', 'c'])
  })
  it('无条目切片时返回空', () => {
    expect(chapterCatalogRelations('001', null, catalog)).toEqual([])
  })
})

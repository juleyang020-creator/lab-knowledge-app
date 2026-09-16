import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateCatalog } from '../domain/validation'
import { parseManual } from '../domain/manual'
import { collectionGuides, collectionGuidesFor } from '../domain/collection'

const catalog = validateCatalog(JSON.parse(readFileSync('public/content/catalog.json', 'utf8')))
const byId = (id: string) => catalog.items.find((item) => item.id === id)!

describe('常用采集章节直达', () => {
  it('摘录逐字回源，章节和页码真实；常规尿规则不串到培养、定时尿或脑脊液', () => {
    const text = readFileSync('public/content/xwh-manual-2026.md', 'utf8')
    const lines = text.split('\n')
    const sections = parseManual(text)
    expect(collectionGuides.length).toBeGreaterThanOrEqual(6)
    for (const guide of collectionGuides) {
      for (const excerpt of guide.excerpts) {
        expect(excerpt.text).toBe(lines[excerpt.line - 1])
        const section = sections.find((section) => section.id === excerpt.sectionId)!
        expect(excerpt.line).toBeGreaterThanOrEqual(section.lineStart)
        expect(excerpt.line).toBeLessThanOrEqual(section.lineEnd)
        expect(section.printedPages).toContain(excerpt.printedPage)
      }
    }
    expect(collectionGuidesFor(byId('xwh2026.table-4-1.015')).map((guide) => guide.id)).toEqual([
      'chemistry',
    ])
    expect(collectionGuidesFor(byId('xwh2026.table-4-8.005')).map((guide) => guide.id)).toEqual([
      'chemistry',
    ])
    expect(collectionGuidesFor(byId('xwh2026.table-4-3.001')).map((guide) => guide.id)).toEqual([
      'blood-count',
    ])
    expect(collectionGuidesFor(byId('xwh2026.table-4-3.024')).map((guide) => guide.id)).toEqual([
      'routine-urine',
    ])
    expect(collectionGuidesFor(byId('xwh2026.table-4-1.102')).map((guide) => guide.id)).toEqual([
      'timed-urine',
    ])
    expect(collectionGuidesFor(byId('xwh2026.table-4-3.040')).map((guide) => guide.id)).toEqual([
      'routine-stool',
    ])
    expect(collectionGuidesFor(byId('xwh2026.table-4-4.001')).map((guide) => guide.id)).toEqual([
      'coagulation',
    ])
    expect(collectionGuidesFor(byId('xwh2026.table-4-4.014'))).toEqual([])
    expect(collectionGuidesFor(byId('xwh2026.table-4-1.095'))).toEqual([])
    for (const item of catalog.items.filter(
      (item) => item.manual?.location.sectionId === 'table-4-5',
    )) {
      expect(collectionGuidesFor(item)).toEqual([])
    }
    expect(collectionGuidesFor(byId('glucose'))).toEqual([])
  })
})

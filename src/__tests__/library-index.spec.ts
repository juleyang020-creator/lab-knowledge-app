import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { LibrarySchema } from '../domain/library'
import { CatalogSchema } from '../domain/content'

it('源码包始终校验书目、总页数及原文件引用绑定，不依赖本机PDF', () => {
  const library = LibrarySchema.parse(JSON.parse(readFileSync('public/library/index.json', 'utf8')))
  const catalog = CatalogSchema.parse(
    JSON.parse(readFileSync('public/content/catalog.json', 'utf8')),
  )
  for (const book of library.documents) {
    const source = catalog.sources.find((entry) => entry.id === book.sourceId)
    expect(source?.asset).toBe(book.asset)
    expect(source?.pdfPages).toBe(book.pages)
  }
  expect(
    LibrarySchema.safeParse({ ...library, totals: { ...library.totals, pages: 1 } }).success,
  ).toBe(false)
  const unsafe = structuredClone(library)
  unsafe.documents[0]!.asset = '../outside.pdf'
  expect(LibrarySchema.safeParse(unsafe).success).toBe(false)
})

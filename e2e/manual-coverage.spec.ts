import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { validateCatalog } from '../src/domain/validation'
import { manualBlocks, manualText, parseManual } from '../src/domain/manual'

const catalog = validateCatalog(JSON.parse(readFileSync('public/content/catalog.json', 'utf8')))
const imported = catalog.items.filter((item) => item.manual)
const sections = parseManual(readFileSync('public/content/xwh-manual-2026.md', 'utf8'))
const normalize = (text: string) => text.replace(/\s+/g, '')

// Normalize formatting without flattening superscripts into ordinary digits.
function renderedText(elements: Element[]): string[] {
  return elements.map((element) => {
    const clone = element.cloneNode(true) as HTMLElement
    clone.querySelectorAll('.manual-inherited').forEach((note) => note.remove())
    clone.querySelectorAll('sup').forEach((node) => node.replaceWith(`^(${node.textContent})`))
    clone.querySelectorAll('sub').forEach((node) => node.replaceWith(`_(${node.textContent})`))
    clone.querySelectorAll('br').forEach((node) => node.replaceWith('\n'))
    return (clone.textContent ?? '').replace(/\s+/g, '')
  })
}

test('全量517条项目详情逐字段浏览器核对，无遗漏、空值补造或上下标丢失', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/#/professional')
  const visited: string[] = []
  let fields = 0
  for (const item of imported) {
    // Reset the document between batches: WebKit limits history writes to 100/10s.
    // Exhaustive automation must not turn a browser rate limit into a content failure.
    if (visited.length % 20 === 0)
      await page.goto(`/?auditBatch=${visited.length}#/professional/items/${item.id}`)
    else
      await page.evaluate((id) => {
        location.hash = `/professional/items/${id}`
      }, item.id)
    await expect(page.locator('main h1')).toHaveText(item.name)
    const clinical = item.manual!.fields.find((field) => field.label === '临床意义')
    const clinicalText = clinical?.inheritedFrom?.value ?? clinical?.value
    if (clinicalText)
      expect(await page.locator('.clinical-text').evaluateAll(renderedText)).toEqual([
        normalize(manualText(clinicalText)),
      ])
    else await expect(page.locator('.clinical-text')).toHaveCount(0)
    await expect(page.locator('.knowledge-overview > section h2')).toHaveText([
      '临床意义',
      '参考范围与解释',
      '标本采集要求',
    ])
    const reference = item.manual!.fields.find((field) => field.label === '参考区间')
    const referenceText = reference?.inheritedFrom?.value ?? reference?.value
    if (referenceText)
      expect(await page.locator('.reference-value').evaluateAll(renderedText)).toEqual([
        normalize(manualText(referenceText)),
      ])
    else await expect(page.locator('.reference-value')).toHaveCount(0)
    const specimen = item.manual!.fields.find((field) => field.label === '标本要求')
    const specimenText = specimen?.inheritedFrom?.value ?? specimen?.value
    if (specimenText)
      expect(await page.locator('.specimen-value').evaluateAll(renderedText)).toEqual([
        normalize(manualText(specimenText)),
      ])
    else await expect(page.locator('.specimen-value')).toHaveCount(0)
    await page.getByText('完整原表字段与表后说明', { exact: true }).click()
    const entry = item.manual!
    await expect(page.locator('.manual-fields > div')).toHaveCount(entry.fields.length)
    expect(await page.locator('.manual-fields dt').allTextContents()).toEqual(
      entry.fields.map((field) => field.label),
    )
    const values = await page.locator('.manual-fields dd').evaluateAll(renderedText)
    expect(values, item.id).toEqual(
      entry.fields.map((field) =>
        normalize(field.value ? manualText(field.value) : '原文空白（未补填）'),
      ),
    )
    expect(await page.locator('.manual-notes p').evaluateAll(renderedText)).toEqual(
      entry.notes.map((note) => normalize(manualText(note))),
    )
    await expect(page.locator('.loading-panel, .error-panel')).toHaveCount(0)
    visited.push(item.id)
    fields += values.length
  }
  expect(new Set(visited).size).toBe(517)
  expect(fields).toBe(4026)
  expect(errors).toEqual([])
  await testInfo.attach('manual-items-audit', {
    body: JSON.stringify({
      browser: testInfo.project.name,
      items: visited.length,
      fields,
      errors,
      visited,
    }),
    contentType: 'application/json',
  })
})

test('全量233节原文和21张表可阅读，逐节核对段落、表头和所有表格单元格', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/#/professional/manual')
  const chapters = page.getByRole('combobox', { name: '手册章节' })
  await expect(chapters.locator('option')).toHaveCount(233)
  let paragraphs = 0,
    tables = 0,
    cells = 0
  const visited: string[] = []
  for (const section of sections) {
    if (visited.length % 20 === 0)
      await page.goto(`/?auditBatch=${visited.length}#/professional/manual?section=${section.id}`)
    else await chapters.selectOption(section.id)
    await expect(page.locator('.manual-reading h2')).toHaveText(section.title)
    const blocks = manualBlocks(section)
    const sourceParagraphs = blocks.filter((block) => block.kind === 'paragraph')
    const actualParagraphs = await page.locator('.manual-reading > p[id]').evaluateAll(renderedText)
    expect(actualParagraphs, section.id).toEqual(
      sourceParagraphs.map((block) => normalize(manualText(block.text))),
    )
    const sourceTables = blocks.filter((block) => block.kind === 'table')
    await expect(page.locator('.manual-table')).toHaveCount(sourceTables.length)
    for (let i = 0; i < sourceTables.length; i++) {
      const table = sourceTables[i]!
      const actualTable = page.locator('.manual-table').nth(i)
      expect(await actualTable.locator('th').evaluateAll(renderedText)).toEqual(
        table.headers.map((cell) => normalize(manualText(cell))),
      )
      const expectedCells = table.rows.flatMap((row) =>
        row.cells.map((cell) => normalize(manualText(cell) || '原文空白')),
      )
      expect(
        await actualTable.locator('td').evaluateAll(renderedText),
        `${section.id} table ${i}`,
      ).toEqual(expectedCells)
      tables++
      cells += expectedCells.length
    }
    visited.push(section.id)
    paragraphs += actualParagraphs.length
  }
  expect(new Set(visited).size).toBe(233)
  expect(tables).toBe(21)
  expect(paragraphs).toBe(474)
  expect(errors).toEqual([])
  await testInfo.attach('manual-fulltext-audit', {
    body: JSON.stringify({
      browser: testInfo.project.name,
      sections: visited.length,
      tables,
      paragraphs,
      cells,
      errors,
      visited,
    }),
    contentType: 'application/json',
  })
})

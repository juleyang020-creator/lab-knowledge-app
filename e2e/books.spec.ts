import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { BooksManifestSchema, ChapterContentSchema } from '../src/domain/book'

// 教材内容文件由 pnpm books:import 本机生成（不入 Git）；CI 源码包模式没有源库，跳过。
test.skip(process.env.CI_SOURCE_ONLY === 'true', '教材全文与检索索引为本机生成内容，源码包模式不含')

const manifest = BooksManifestSchema.parse(
  JSON.parse(readFileSync('public/content/books.json', 'utf8')),
)

test('书架列出全部教材与手册入口，章数与清单一致', async ({ page }) => {
  await page.goto('/#/books')
  await expect(page.getByRole('heading', { name: '教材全文阅读', exact: true })).toBeVisible()
  const cards = page.locator('.book-card')
  await expect(cards).toHaveCount(manifest.books.length + 1)
  for (const book of manifest.books) {
    await expect(cards.filter({ hasText: book.title }).first(), book.title).toContainText(
      `${book.chapters.length} 章`,
    )
  }
  await expect(cards.filter({ hasText: '标本采集手册' })).toHaveCount(1)
})

test('章节阅读：侧栏目录、正文照录、行锚点与跳页、书内检索', async ({ page }) => {
  const book = manifest.books.find((entry) => entry.id === 'book-98')!
  const chapter = book.chapters.find((entry) => entry.id === '008')!
  await page.goto(`/#/books/${book.id}/${chapter.id}`)
  await expect(page.locator('main h1')).toHaveText(chapter.title)

  // 侧栏：书目 + 篇分组章节树，当前章节高亮
  await expect(page.locator('.sidebar .side-group')).toHaveCount(manifest.books.length)
  const active = page.locator('.sidebar .side-chapter.active')
  await expect(active).toHaveText(chapter.title)

  // 行锚点与生成内容一致：段落每块一个，表格每行一个
  const content = ChapterContentSchema.parse(
    JSON.parse(readFileSync(`public/content/books/${book.id}/${chapter.id}.json`, 'utf8')),
  )
  const expectedLines = content.sections
    .flatMap((section) => section.blocks)
    .reduce((sum, block) => sum + (block.kind === 'table' ? block.rows.length : 1), 0)
  const anchors = await page.locator('.chapter-body [id^="L"]').count()
  expect(anchors).toBe(expectedLines)

  // 跳页：PDF 第 160 页应落在该章页面范围内
  await page.getByRole('combobox', { name: '按原书 PDF 页跳转' }).selectOption('160')
  await expect(page).toHaveURL(/line=\d+/)

  // 书内检索：糖化血红蛋白应在本书有命中，并可跳到对应章行
  const search = page.getByRole('searchbox', { name: '本书内检索' })
  await search.fill('糖化血红蛋白')
  const results = page.locator('.manual-search-results li')
  await expect(results.first()).toBeVisible()
  await results.first().getByRole('button').click()
  await expect(page).toHaveURL(/#\/books\/book-98\/\w+\?line=\d+/)
  await expect(page.locator('.manual-target-row').first()).toBeVisible()
})

test('全库搜索同时命中项目、手册与教材', async ({ page }) => {
  await page.goto('/#/search?q=' + encodeURIComponent('糖化血红蛋白'))
  await expect(page.locator('.search-group').first()).toBeVisible()
  const groups = page.locator('.search-group h2')
  await expect(groups).toContainText([/检验项目（\d+）/, /采集手册（\d+/, /教材原文（\d+/])
  const bookHit = page.locator('.search-group').filter({ hasText: '教材原文' })
  await bookHit.getByRole('link').first().click()
  await expect(page).toHaveURL(/#\/books\/book-\d+\/\w+\?line=\d+/)
  await expect(page.locator('main h1')).toBeVisible()
})

test('教材内容缺失时明确提示生成命令而不是空白页', async ({ page }) => {
  await page.route('**/content/books/book-98/001.json', (route) =>
    route.fulfill({ status: 404, body: 'Not found' }),
  )
  await page.goto('/#/books/book-98/001')
  await expect(page.getByRole('alert')).toContainText('books:import')
})

test('项目详情展示教材同名条目并可跳到原文章节行', async ({ page }) => {
  await page.goto('/#/items/creatinine')
  const section = page.locator('#textbook')
  await expect(section.getByRole('heading', { name: /教材同名条目/ })).toBeVisible()
  const entry = section.locator('.member-row').first()
  await entry.locator('summary').click()
  await expect(entry.locator('.book-fields dt').first()).toBeVisible()
  await expect(entry.locator('.book-fields')).toContainText(/检测方法|酶法|苦味酸/)
  await entry.getByRole('link', { name: '阅读原文章节 ↗', exact: true }).click()
  await expect(page).toHaveURL(/#\/books\/book-98\/006\?line=\d+/)
  await expect(page.locator('.manual-target-row').first()).toBeVisible()
})

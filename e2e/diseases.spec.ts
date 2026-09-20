import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { DiseasesPayloadSchema } from '../src/domain/disease'

// 病种关联库由 pnpm diseases:build 本机生成（不入 Git）；CI 源码包模式没有源库，跳过。
test.skip(process.env.CI_SOURCE_ONLY === 'true', '病种关联库为本机生成内容，源码包模式不含')

const payload = DiseasesPayloadSchema.parse(
  JSON.parse(readFileSync('public/content/diseases.json', 'utf8')),
)
const top = [...payload.diseases].sort((a, b) => b.mentions.length - a.mentions.length)[0]!

test('病种列表：全量展示、筛选、计数与关联数徽标', async ({ page }) => {
  await page.goto('/#/diseases')
  await expect(page.getByRole('heading', { name: '查病种', exact: true })).toBeVisible()
  await expect(page.locator('.disease-row')).toHaveCount(payload.diseaseCount)

  const filter = page.getByRole('searchbox', { name: '筛选病种' })
  await filter.fill(top.name)
  await expect(page.locator('.disease-row')).toHaveCount(1)
  await expect(page.locator('.disease-row .disease-name')).toHaveText(top.name)
  await expect(page.locator('.disease-row .disease-meta')).toContainText(
    `${top.mentions.length} 项关联`,
  )

  await filter.fill('绝对不存在的病种名')
  await expect(page.locator('.disease-row')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: /没有匹配/ })).toBeVisible()
})

test('病种详情：分组展示照录引文，可跳到项目与手册原文', async ({ page }) => {
  await page.goto(`/#/diseases/${top.id}`)
  await expect(page.getByRole('heading', { name: top.name, exact: true })).toBeVisible()
  await expect(page.locator('.disease-mention')).toHaveCount(top.mentions.length)
  // 每条关联都有项目链接与原文短引文
  const first = page.locator('.disease-mention').first()
  await expect(first.locator('.disease-quote')).not.toBeEmpty()
  await first.locator('.disease-item-link').click()
  await expect(page).toHaveURL(/#\/items\//)
  // 项目详情反向带有「相关病种」入口，可回到本病种
  await expect(page.locator('nav[aria-label="相关病种"]')).toBeVisible()
  await page.locator('nav[aria-label="相关病种"] a', { hasText: top.name }).first().click()
  await expect(page).toHaveURL(new RegExp(`#\/diseases\/${top.id}`))
})

test('教材章节反向列出相关检验项目并可跳转', async ({ page }) => {
  // book-98 第 006 章（非蛋白含氮化合物）含肌酐、尿素、尿酸等命中目录的条目
  await page.goto('/#/books/book-98/006')
  const relations = page.locator('nav[aria-label="本章相关检验项目"]')
  await expect(relations).toBeVisible()
  const first = relations.getByRole('link').first()
  await expect(first).toBeVisible()
  await first.click()
  await expect(page).toHaveURL(/#\/items\//)
  await expect(page.locator('main h1')).not.toBeEmpty()
})

test('病种关联缺失时明确提示生成命令而不是空白页', async ({ page }) => {
  await page.route('**/content/diseases.json', (route) =>
    route.fulfill({ status: 404, body: 'Not found' }),
  )
  await page.goto('/#/diseases')
  await expect(page.getByRole('alert')).toContainText('diseases:build')
})

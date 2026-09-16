import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { validateCatalog } from '../src/domain/validation'

test('标本查询返回保留第二页，改词限界并在刷新后清除', async ({ page }) => {
  await page.goto('/#/professional/specimens')
  const query = page.getByRole('searchbox', { name: '疾病、症状或项目关键词' })
  const pager = page.getByRole('navigation', { name: '标本查询分页' })
  await query.fill('贫血')
  await pager.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(pager).toContainText('第 2 /')
  const secondPageIds = await page
    .locator('.specimen-result')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-item-id')))
  await page
    .locator('.specimen-result')
    .first()
    .getByRole('link', { name: '查看采集要求与临床意义', exact: true })
    .click()
  await page.getByRole('link', { name: '返回标本查询', exact: true }).click()
  await expect(pager).toContainText('第 2 /')
  expect(
    await page
      .locator('.specimen-result')
      .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-item-id'))),
  ).toEqual(secondPageIds)
  await page.getByRole('tab', { name: '我是患者', exact: true }).click()
  await expect(pager).toContainText('第 2 /')
  await query.fill('糖尿病 GLU')
  await expect(pager).toHaveCount(0)
  await expect(page.locator('.specimen-result')).toHaveCount(2)
  await page.reload()
  await expect(query).toHaveValue('')
  await query.fill('贫血')
  await expect(pager).toContainText('第 1 /')
  expect(page.url()).not.toContain('page=')
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
  ).not.toContain('specimenPage')
})

for (const from of ['', 'saved', 'specimens']) {
  test(`组合与单项双向跳转保留${from || '目录'}来源和筛选`, async ({ page }) => {
    const query = new URLSearchParams({
      q: 'ALT',
      kind: 'panel',
      ...(from ? { from } : {}),
    }).toString()
    await page.goto(`/#/professional/items/xwh2026.table-4-8.005?${query}`)
    await page.locator('.member-row summary').filter({ hasText: 'ALT' }).click()
    await page.locator('.member-name').filter({ hasText: '丙氨酸氨基转移酶' }).click()
    await expect(page).toHaveURL(
      new RegExp(`xwh2026\\.table-4-1\\.015\\?${query.replace('?', '\\?')}$`),
    )
    await page
      .getByRole('region', { name: '相关组合' })
      .getByRole('link', { name: '肝功全项', exact: true })
      .click()
    await expect(page).toHaveURL(
      new RegExp(`xwh2026\\.table-4-8\\.005\\?${query.replace('?', '\\?')}$`),
    )
    await expect(
      page.getByRole('link', {
        name: `返回${from === 'saved' ? '收藏' : from === 'specimens' ? '标本查询' : '项目列表'}`,
        exact: true,
      }),
    ).toBeVisible()
  })
}

for (const mode of ['速览', '原表']) {
  test(`${mode}的同上条目跳转也保留原查询来源`, async ({ page }) => {
    const catalog = validateCatalog(JSON.parse(readFileSync('public/content/catalog.json', 'utf8')))
    const item = catalog.items.find((item) =>
      item.manual?.fields.some((field) => field.label === '标本要求' && field.inheritedFrom),
    )!
    await page.goto(`/#/professional/items/${item.id}?from=specimens`)
    if (mode === '原表') await page.getByText('完整原表字段与表后说明', { exact: true }).click()
    await page
      .getByRole('link', {
        name: mode === '原表' ? '查看同上所指记录' : '查看所指记录',
        exact: true,
      })
      .first()
      .click()
    await expect(page.getByRole('link', { name: '返回标本查询', exact: true })).toBeVisible()
  })
}

test('收藏组合卡片进入成员后仍返回收藏', async ({ page }) => {
  await page.goto('/#/professional/items/xwh2026.table-4-8.005')
  await page.getByRole('button', { name: '收藏肝功全项', exact: true }).click()
  await page.locator('.section-nav').getByRole('link', { name: /^收藏/ }).click()
  await page.locator('.card-member-disclosure > summary').click()
  await page.locator('.card-members').getByRole('link', { name: 'ALT', exact: true }).click()
  await expect(page.locator('main h1')).toHaveText('丙氨酸氨基转移酶')
  await expect(page.getByRole('link', { name: '返回收藏', exact: true })).toBeVisible()
  await page.getByRole('link', { name: '返回收藏', exact: true }).click()
  await expect(page).toHaveURL(/#\/professional\/saved$/)
  await expect(page.locator('.item-card')).toHaveCount(1)
})

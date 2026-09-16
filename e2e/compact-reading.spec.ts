import { expect, test } from '@playwright/test'

test('手机打开即可搜索，词条正文连贯且重点可一键定位', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const search = page.getByRole('searchbox', { name: '搜索检验项目' })
  await expect(search).toBeVisible()
  await search.fill('GLU')
  const row = page
    .locator('.item-card')
    .filter({ has: page.getByRole('link', { name: '血清葡萄糖▲', exact: true }) })
  await expect(row).toBeVisible()
  const listMetrics = await row.evaluate((element) => ({
    top: element.getBoundingClientRect().top,
    height: element.getBoundingClientRect().height,
  }))
  expect(listMetrics.top).toBeLessThan(480)
  expect(listMetrics.height).toBeLessThan(180)
  await row.getByRole('link', { name: '血清葡萄糖▲', exact: true }).click()
  await expect(page.locator('.detail-title .department-label')).toHaveText('检验科 · 临床化学')
  await expect(page.locator('.detail-body > .knowledge-overview > section h2')).toHaveText([
    '临床意义',
    '参考范围与解释',
    '标本采集要求',
  ])
  const before = page.url()
  await page
    .getByRole('navigation', { name: '词条速查' })
    .getByRole('button', { name: '参考范围' })
    .click()
  await expect(page.locator('#reference')).toBeFocused()
  const position = await page.locator('#reference').evaluate((element) => ({
    top: element.getBoundingClientRect().top,
    bottom: element.getBoundingClientRect().bottom,
    atEnd: window.scrollY + innerHeight >= document.documentElement.scrollHeight - 1,
  }))
  expect(position.top).toBeGreaterThanOrEqual(44)
  // Short entries may reach the end of the document before the anchor reaches the top.
  expect(position.top < 110 || position.atEnd).toBe(true)
  expect(position.bottom).toBeLessThanOrEqual(844)
  expect(page.url()).toBe(before)
  await page.getByRole('link', { name: '返回项目列表', exact: true }).click()
  await expect(search).toHaveValue('GLU')
  await testInfo.attach('compact-list-metrics', {
    body: JSON.stringify(listMetrics),
    contentType: 'application/json',
  })
})

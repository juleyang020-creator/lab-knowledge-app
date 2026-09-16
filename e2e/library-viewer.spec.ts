import { createHash } from 'node:crypto'
import { copyFileSync, readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

// Mozilla's Basic API Test PDF: public, non-medical, never a stand-in for source-book verification.
const fixturePath = 'e2e/fixtures/viewer-test.pdf'
const fixture = readFileSync(fixturePath)

test('公开软件样例验证PDF读取、翻页、缩放、失败重试和实际分段响应', async ({ page }, testInfo) => {
  const id = `software-fixture-${testInfo.project.name}`
  const asset = `library/${id}.pdf`
  copyFileSync(fixturePath, `dist/${asset}`)
  const book = {
    id,
    sourceId: id,
    title: '软件阅读器测试样例（非医学内容）',
    edition: 'PDF.js Basic API Test',
    year: 0,
    pages: 3,
    bytes: fixture.length,
    sha256: createHash('sha256').update(fixture).digest('hex'),
    asset,
    outline: [],
    imageOnly: false,
    textSearch: 'not-indexed',
  }
  await page.route('**/library/index.json', (route) =>
    route.fulfill({
      json: {
        version: 1,
        documents: [book],
        totals: { documents: 1, pages: 3, bytes: fixture.length },
      },
    }),
  )
  let blocked = true
  await page.route(`**/${asset}`, (route) => (blocked ? route.abort() : route.continue()))
  await page.goto(`/#/library/${id}?page=1`)
  await expect(page.locator('.error-panel')).toBeVisible()
  blocked = false
  await page.locator('.error-panel button').click()
  await expect(page.locator('canvas[data-rendered-page="1"]')).toBeVisible()
  const partial = await page.request.get(`/${asset}`, { headers: { Range: 'bytes=0-63' } })
  expect(partial.status()).toBe(206)
  expect(partial.headers()['accept-ranges']).toBe('bytes')
  expect(await partial.body()).toEqual(fixture.subarray(0, 64))
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(page.locator('canvas[data-rendered-page="2"]')).toBeVisible()
  await page.getByRole('spinbutton', { name: 'PDF物理页码' }).fill('3')
  await page.getByRole('button', { name: '跳转', exact: true }).click()
  await expect(page.locator('canvas[data-rendered-page="3"]')).toBeVisible()
  await expect(page.getByRole('button', { name: '下一页', exact: true })).toBeDisabled()
  await page.setViewportSize({ width: 320, height: 844 })
  await page.getByRole('combobox', { name: '页面缩放' }).selectOption('2')
  await expect
    .poll(async () =>
      page.locator('canvas').evaluate((element) => {
        const parent = element.parentElement!
        return element.getBoundingClientRect().width > parent.clientWidth
      }),
    )
    .toBe(true)
  await expect(page.getByRole('link', { name: '打开原始PDF', exact: true })).toHaveAttribute(
    'href',
    `/${asset}#page=3`,
  )
  await page.getByRole('button', { name: '上一页', exact: true }).click()
  await expect(page.locator('canvas[data-rendered-page="2"]')).toBeVisible()
})

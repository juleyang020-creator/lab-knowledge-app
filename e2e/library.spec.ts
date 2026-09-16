import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync('public/library/index.json', 'utf8')) as {
  documents: { id: string; title: string; pages: number; asset: string }[]
}

test('资料库列出全部主件；只查目录不下载整本PDF', async ({ page }) => {
  const pdfRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('.pdf')) pdfRequests.push(request.url())
  })
  await page.goto('/#/library')
  await expect(page.locator('.library-book')).toHaveCount(manifest.documents.length)
  await page.getByRole('searchbox', { name: '搜索书名或章节' }).fill('生物化学')
  await expect(page.locator('.library-book')).toHaveCount(1)
  expect(pdfRequests).toEqual([])
})

for (const book of manifest.documents) {
  test(`完整原文件可在应用内按页阅读：${book.id}`, async ({ page }) => {
    test.skip(
      process.env.CI_SOURCE_ONLY === 'true',
      '源码包不含本地教材PDF；原件校验在本机完整执行',
    )
    const errors: string[] = []
    const ranges: number[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('response', (response) => {
      if (response.url().endsWith(book.asset) && response.status() === 206)
        ranges.push(Number(response.headers()['content-length']))
    })
    await page.goto(`/#/library/${book.id}?page=1`)
    const canvas = page.locator('canvas[data-rendered-page="1"]')
    await expect(canvas).toBeVisible({ timeout: 30000 })
    expect(await canvas.evaluate((node: HTMLCanvasElement) => node.width)).toBeGreaterThan(300)
    const pageNumber = page.getByRole('spinbutton', { name: 'PDF物理页码' })
    await pageNumber.fill(String(book.pages))
    await page.getByRole('button', { name: '跳转', exact: true }).click()
    await expect(page.locator(`canvas[data-rendered-page="${book.pages}"]`)).toBeVisible({
      timeout: 30000,
    })
    await expect(page.getByRole('button', { name: '下一页', exact: true })).toBeDisabled()
    await expect(page.getByRole('link', { name: '打开原始PDF', exact: true })).toHaveAttribute(
      'href',
      `/${book.asset}#page=${book.pages}`,
    )
    expect(ranges.length).toBeGreaterThan(0)
    expect(Math.max(...ranges)).toBeLessThan(10 * 1024 * 1024)
    expect(errors).toEqual([])
  })
}

test('错误页码与缺失书籍不默默显示其他页', async ({ page }) => {
  await page.goto('/#/library/book-98?page=99999')
  await expect(page.getByRole('alert')).toContainText('页码')
  await expect(page.locator('canvas')).toHaveCount(0)
  await page.goto('/#/library/not-a-book')
  await expect(page.getByRole('heading', { name: '未找到这份资料' })).toBeVisible()
})

for (const resource of ['index.json', 'xwh-manual-2026.pdf']) {
  test(`资料库 ${resource} 读取失败后可原地重试`, async ({ page }) => {
    test.skip(process.env.CI_SOURCE_ONLY === 'true', '本例需本地手册PDF；云端另测公开的软件样例')
    let blocked = true
    await page.route(`**/library/${resource}`, async (route) => {
      if (blocked) await route.abort()
      else await route.continue()
    })
    await page.goto('/#/library/xwh-manual-2026?page=1')
    await expect(page.locator('.error-panel')).toBeVisible()
    await expect(page.locator('canvas[data-rendered-page="1"]')).toHaveCount(0)
    blocked = false
    await page.locator('.error-panel button').click()
    await expect(page.locator('canvas[data-rendered-page="1"]')).toBeVisible({ timeout: 30000 })
    await expect(page.locator('.error-panel')).toHaveCount(0)
  })
}

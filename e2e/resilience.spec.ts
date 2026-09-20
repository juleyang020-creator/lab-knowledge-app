import { test, expect } from '@playwright/test'
import type { AudiencePayload } from '../src/domain/content'

test('空文章段落触发详细资料加载失败，修复数据后可重试', async ({ page }) => {
  let empty = true
  await page.route('**/content/professional.json', async (route) => {
    const response = await route.fetch()
    const payload = (await response.json()) as AudiencePayload
    if (empty) payload.articles.find((article) => article.itemId === 'glucose')!.sections = []
    await route.fulfill({ response, json: payload })
  })
  await page.goto('/#/items/glucose')
  await expect(page.getByRole('heading', { name: '葡萄糖（血糖）', exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('详细资料加载失败，请重试。')
  empty = false
  await page.getByRole('button', { name: '重试加载', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.locator('.other-information .content-section').first()).toBeVisible()
})

test('目录加载失败后可重试且不生成假内容兜底', async ({ page }) => {
  let calls = 0
  await page.route('**/content/catalog.json', async (route) => {
    calls += 1
    if (calls === 1) await route.fulfill({ status: 503, body: 'Unavailable' })
    else await route.continue()
  })
  await page.goto('/#/items')
  await expect(page.getByRole('alert')).toContainText('不会以模型内容自动填补加载错误')
  await expect(page.getByRole('link', { name: '葡萄糖（血糖）', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '重试加载', exact: true }).click()
  await expect(page.getByRole('heading', { name: '检验项目速查', exact: true })).toBeVisible()
  await page.getByRole('searchbox', { name: '搜索检验项目' }).fill('血糖')
  await expect(page.getByRole('link', { name: '葡萄糖（血糖）', exact: true })).toBeVisible()
})

test('项目目录不会预先下载条目正文或教材索引', async ({ page }) => {
  const lazyRequests: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (url.endsWith('/professional.json') || url.includes('/books/')) lazyRequests.push(url)
  })
  await page.goto('/#/items')
  await expect(page.getByRole('heading', { name: '检验项目速查', exact: true })).toBeVisible()
  expect(lazyRequests).toEqual([])
})

test('本地存储被禁用时仍可阅读和会话内收藏', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Blocked', 'SecurityError')
      },
    }),
  )
  await page.goto('/#/items/glucose')
  await expect(
    page.getByText('当前浏览器无法保存偏好，收藏仅在本次打开期间有效。', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '收藏葡萄糖（血糖）', exact: true }).click()
  await page.getByRole('link', { name: /^收藏(?:\s*\d+)?$/ }).click()
  await expect(page.getByRole('link', { name: '葡萄糖（血糖）', exact: true })).toBeVisible()
})

test('中文输入法检索、详情返回保留关键词，科室页签可筛选', async ({ page }) => {
  await page.goto('/#/items')
  const search = page.getByRole('searchbox', { name: '搜索检验项目' })
  await search.evaluate((element) => {
    const input = element as HTMLInputElement
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    input.value = '糖化'
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: '糖化', isComposing: true }))
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '糖化' }))
  })
  const teachingItem = page.getByRole('link', { name: '糖化血红蛋白', exact: true }).first()
  await expect(teachingItem).toBeVisible()
  await expect(page.getByRole('link', { name: '葡萄糖（血糖）', exact: true })).toHaveCount(0)
  await teachingItem.click()
  await expect(page.getByRole('heading', { name: '糖化血红蛋白', exact: true })).toBeVisible()
  await page.goBack()
  await expect(search).toHaveValue('糖化')
  await page.getByRole('link', { name: '凝血', exact: true }).click()
  await expect(page.getByRole('heading', { name: '暂时没有匹配的项目', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '清除筛选', exact: true }).click()
  await page.getByRole('link', { name: '凝血', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('14')
})

test('资料正文作为文本呈现，不执行嵌入HTML', async ({ page }) => {
  const injected = '<img src=x onerror="window.__labXss=1">'
  await page.route('**/content/professional.json', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    body.articles[0].sections[0].claims[0].text = injected
    await route.fulfill({ response, json: body })
  })
  await page.goto('/#/items/glucose')
  await expect(page.getByText(injected, { exact: true })).toBeVisible()
  expect(await page.evaluate(() => Reflect.get(window, '__labXss'))).toBeUndefined()
  await expect(page.locator('img[src="x"]')).toHaveCount(0)
})

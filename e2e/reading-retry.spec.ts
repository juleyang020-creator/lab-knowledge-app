import { test, expect } from '@playwright/test'
import { PREFERENCE_KEY } from '../src/adapters/preferences'
import { contentBundle, documentClaim } from '../src/__tests__/fixtures'

test('条目详情重试刷新修正后的目录，不额外加载教材索引', async ({ page }) => {
  const server = contentBundle()
  const claim = documentClaim('professional.new-source')
  if (claim.provenance.kind !== 'document') throw new Error('应使用文件段落测试')
  claim.provenance.sourceId = 'new-source'
  server.professional.articles[0]!.sections[0]!.claims = [claim]
  server.professional.articles[0]!.sections[0]!.title = '已恢复的详细说明'
  const requests = { catalog: 0, professional: 0 }
  const bookFetches: string[] = []
  const documents: string[] = []
  page.on('request', (request) => {
    if (request.resourceType() === 'document') documents.push(request.url())
  })
  await page.addInitScript(
    ({ key }) => {
      localStorage.setItem(key, JSON.stringify({ version: 1, savedIds: ['sample'] }))
      localStorage.setItem('unrelated-setting', 'keep')
    },
    { key: PREFERENCE_KEY },
  )
  let catalogOffline = false
  await page.route('**/content/*.json', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname.includes('/books/') || pathname.endsWith('/books.json')) {
      bookFetches.push(pathname)
      await route.fulfill({ status: 404, body: 'Not found' })
      return
    }
    const name = pathname.split('/').pop()!.replace('.json', '') as 'catalog' | 'professional'
    requests[name] += 1
    if (name === 'catalog' && catalogOffline) {
      await route.fulfill({ status: 503, body: 'Unavailable' })
    } else {
      await route.fulfill({ json: server[name] })
    }
  })
  await page.goto('/#/items/sample')
  await expect(page.getByRole('alert')).toContainText('详细资料加载失败')
  expect(requests).toEqual({ catalog: 1, professional: 1 })
  const preferences = await page.evaluate((key) => localStorage.getItem(key), PREFERENCE_KEY)

  // 未修正的内容重试不能静默消除错误
  await page.getByRole('button', { name: '重试加载', exact: true }).click()
  await expect.poll(() => requests.catalog).toBe(2)
  await expect(page.getByRole('alert')).toContainText('详细资料加载失败')

  catalogOffline = true
  await page.getByRole('button', { name: '重试加载', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('项目资料加载失败')
  catalogOffline = false
  server.catalog.version = 'corrected'
  server.catalog.sources.push({ ...server.catalog.sources[0]!, id: 'new-source' })
  await page.getByRole('button', { name: '重试加载', exact: true }).click()
  await expect(page.getByRole('heading', { name: '已恢复的详细说明', exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(requests).toEqual({ catalog: 4, professional: 3 })
  // 教材索引与章节内容不应被条目重试触发；只允许 books.json 清单探测
  expect(bookFetches.every((url) => url.endsWith('/books.json'))).toBe(true)
  expect(await page.evaluate((key) => localStorage.getItem(key), PREFERENCE_KEY)).toBe(preferences)
  expect(await page.evaluate(() => localStorage.getItem('unrelated-setting'))).toBe('keep')
  expect(documents).toHaveLength(1)
  await page.getByRole('link', { name: /^收藏(?:\s*\d+)?$/ }).click()
  await expect(page.getByRole('link', { name: '测试项目', exact: true })).toBeVisible()
  expect(requests.catalog).toBe(4)
})

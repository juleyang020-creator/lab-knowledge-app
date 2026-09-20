import { execFileSync } from 'node:child_process'
import { test, expect } from '@playwright/test'
import { PREFERENCE_KEY } from '../src/adapters/preferences'
import { contentBundle, modelClaim } from '../src/__tests__/fixtures'

test('跨文件重复段落修正后，来源重试刷新两文件并保留收藏偏好', async ({ page }) => {
  let server = contentBundle()
  server.professional.articles[0]!.sections[0]!.claims[0]!.id = 'sample.document'
  const requests = { catalog: 0, professional: 0 }
  const navigations: string[] = []
  page.on('request', (request) => {
    if (request.resourceType() === 'document') navigations.push(request.url())
  })
  await page.route('**/content/*.json', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname.includes('/books/') || pathname.endsWith('/books.json')) {
      await route.fulfill({ status: 404, body: 'Not found' })
      return
    }
    const name = pathname.split('/').pop()!.replace('.json', '') as keyof typeof server
    requests[name] += 1
    await route.fulfill({ json: server[name] })
  })
  await page.goto('/#/items/sample')
  await expect(page.getByRole('heading', { name: '专业说明', exact: true })).toBeVisible()
  expect(requests).toEqual({ catalog: 1, professional: 1 })
  await page.getByRole('button', { name: '收藏测试项目', exact: true }).click()
  const preferences = await page.evaluate((key) => {
    localStorage.setItem('unrelated-setting', 'keep')
    return localStorage.getItem(key)
  }, PREFERENCE_KEY)
  expect(JSON.parse(preferences!)).toMatchObject({ savedIds: ['sample'] })
  await page.getByRole('link', { name: '来源', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('资料之间的来源信息不一致')
  await expect(page.getByTestId('claim-count')).toHaveCount(0)
  expect(requests).toEqual({ catalog: 1, professional: 1 })

  // A refresh must still validate the whole bundle, not merely dismiss the error.
  await page.getByRole('button', { name: '重试加载', exact: true }).click()
  await expect.poll(() => requests).toEqual({ catalog: 2, professional: 2 })
  await expect(page.getByRole('alert')).toContainText('资料之间的来源信息不一致')
  await expect(page.getByTestId('claim-count')).toHaveCount(0)

  server = contentBundle()
  server.catalog.version = 'refreshed'
  server.catalog.sources[0]!.title = '刷新后的测试资料'
  server.professional.articles[0]!.sections[0]!.claims.push(modelClaim('sample.refreshed'))
  await page.getByRole('button', { name: '重试加载', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByTestId('document-count')).toHaveText('1')
  await expect(page.getByTestId('model-count')).toHaveText('2')
  await expect(page.getByTestId('claim-count')).toHaveText('3')
  await expect(page.getByText('刷新后的测试资料 · 测试版', { exact: true })).toBeVisible()
  expect(requests).toEqual({ catalog: 3, professional: 3 })
  expect(await page.evaluate((key) => localStorage.getItem(key), PREFERENCE_KEY)).toBe(preferences)
  expect(await page.evaluate(() => localStorage.getItem('unrelated-setting'))).toBe('keep')
  expect(navigations).toHaveLength(1)

  await page.getByRole('link', { name: /^收藏(?:\s*\d+)?$/ }).click()
  await expect(page.getByRole('link', { name: '测试项目', exact: true })).toBeVisible()
  expect(requests).toEqual({ catalog: 3, professional: 3 })
})

const expectedStats = JSON.parse(
  execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/validate-content.ts'], {
    encoding: 'utf8',
  }),
) as { professionalUI: { total: number; document: number; model: number } }

test('来源进度页显示真实段落统计，明确模型补充未完成替换', async ({ page }) => {
  await page.goto('/#/sources')
  await expect(page.getByRole('heading', { name: '来源与补全进度', exact: true })).toBeVisible()
  await expect(page.getByTestId('document-count')).toHaveText(
    String(expectedStats.professionalUI.document),
  )
  await expect(page.getByTestId('model-count')).toHaveText(
    String(expectedStats.professionalUI.model),
  )
  await expect(page.getByTestId('claim-count')).toHaveText(
    String(expectedStats.professionalUI.total),
  )
  await expect(page.getByText('来源覆盖不等于医学准确率。', { exact: true })).toBeVisible()
  await expect(page.getByText('临床生物化学检验技术 · 第2版', { exact: true })).toBeVisible()
})

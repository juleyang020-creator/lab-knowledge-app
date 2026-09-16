import { test, expect } from '@playwright/test'
import { PREFERENCE_KEY } from '../src/adapters/preferences'
import { contentBundle, documentClaim } from '../src/__tests__/fixtures'

for (const [audience, path] of [
  ['patient', '/patient/items/sample'],
  ['professional', '/professional/items/sample'],
  ['patient', '/patient/guide'],
  ['professional', '/professional/topics'],
] as const) {
  test(`${path} 重试刷新修正后的目录，不额外加载另一个入口`, async ({ page }) => {
    const server = contentBundle()
    const claim = documentClaim(`${audience}.new-source`)
    if (claim.provenance.kind !== 'document') throw new Error('应使用文件段落测试')
    claim.provenance.sourceId = 'new-source'
    server[audience].articles[0]!.sections[0]!.claims = [claim]
    server[audience].articles[0]!.sections[0]!.title = '已恢复的详细说明'
    server.patient.guides.push({
      id: 'test-guide',
      title: '已恢复的患者指南',
      claims: [documentClaim('patient.guide')],
    })
    server.professional.topics.push({
      id: 'test-topic',
      title: '已恢复的参考主题',
      summary: documentClaim('professional.topic'),
      itemIds: ['sample'],
    })
    const requests = { catalog: 0, patient: 0, professional: 0 }
    let catalogOffline = false
    const documents: string[] = []
    page.on('request', (request) => {
      if (request.resourceType() === 'document') documents.push(request.url())
    })
    await page.addInitScript(
      ({ key, audience }) => {
        localStorage.setItem(key, JSON.stringify({ version: 1, savedIds: ['sample'], audience }))
        localStorage.setItem('unrelated-setting', 'keep')
      },
      { key: PREFERENCE_KEY, audience },
    )
    await page.route('**/content/*.json', async (route) => {
      const name = new URL(route.request().url()).pathname
        .split('/')
        .pop()!
        .replace('.json', '') as keyof typeof server
      requests[name] += 1
      if (name === 'catalog' && catalogOffline) {
        await route.fulfill({ status: 503, body: 'Unavailable' })
      } else {
        await route.fulfill({ json: server[name] })
      }
    })
    await page.goto(`/#${path}`)
    await expect(page.getByRole('alert')).toContainText('该入口的详细资料加载失败')
    expect(requests).toEqual({ catalog: 1, patient: 0, professional: 0, [audience]: 1 })
    const preferences = await page.evaluate((key) => localStorage.getItem(key), PREFERENCE_KEY)

    // Retrying unfixed content must not silently dismiss the error.
    await page.getByRole('button', { name: '重试加载', exact: true }).click()
    await expect.poll(() => requests.catalog).toBe(2)
    await expect(page.getByRole('alert')).toContainText('该入口的详细资料加载失败')

    catalogOffline = true
    await page.getByRole('button', { name: '重试加载', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('项目资料加载失败')
    catalogOffline = false
    server.catalog.version = 'corrected'
    server.catalog.sources.push({ ...server.catalog.sources[0]!, id: 'new-source' })
    await page.getByRole('button', { name: '重试加载', exact: true }).click()
    const heading = path.includes('/items/')
      ? '已恢复的详细说明'
      : audience === 'patient'
        ? '已恢复的患者指南'
        : '已恢复的参考主题'
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(requests).toEqual({ catalog: 4, patient: 0, professional: 0, [audience]: 3 })
    expect(await page.evaluate((key) => localStorage.getItem(key), PREFERENCE_KEY)).toBe(
      preferences,
    )
    expect(await page.evaluate(() => localStorage.getItem('unrelated-setting'))).toBe('keep')
    expect(documents).toHaveLength(1)
    await page.getByRole('link', { name: /^收藏(?:\s+\d+)?$/ }).click()
    await expect(page.getByRole('link', { name: '测试项目', exact: true })).toBeVisible()
    expect(requests.catalog).toBe(4)
  })
}

import { test, expect } from '@playwright/test'
import type { Catalog } from '../src/domain/content'
import { validateCatalog } from '../src/domain/validation'

for (const itemPath of ['glucose/', '%67lucose/']) {
  test(`尾斜杠详情 ${itemPath} 保留同一项目和查询参数`, async ({ page }) => {
    await page.addInitScript(
      (key) => localStorage.setItem(key, JSON.stringify({ version: 1, savedIds: ['glucose'] })),
      'lab-knowledge.preferences.v1',
    )
    await page.goto(`/#/items/${itemPath}?q=GLU&from=saved`)
    await expect(page.getByRole('heading', { name: '葡萄糖（血糖）', exact: true })).toBeVisible()
    await page.getByRole('link', { name: '返回收藏', exact: true }).click()
    await expect(page).toHaveURL(/#\/saved\?q=GLU$/)
    await expect(page.getByRole('link', { name: '葡萄糖（血糖）', exact: true })).toBeVisible()
  })
}

test('本院字段在取得本院文件前不进入界面，数据层仍通过校验', async ({ page }) => {
  await page.route('**/content/catalog.json', async (route) => {
    const response = await route.fetch()
    const catalog = (await response.json()) as Catalog
    catalog.sources.push({
      id: 'test-institution',
      title: '软件测试用本院文件',
      edition: '测试版',
      publisher: '测试机构',
      year: 2026,
      pdfPages: 10,
      kind: 'institutional',
    })
    catalog.items.find((item) => item.id === 'glucose')!.institutional.orderName = {
      id: 'test-institution.order-name',
      text: '仅用于软件测试的开单名称，不是真实业务信息。',
      provenance: {
        kind: 'document',
        sourceId: 'test-institution',
        pdfPage: 3,
        quote: '这是软件测试引文，不代表本院业务信息。',
      },
      reviewStatus: 'unreviewed',
    }
    // 数据契约继续接收有文件依据的本院字段；界面在取得正式资料前一律不显示
    await route.fulfill({ response, json: validateCatalog(catalog) })
  })
  await page.goto('/#/items/glucose')
  await expect(page.getByRole('heading', { name: '葡萄糖（血糖）', exact: true })).toBeVisible()
  await expect(page.locator('.institution-panel')).toHaveCount(0)
  await expect(
    page.getByText('仅用于软件测试的开单名称，不是真实业务信息。', { exact: true }),
  ).toHaveCount(0)
  await expect(page.getByText('待本院文件核实', { exact: true })).toHaveCount(0)
})

test('检索有来源的教学项目、查看文件依据并收藏，刷新后仍在收藏页', async ({ page }) => {
  await page.goto('/#/items')
  await expect(page.getByRole('heading', { name: '检验项目速查', exact: true })).toBeVisible()
  await page.getByRole('searchbox', { name: '搜索检验项目' }).fill('血糖')
  await page.getByRole('link', { name: '葡萄糖（血糖）', exact: true }).click()
  await expect(page.getByRole('heading', { name: '葡萄糖（血糖）', exact: true })).toBeVisible()
  const reference = page
    .locator('#clinical')
    .getByRole('link', { name: '文件依据 · PDF 第 162 页', exact: true })
  await expect(reference).toHaveAttribute('href', '/library/book-98.pdf#page=162')
  await expect(reference).toHaveAttribute('title', /临床生物化学检验技术 · 第2版/)
  // 本院信息面板已隐藏（待正式资料），教学条目不再显示「本院信息待补充」
  await expect(page.locator('.source-disclosure')).toHaveCount(0)
  await page.getByRole('button', { name: '收藏葡萄糖（血糖）', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '取消收藏葡萄糖（血糖）', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('模型补充 · 待核实', { exact: true }).first()).toBeVisible()
  await page.getByRole('link', { name: /^收藏(?:\s*\d+)?$/ }).click()
  await expect(page.getByRole('link', { name: '葡萄糖（血糖）', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('link', { name: '葡萄糖（血糖）', exact: true })).toBeVisible()
})

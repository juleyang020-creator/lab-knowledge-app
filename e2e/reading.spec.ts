import { test, expect } from '@playwright/test'
import type { Catalog } from '../src/domain/content'
import { validateCatalog } from '../src/domain/validation'

for (const itemPath of ['glucose/', '%67lucose/']) {
  test(`尾斜杠详情 ${itemPath} 切入口保留同一项目和查询参数`, async ({ page }) => {
    await page.goto(`/#/professional/items/${itemPath}?q=GLU&source=document&from=saved`)
    await expect(page.getByRole('heading', { name: '葡萄糖（血糖）', exact: true })).toBeVisible()
    await page.getByRole('tab', { name: '我是患者', exact: true }).click()
    await expect(page).toHaveURL(/#\/patient\/items\/glucose\?q=GLU&source=document&from=saved$/)
    await expect(page.getByRole('heading', { name: '这项检查看什么', exact: true })).toBeVisible()
    await page.getByRole('tab', { name: '我是专业人士', exact: true }).click()
    await expect(page).toHaveURL(
      /#\/professional\/items\/glucose\?q=GLU&source=document&from=saved$/,
    )
    await expect(page.getByRole('heading', { name: '临床参考', exact: true })).toBeVisible()
  })
}

test('本院非空字段显示可展开的文件、页码和引文，空字段仍待核实', async ({ page }) => {
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
    await route.fulfill({ response, json: validateCatalog(catalog) })
  })
  await page.goto('/#/professional/items/glucose')
  await page.locator('.source-disclosure > summary').click()
  const panel = page.locator('.institution-panel')
  await expect(
    panel.getByText('仅用于软件测试的开单名称，不是真实业务信息。', { exact: true }),
  ).toBeVisible()
  const evidence = panel.getByRole('link', { name: '文件依据 · PDF 第 3 页', exact: true })
  await expect(evidence).toBeVisible()
  await expect(evidence).toHaveAttribute('href', /source=test-institution/)
  await expect(evidence).toHaveAttribute('title', /软件测试用本院文件 · 测试版/)
  await expect(evidence).toHaveAttribute('title', /这是软件测试引文，不代表本院业务信息。/)
  await expect(panel.getByText('待本院文件核实', { exact: true })).toHaveCount(4)
  await evidence.click()
  await expect(page.locator('#source-test-institution')).toBeFocused()
})

test('选择专业入口、检索有来源的项目、收藏并切换到患者视图', async ({ page }) => {
  await page.goto('/')
  const professional = page.getByRole('tab', { name: '我是专业人士', exact: true })
  await expect(professional).toBeVisible()
  await professional.click()
  await expect(page.getByRole('heading', { name: '专业速查', exact: true })).toBeVisible()
  await page.getByRole('searchbox', { name: '搜索检验项目' }).fill('血糖')
  await page.getByRole('link', { name: '葡萄糖（血糖）', exact: true }).click()
  await expect(page.getByRole('heading', { name: '葡萄糖（血糖）', exact: true })).toBeVisible()
  const reference = page
    .locator('#clinical')
    .getByRole('link', { name: '文件依据 · PDF 第 162 页', exact: true })
  await expect(reference).toHaveAttribute('href', '/library/book-98.pdf#page=162')
  await expect(reference).toHaveAttribute('title', /临床生物化学检验技术 · 第2版/)
  await page.locator('.source-disclosure > summary').click()
  await expect(page.getByText('本院信息待补充', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '收藏葡萄糖（血糖）', exact: true }).click()
  await page.getByRole('tab', { name: '我是患者', exact: true }).click()
  await expect(page).toHaveURL(/#\/patient\/items\/glucose/)
  await expect(page.getByRole('heading', { name: '这项检查看什么', exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: '取消收藏葡萄糖（血糖）', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('模型补充 · 待核实', { exact: true }).first()).toBeVisible()
  await page.getByRole('link', { name: /^收藏(?:\s+\d+)?$/ }).click()
  await expect(page.getByRole('link', { name: '葡萄糖（血糖）', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('link', { name: '葡萄糖（血糖）', exact: true })).toBeVisible()
})

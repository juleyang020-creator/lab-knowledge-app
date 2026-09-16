import { test, expect } from '@playwright/test'

test('专业主题用于对照项目，切换患者入口后显示准备指南', async ({ page }) => {
  await page.goto('/#/professional')
  const referenceLink = page.getByRole('link', { name: '辅助选检', exact: true })
  await expect(referenceLink).toBeVisible()
  await referenceLink.click()
  await expect(page.getByRole('heading', { name: '辅助选检', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '血糖与长期控制', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '糖化血红蛋白', exact: true })).toBeVisible()
  await expect(page.getByText('模型补充 · 待核实', { exact: true }).first()).toBeVisible()
  await page.getByRole('tab', { name: '我是患者', exact: true }).click()
  await expect(page).toHaveURL(/#\/patient\/guide/)
  await expect(page.getByRole('heading', { name: '检查准备与指南', exact: true })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: '检查前先核对医院通知', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: '取报告方式仍需本院资料', exact: true }),
  ).toBeVisible()
})

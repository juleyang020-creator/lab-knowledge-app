import { test, expect } from '@playwright/test'

test('跳到正文移动焦点但不破坏hash路由或当前项目', async ({ page }) => {
  await page.goto('/#/professional/items/glucose')
  await expect(page.getByRole('heading', { name: '葡萄糖（血糖）', exact: true })).toBeVisible()
  const originalUrl = page.url()
  const skip = page.getByRole('link', { name: '跳到正文', exact: true })
  await skip.focus()
  await skip.press('Enter')
  await expect(page).toHaveURL(originalUrl)
  await expect(page.locator('#audience-panel')).toBeFocused()
  const content = await page.locator('#audience-panel').boundingBox()
  expect(content!.y).toBeGreaterThanOrEqual(0)
  expect(content!.y).toBeLessThan(40)
  await expect(page.getByRole('heading', { name: '葡萄糖（血糖）', exact: true })).toBeVisible()
})

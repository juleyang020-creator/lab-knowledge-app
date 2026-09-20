import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
const markdown = readFileSync('public/content/xwh-manual-2026.md', 'utf8')

for (const failure of ['network', 'mismatched-source']) {
  test(`手册${failure}失败可重试，不能把失败或旧版源文件当完整导入`, async ({ page }) => {
    let broken = true
    await page.route('**/content/xwh-manual-2026.md', async (route) => {
      if (!broken)
        return route.fulfill({ body: markdown, contentType: 'text/markdown; charset=utf-8' })
      if (failure === 'network') return route.fulfill({ status: 503, body: 'Unavailable' })
      return route.fulfill({
        body: markdown.replace('2028.04.30', '2028.04.29'),
        contentType: 'text/markdown; charset=utf-8',
      })
    })
    await page.goto('/#/manual?section=preface')
    await expect(page.getByRole('alert')).toContainText(
      failure === 'network' ? '503' : '版本不一致',
    )
    await expect(page.locator('.manual-reading')).toHaveCount(0)
    broken = false
    await page.getByRole('button', { name: '重试加载', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.locator('.manual-reading h2')).toHaveText('前言')
  })
}

test('非法章节不默默跳到别处，输入搜索不会触发HTML，目录链接使用路由', async ({ page }) => {
  await page.goto('/#/manual?section=does-not-exist')
  await expect(page.getByRole('heading', { name: '未找到这个章节', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '返回手册封面', exact: true }).click()
  await expect(page.locator('.manual-reading h2')).toHaveText('标本采集手册')
  await page.getByRole('combobox', { name: '手册章节' }).selectOption('section-2')
  await page.locator('.manual-table').getByRole('link', { name: '前言', exact: true }).click()
  await expect(page.locator('.manual-reading h2')).toHaveText('前言')
  await expect(page.locator('.manual-reading h2')).toBeFocused()
  await page.getByRole('searchbox', { name: '搜索手册全文' }).fill('<img src=x onerror=alert(1)>')
  await expect(page.getByRole('status')).toContainText('全文找到 0 个章节')
  await expect(page.locator('img')).toHaveCount(0)
})

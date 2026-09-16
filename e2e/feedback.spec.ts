import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'

for (const destination of ['item', 'audience'] as const) {
  for (const downloadMode of ['success', 'fallback'] as const) {
    test(`复用详情路由切换 ${destination} 清空旧建议和 ${downloadMode} 状态`, async ({ page }) => {
      if (downloadMode === 'fallback') {
        await page.addInitScript(() => {
          URL.createObjectURL = () => {
            throw new Error('测试下载不可用')
          }
        })
      }
      await page.goto('/#/patient/items/glucose')
      await page.getByText('生成纠错草稿', { exact: true }).click()
      const note = page.getByRole('textbox', { name: '不含患者信息的修改建议', exact: true })
      await note.fill('只属于葡萄糖患者入口的测试建议。')
      const download = downloadMode === 'success' ? page.waitForEvent('download') : null
      await page.getByRole('button', { name: '下载纠错草稿', exact: true }).click()
      if (download) await download
      await expect(page.locator('.feedback-result')).toContainText(
        downloadMode === 'success' ? '草稿已生成下载' : '当前浏览器无法生成下载',
      )
      if (downloadMode === 'fallback') {
        await expect(page.getByRole('textbox', { name: '可手动复制的纠错草稿' })).toHaveValue(
          /条目编号：glucose/,
        )
      }
      if (destination === 'item') {
        await page.evaluate(() => {
          window.location.hash = '/patient/items/hba1c'
        })
        await expect(page.getByRole('heading', { name: '糖化血红蛋白', exact: true })).toBeVisible()
      } else {
        await page.getByRole('tab', { name: '我是专业人士', exact: true }).click()
        await expect(page).toHaveURL(/#\/professional\/items\/glucose$/)
      }
      const details = page.locator('.feedback-card details')
      if ((await details.getAttribute('open')) === null) {
        await page.getByText('生成纠错草稿', { exact: true }).click()
      }
      await expect.soft(note).toHaveValue('')
      await expect.soft(page.locator('.feedback-result')).toHaveCount(0)
      await expect.soft(page.getByRole('textbox', { name: '可手动复制的纠错草稿' })).toHaveCount(0)
      await expect
        .soft(page.getByRole('button', { name: '下载纠错草稿', exact: true }))
        .toBeDisabled()
    })
  }
}

test('纠错只生成可下载草稿，不声称已经提交', async ({ page }, testInfo) => {
  await page.goto('/#/patient/items/glucose')
  await expect(page.getByText('生成纠错草稿', { exact: true })).toBeVisible()
  await page.getByText('生成纠错草稿', { exact: true }).click()
  await page
    .getByRole('textbox', { name: '不含患者信息的修改建议' })
    .fill('这里的说明需要核对资料来源。')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载纠错草稿', exact: true }).click()
  const download = await downloadPromise
  const path = testInfo.outputPath('feedback.txt')
  await download.saveAs(path)
  const body = readFileSync(path, 'utf8')
  expect(body).toContain('条目编号：glucose')
  expect(body).toContain('这里的说明需要核对资料来源。')
  expect(body).toContain('未提交')
  await expect(page.getByText('草稿已生成下载，尚未提交给维护者。', { exact: true })).toBeVisible()
})

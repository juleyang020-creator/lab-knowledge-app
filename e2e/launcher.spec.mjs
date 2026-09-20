import { test, expect } from '@playwright/test'
import { startLauncher } from '../scripts/launch.mjs'

test('启动入口提供可阅读的当前源码，浏览器无连接异常', async ({ page }) => {
  const app = await startLauncher({ port: 0, open: false })
  const errors = []
  const sockets = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('websocket', (socket) => sockets.push(socket.url()))
  try {
    await page.goto(`${app.url}#/items/glucose`)
    await expect(page.getByRole('heading', { name: '葡萄糖（血糖）', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: '临床意义', exact: true })).toBeVisible()
    expect(errors).toEqual([])
    expect(sockets.length).toBeGreaterThan(0)
    for (const socket of sockets) expect(new URL(socket).host).toBe(new URL(app.url).host)
  } finally {
    await page.close()
    await app.close()
  }
})

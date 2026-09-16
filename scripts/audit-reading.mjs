import { chromium, webkit } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const base = process.env.AUDIT_URL ?? 'http://127.0.0.1:4317'
const output = new URL('../docs/审核/手机速查改版/', import.meta.url)
await mkdir(output, { recursive: true })
const rows = []
for (const [name, browserType] of Object.entries({ chromium, webkit })) {
  const browser = await browserType.launch()
  try {
    for (const width of [320, 390, 900, 1280]) {
      for (const theme of ['light', 'dark']) {
        const page = await browser.newPage({ viewport: { width, height: 844 }, colorScheme: theme })
        const errors = []
        page.on('pageerror', (error) => errors.push(error.message))
        for (const [label, route] of [
          ['list', '/professional'],
          ['search', '/professional?q=GLU'],
          ['detail', '/professional/items/xwh2026.table-4-1.034'],
        ]) {
          await page.goto(`${base}/#${route}`)
          await page.locator('main h1').waitFor()
          if (label === 'detail') await page.locator('#reference').waitFor()
          const metrics = await page.evaluate(() => {
            const rect = (selector) => {
              const element = document.querySelector(selector)
              if (!element) return null
              const r = element.getBoundingClientRect()
              return { top: r.top, height: r.height, width: r.width }
            }
            return {
              header: rect('.top-shell'),
              firstItem: rect('.item-card'),
              clinical: rect('#clinical'),
              reference: rect('#reference'),
              fontSize: document.querySelector('.clinical-text')
                ? getComputedStyle(document.querySelector('.clinical-text')).fontSize
                : null,
              mainWidth: document.querySelector('main').clientWidth,
              mainScrollWidth: document.querySelector('main').scrollWidth,
              documentWidth: document.documentElement.scrollWidth,
              sourceNotes: document.querySelectorAll('.source-note').length,
            }
          })
          assert(metrics.documentWidth <= width + 1)
          assert(metrics.mainScrollWidth <= metrics.mainWidth + 1)
          if (label === 'list')
            assert(metrics.firstItem.top < 440, JSON.stringify({ name, width, theme, metrics }))
          if (label === 'detail') {
            assert(metrics.clinical.top < metrics.reference.top)
            assert(metrics.reference.top + metrics.reference.height <= 844)
            assert.equal(metrics.fontSize, '16px')
          }
          assert.deepEqual(errors, [])
          rows.push({ browser: name, width, theme, label, ...metrics })
          if (name === 'chromium' && width === 390 && theme === 'light')
            await page.screenshot({
              path: fileURLToPath(new URL(`${label}-390-light.png`, output)),
              fullPage: label !== 'list',
            })
        }
        await page.close()
      }
    }
  } finally {
    await browser.close()
  }
}
assert.equal(rows.length, 2 * 4 * 2 * 3)
const result = {
  timestamp: new Date().toISOString(),
  url: base,
  measuredCases: rows.length,
  baselineList390: {
    headerHeight: 187.5,
    firstItemTop: 842.484375,
    firstItemHeight: 363.984375,
    note: '本轮开始时改紧凑布局前的实际浏览器量测；不是依据截图估算。',
  },
  rows,
}
await writeFile(new URL('density-audit.json', output), JSON.stringify(result, null, 2))
console.log(
  JSON.stringify(
    {
      measuredCases: rows.length,
      phone: rows.filter(
        (row) => row.browser === 'chromium' && row.width === 390 && row.theme === 'light',
      ),
      output: fileURLToPath(output),
    },
    null,
    2,
  ),
)

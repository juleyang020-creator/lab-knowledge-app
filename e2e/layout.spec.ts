import { test, expect } from '@playwright/test'

for (const width of [320, 390]) {
  test(`模型概述徽章明确待核实且 ${width}px 窄屏不溢出`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/#/items?category=__teaching__')
    const badges = page.locator('.item-row .provenance-badge.model')
    await expect(badges.first()).toBeVisible()
    for (const badge of await badges.all()) {
      await expect(badge).toHaveText('概述为模型补充 · 待核实')
    }
    const overflow = await badges.evaluateAll((elements) =>
      elements
        .filter((element) => {
          const badge = element as HTMLElement
          const rect = badge.getBoundingClientRect()
          const row = badge.closest('.item-row')!.getBoundingClientRect()
          return (
            badge.scrollWidth > badge.clientWidth + 1 ||
            rect.left < row.left - 1 ||
            rect.right > row.right + 1 ||
            rect.left < 0 ||
            rect.right > innerWidth
          )
        })
        .map((element) => element.textContent),
    )
    expect(overflow).toEqual([])
  })
}

const routes = [
  '/',
  '/items',
  '/items?category=' + encodeURIComponent('凝血检验项目'),
  '/items/glucose',
  '/items/xwh2026.table-4-1.026',
  '/items/xwh2026.table-4-8.001',
  '/items/xwh2026.table-4-7.017',
  '/items/creatinine',
  '/manual',
  '/manual?section=table-4-7',
  '/search?q=' + encodeURIComponent('葡萄糖'),
  '/sources',
  '/library',
  '/saved',
  '/items/missing',
  '/missing',
  // 教材章节与原 PDF 需要本机生成的内容文件 / 原件，CI 源码包模式跳过
  ...(process.env.CI_SOURCE_ONLY === 'true'
    ? []
    : ['/books', '/books/book-98', '/books/book-98/008', '/library/book-98?page=162']),
]

for (const width of [1280, 900, 390, 320]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`layout ${width} ${theme}`, async ({ page }, testInfo) => {
      const browserErrors: string[] = []
      page.on('pageerror', (error) => browserErrors.push(error.message))
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ colorScheme: theme })
      for (const route of routes) {
        await page.goto(`/#${route}`)
        await expect(page.locator('main h1')).toBeVisible()
        await expect(page.locator('.loading-panel')).toHaveCount(0)
        await expect(page.locator('.error-panel')).toHaveCount(0)
        const audit = await page.evaluate(() => {
          const main = document.querySelector('main')!
          const visible = (element: HTMLElement) => {
            const rect = element.getBoundingClientRect()
            return (
              rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden'
            )
          }
          const intentionalScroll = (element: HTMLElement) => {
            for (let parent = element.parentElement; parent; parent = parent.parentElement) {
              if (['auto', 'scroll'].includes(getComputedStyle(parent).overflowX)) return true
            }
            return false
          }
          const elements = [...document.querySelectorAll('main *, .topbar *, .sidebar *')].filter(
            (element): element is HTMLElement => element instanceof HTMLElement && visible(element),
          )
          const describe = (element: HTMLElement) =>
            `${element.tagName}.${element.className}: ${(element.getAttribute('aria-label') || element.textContent || '').trim().slice(0, 42)}`
          const overflow = elements
            .filter((element) => {
              const rect = element.getBoundingClientRect()
              return !intentionalScroll(element) && (rect.left < -1 || rect.right > innerWidth + 1)
            })
            .map(describe)
          const smallTargets = elements
            .filter((element) => {
              if (
                !element.matches('button, a, input, select, summary') ||
                element.matches(':disabled')
              )
                return false
              // 教材目录树（156 章）密度优先，触控目标豁免；主操作仍全部达标
              if (element.closest('.sidebar')) return false
              return element.getBoundingClientRect().height < 43.5
            })
            .map(describe)
          const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number)
          const luminance = (values: number[]) =>
            values.slice(0, 3).reduce((sum, value, index) => {
              const c = value / 255
              return (
                sum +
                (index === 0 ? 0.2126 : index === 1 ? 0.7152 : 0.0722) *
                  (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
              )
            }, 0)
          const lowContrast: string[] = []
          for (const element of elements) {
            if (
              !element.childNodes.length ||
              ![...element.childNodes].some(
                (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
              ) ||
              element.matches(':disabled')
            )
              continue
            const style = getComputedStyle(element)
            const fg = rgb(style.color)
            let bg: number[] = []
            for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
              const candidate = rgb(getComputedStyle(parent).backgroundColor)
              if (candidate.length >= 3 && (candidate.length === 3 || candidate[3]! >= 0.99)) {
                bg = candidate
                break
              }
            }
            if (fg.length < 3 || bg.length < 3) continue
            const a = luminance(fg),
              b = luminance(bg)
            const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
            const large =
              parseFloat(style.fontSize) >= 24 ||
              (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700)
            if (ratio + 0.01 < (large ? 3 : 4.5))
              lowContrast.push(`${describe(element)} contrast=${ratio.toFixed(2)}`)
          }
          return {
            viewport: innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            mainWidth: main.clientWidth,
            mainScrollWidth: main.scrollWidth,
            overflow,
            smallTargets,
            lowContrast,
          }
        })
        await testInfo.attach(`${route.replaceAll('/', '-') || 'home'}-dom`, {
          body: JSON.stringify({ route, width, theme, ...audit }, null, 2),
          contentType: 'application/json',
        })
        expect(audit.documentWidth, route).toBeLessThanOrEqual(width + 1)
        expect(audit.mainScrollWidth, route).toBeLessThanOrEqual(audit.mainWidth + 1)
        expect(audit.overflow, route).toEqual([])
        expect(audit.smallTargets, route).toEqual([])
        expect(audit.lowContrast, route).toEqual([])
        if (route === '/items' && width === 390 && theme === 'light')
          await page.screenshot({
            path: testInfo.outputPath('items-mobile.png'),
            fullPage: true,
          })
      }
      expect(browserErrors).toEqual([])
    })
  }
}

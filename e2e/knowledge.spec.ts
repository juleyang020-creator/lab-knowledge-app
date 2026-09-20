import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { validateCatalog } from '../src/domain/validation'
import { createKnowledgeIndex } from '../src/domain/knowledge'
import { manualText } from '../src/domain/manual'

test('36个手册组合的原词和所有候选链接均可到达，不漏掉未匹配成员', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  const catalog = validateCatalog(JSON.parse(readFileSync('public/content/catalog.json', 'utf8')))
  const panels = [...createKnowledgeIndex(catalog.items).values()].filter(
    (entry) => entry.members.length,
  )
  expect(panels).toHaveLength(36)
  const verified: {
    id: string
    members: number
    linked: number
    ambiguous: number
    unresolved: number
  }[] = []
  for (const entry of panels) {
    await page.goto(`/#/items/${entry.item.id}`)
    await expect(page.locator('main h1')).toHaveText(entry.item.name)
    const rows = page.locator('.member-row')
    await expect(rows).toHaveCount(entry.members.length)
    for (let index = 0; index < entry.members.length; index++) {
      const row = rows.nth(index)
      const member = entry.members[index]!
      expect(
        await row.locator('.member-token').evaluate((element) => {
          const clone = element.cloneNode(true) as HTMLElement
          clone
            .querySelectorAll('sub')
            .forEach((node) => node.replaceWith(`_(${node.textContent})`))
          clone
            .querySelectorAll('sup')
            .forEach((node) => node.replaceWith(`^(${node.textContent})`))
          return clone.textContent?.replace(/\s+/g, '')
        }),
      ).toBe(manualText(member.label).replace(/\s+/g, ''))
      await row.locator('summary').click()
      await expect(row.locator('.member-name')).toHaveText(
        member.candidates.map((candidate) => candidate.name),
      )
      expect(
        await row
          .locator('.member-name')
          .evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
      ).toEqual(member.candidates.map((candidate) => `#/items/${candidate.id}`))
      if (member.status === 'unresolved') await expect(row).toContainText('未猜测对应关系')
    }
    verified.push({
      id: entry.item.id,
      members: entry.members.length,
      linked: entry.members.filter((member) => member.status === 'linked').length,
      ambiguous: entry.members.filter((member) => member.status === 'ambiguous').length,
      unresolved: entry.members.filter((member) => member.status === 'unresolved').length,
    })
  }
  await testInfo.attach('panel-links-audit', {
    body: JSON.stringify({ browser: testInfo.project.name, verified }),
    contentType: 'application/json',
  })
})

test('统一目录优先展示组合，可按成员检索并保留筛选返回与收藏', async ({ page }) => {
  await page.goto('/#/items')
  await expect(page.locator('.item-row').first()).toContainText('生化全项')
  await expect(page.locator('.item-row').first()).toContainText('红盖管')
  await page.getByRole('button', { name: '组合', exact: true }).click()
  await page.getByRole('searchbox', { name: '搜索检验项目' }).fill('ALT')
  const panel = page
    .locator('.item-row')
    .filter({ has: page.getByRole('link', { name: '肝功全项', exact: true }) })
  await expect(panel).toContainText('组合项目')
  await panel.getByRole('link', { name: '肝功全项', exact: true }).click()
  await page.getByRole('button', { name: '收藏肝功全项', exact: true }).click()
  await page.getByRole('link', { name: '返回项目列表', exact: true }).click()
  await expect(page.getByRole('button', { name: '组合', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByRole('searchbox', { name: '搜索检验项目' })).toHaveValue('ALT')
  await page.getByRole('button', { name: '单项', exact: true }).click()
  // 教学条目与手册条目允许同名并存，不合并；任一记录可见即可
  await expect(
    page.getByRole('link', { name: '丙氨酸氨基转移酶', exact: true }).first(),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: '肝功全项', exact: true })).toHaveCount(0)
})

test('详情优先展示采集和临床意义，组合与单项可双向查阅并保留完整原表', async ({ page }) => {
  await page.goto('/#/items/xwh2026.table-4-1.015')
  const collection = page.getByRole('region', { name: '标本采集要求', exact: true })
  await expect(collection).toContainText('红盖管')
  await expect(page.getByRole('region', { name: '临床意义', exact: true })).toContainText('肝')
  await collection.getByText('临床化学 · 采集准备', { exact: true }).click()
  await expect(collection).toContainText('空腹采集静脉血')
  await expect(collection.getByRole('link', { name: /原书第14页 · MD第691行/ })).toBeVisible()
  await page.getByRole('link', { name: '肝功全项', exact: true }).click()
  await expect(page.locator('main h1')).toHaveText('肝功全项')
  const members = page.getByRole('region', { name: '组合与细分项目', exact: true })
  await members.locator('summary').filter({ hasText: 'ALT' }).click()
  await expect(members.getByRole('link', { name: '丙氨酸氨基转移酶', exact: true })).toBeVisible()
  await expect(members).toContainText('不能据此合管采样')
  await page.getByText('完整原表字段与表后说明', { exact: true }).click()
  await expect(page.locator('.manual-fields')).toContainText('ALT、TBil')
})

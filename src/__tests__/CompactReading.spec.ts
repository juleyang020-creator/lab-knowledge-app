import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { readFileSync } from 'node:fs'
import ItemOverview from '../components/ItemOverview.vue'
import { CatalogSchema } from '../domain/content'

const catalog = CatalogSchema.parse(JSON.parse(readFileSync('public/content/catalog.json', 'utf8')))

async function renderOverview(id: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/:audience/manual', name: 'manual', component: { template: '<div />' } },
      { path: '/:audience/items/:itemId', name: 'item', component: { template: '<div />' } },
    ],
  })
  await router.push(`/professional/items/${id}`)
  return mount(ItemOverview, {
    props: { item: catalog.items.find((item) => item.id === id)!, audience: 'professional' },
    global: { plugins: [router] },
  })
}

describe('手机词条按临床阅读顺序展示', () => {
  it('直接展示临床意义、参考范围与解释，最后才是标本采集要求', async () => {
    const wrapper = await renderOverview('xwh2026.table-4-1.034')
    expect(
      wrapper
        .findAll('h2')
        .map((heading) => heading.text())
        .slice(0, 3),
    ).toEqual(['临床意义', '参考范围与解释', '标本采集要求'])
    expect(wrapper.get('[aria-labelledby="reference-title"]').text()).toContain('3.9-6.1 mmol/L')
    expect(wrapper.get('[aria-labelledby="clinical-title"]').text()).toContain(
      '升高见于各型糖尿病；降低见于各种低血糖病。',
    )
    expect(wrapper.findAll('.source-note')).toHaveLength(0)
    wrapper.unmount()
  })
})

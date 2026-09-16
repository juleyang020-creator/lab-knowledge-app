import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import ClaimBlock from '../components/ClaimBlock.vue'
import { contentBundle, documentClaim, modelClaim } from './fixtures'

describe('文献直接链接，不再展开重复备注', () => {
  it('已接入PDF用原文件超链接带物理页定位，保留书名和短引文提示', () => {
    const source = { ...contentBundle().catalog.sources[0]!, asset: 'library/book-98.pdf' }
    const claim = documentClaim()
    const wrapper = mount(ClaimBlock, { props: { claim, sources: [source] } })
    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.get('a').attributes('href')).toBe('/library/book-98.pdf#page=2')
    expect(wrapper.get('a').attributes('title')).toContain('软件测试资料')
    expect(wrapper.get('a').attributes('title')).toContain('仅用于软件测试')
    expect(wrapper.find('.source-note').exists()).toBe(false)
  })
  it('没有文件资产时跳到来源记录，不伪造原文链接；模型内容继续标明', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/sources', name: 'sources', component: { template: '<div />' } }],
    })
    await router.push('/sources')
    const wrapper = mount(ClaimBlock, {
      props: { claim: documentClaim(), sources: contentBundle().catalog.sources },
      global: { plugins: [router] },
    })
    expect(wrapper.get('a').attributes('href')).toContain('source=test-book')
    await wrapper.setProps({ claim: modelClaim() })
    expect(wrapper.find('a').exists()).toBe(false)
    expect(wrapper.text()).toContain('模型补充 · 待核实')
  })
})

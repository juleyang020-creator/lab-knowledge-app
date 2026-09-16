import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AudienceTabs from '../components/AudienceTabs.vue'

describe('两个开放的阅读入口', () => {
  it('显示用户指定的两个选项卡且均无需解锁', () => {
    const wrapper = mount(AudienceTabs)
    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs.map((tab) => tab.attributes('aria-label'))).toEqual(['我是专业人士', '我是患者'])
    expect(tabs.every((tab) => tab.attributes('disabled') === undefined)).toBe(true)
  })

  it('点击即可选择专业入口，切换后的患者入口正确标为选中', async () => {
    const wrapper = mount(AudienceTabs)
    await wrapper.findAll('[role="tab"]')[0]!.trigger('click')
    expect(wrapper.emitted('select')).toEqual([['professional']])
    await wrapper.setProps({ selected: 'patient' })
    expect(wrapper.findAll('[role="tab"]')[1]!.attributes('aria-selected')).toBe('true')
  })

  it('方向键与Home键切换入口并移动真实键盘焦点', async () => {
    const wrapper = mount(AudienceTabs, {
      props: { selected: 'professional' },
      attachTo: document.body,
    })
    const tabs = wrapper.findAll('[role="tab"]')
    ;(tabs[0]!.element as HTMLElement).focus()
    await tabs[0]!.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('select')).toEqual([['patient']])
    expect(document.activeElement).toBe(tabs[1]!.element)
    await tabs[1]!.trigger('keydown', { key: 'Home' })
    expect(document.activeElement).toBe(tabs[0]!.element)
    wrapper.unmount()
  })
})

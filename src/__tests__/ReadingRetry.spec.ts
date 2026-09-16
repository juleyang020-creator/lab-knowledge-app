import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import App from '../App.vue'
import appRouter from '../router'
import { createHttpRepository } from '../adapters/httpRepository'
import { PREFERENCE_KEY } from '../adapters/preferences'
import { validateAudience } from '../domain/validation'
import { createWorkspace, workspaceKey } from '../state/workspace'
import { contentBundle, documentClaim, jsonResponse } from './fixtures'

describe('阅读页面的实际重试按钮刷新两层缓存', () => {
  it.each([
    ['patient', '/patient/items/sample'],
    ['professional', '/professional/items/sample'],
    ['patient', '/patient/guide'],
    ['professional', '/professional/topics'],
  ] as const)('%s 的 %s 在目录修正后恢复阅读并保留偏好', async (audience, path) => {
    const bundle = contentBundle()
    const claim = documentClaim(`${audience}.corrected`)
    if (claim.provenance.kind !== 'document') throw new Error('测试应使用文件段落')
    claim.provenance.sourceId = 'corrected-source'
    bundle[audience].articles[0]!.sections[0]!.claims = [claim]
    bundle[audience].articles[0]!.sections[0]!.title = '修复后的阅读内容'
    if (audience === 'patient') {
      bundle.patient.guides = [
        { id: 'guide', title: '修复后的阅读内容', claims: [documentClaim('patient.guide')] },
      ]
    } else {
      bundle.professional.topics = [
        {
          id: 'topic',
          title: '修复后的阅读内容',
          summary: documentClaim('professional.topic'),
          itemIds: ['sample'],
        },
      ]
    }
    expect(() => validateAudience(bundle[audience], bundle.catalog, audience)).toThrow('未知来源')
    const requests: string[] = []
    const stored = new Map<string, string>([['unrelated-setting', 'keep']])
    const workspace = createWorkspace(
      createHttpRepository('/', async (url) => {
        requests.push(url)
        const name = url.split('/').pop()!.replace('.json', '') as keyof typeof bundle
        return jsonResponse(bundle[name])
      }),
      {
        getItem: (key) => stored.get(key) ?? null,
        setItem: (key, value) => stored.set(key, value),
      },
    )
    await workspace.loadCatalog()
    workspace.toggleSaved('sample')
    workspace.rememberAudience(audience)
    const preferences = stored.get(PREFERENCE_KEY)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: appRouter.options.routes,
    })
    await router.push(path)
    await router.isReady()
    const wrapper = mount(App, {
      global: { plugins: [router], provide: { [workspaceKey as symbol]: workspace } },
    })
    try {
      await flushPromises()
      expect(wrapper.get('[role="alert"]').text()).toContain('该入口的详细资料加载失败')
      expect(requests).toEqual(['/content/catalog.json', `/content/${audience}.json`])
      bundle.catalog.version = 'corrected'
      bundle.catalog.sources.push({ ...bundle.catalog.sources[0]!, id: 'corrected-source' })
      await wrapper.get('[role="alert"] button').trigger('click')
      await flushPromises()

      expect(requests.slice(2)).toEqual(['/content/catalog.json', `/content/${audience}.json`])
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
      expect(wrapper.text()).toContain('修复后的阅读内容')
      expect(workspace.state.catalog?.version).toBe('corrected')
      expect(workspace.state.savedIds).toEqual(['sample'])
      expect(workspace.state.rememberedAudience).toBe(audience)
      expect(stored.get(PREFERENCE_KEY)).toBe(preferences)
      expect(stored.get('unrelated-setting')).toBe('keep')
      const otherAudience = audience === 'patient' ? 'professional' : 'patient'
      expect(workspace.state.payloads[otherAudience]).toBeNull()
      await workspace.loadCatalog()
      await workspace.loadAudience(audience)
      expect(requests).toHaveLength(4)
    } finally {
      wrapper.unmount()
    }
  })
})

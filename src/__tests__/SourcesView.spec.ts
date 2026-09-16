import { describe, expect, it } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { routeLocationKey } from 'vue-router'
import SourcesView from '../views/SourcesView.vue'
import { createHttpRepository } from '../adapters/httpRepository'
import { PREFERENCE_KEY } from '../adapters/preferences'
import { validateBundle } from '../domain/validation'
import { createWorkspace, workspaceKey } from '../state/workspace'
import { contentBundle, documentClaim, jsonResponse, modelClaim } from './fixtures'

describe('来源页使用真实双层缓存重试', () => {
  it('跨文件重复段落修正后，点击重试重新取得三文件并恢复统计与原有偏好', async () => {
    const original = contentBundle()
    original.patient.articles[0]!.sections[0]!.claims[0]!.id = 'sample.professional'
    expect(() => validateBundle(original)).toThrow('跨文件内容编号重复')
    let server = original
    const requests: string[] = []
    const repository = createHttpRepository('/', async (url) => {
      requests.push(url)
      const name = url.split('/').pop()!.replace('.json', '') as keyof typeof server
      return jsonResponse(server[name])
    })
    const stored = new Map<string, string>([['unrelated-setting', 'keep']])
    const storage = {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    }
    const workspace = createWorkspace(repository, storage)
    await workspace.loadAudience('patient')
    workspace.toggleSaved('sample')
    workspace.rememberAudience('patient')
    const preferences = stored.get(PREFERENCE_KEY)
    expect(requests).toEqual(['/content/catalog.json', '/content/patient.json'])

    const wrapper = mount(SourcesView, {
      global: {
        provide: {
          [workspaceKey as symbol]: workspace,
          [routeLocationKey as symbol]: { query: {} },
        },
        stubs: { RouterLink: RouterLinkStub },
      },
    })
    try {
      await flushPromises()
      expect(wrapper.get('[role="alert"]').text()).toContain('资料之间的来源信息不一致')
      expect(wrapper.find('[data-testid="claim-count"]').exists()).toBe(false)
      expect(workspace.state.errors).toEqual({ professional: '', patient: '' })
      expect(requests).toEqual([
        '/content/catalog.json',
        '/content/patient.json',
        '/content/professional.json',
      ])

      server = contentBundle()
      server.catalog.version = 'refreshed'
      server.catalog.sources[0]!.title = '刷新后的测试资料'
      server.professional.articles[0]!.sections[0]!.claims.push(modelClaim('sample.refreshed'))
      await wrapper.get('[role="alert"] button').trigger('click')
      await flushPromises()

      expect(requests.slice(3).sort()).toEqual([
        '/content/catalog.json',
        '/content/patient.json',
        '/content/professional.json',
      ])
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
      expect(wrapper.get('[data-testid="document-count"]').text()).toBe('1')
      expect(wrapper.get('[data-testid="model-count"]').text()).toBe('3')
      expect(wrapper.get('[data-testid="claim-count"]').text()).toBe('4')
      expect(wrapper.text()).toContain('刷新后的测试资料')
      expect(workspace.state.catalog?.version).toBe('refreshed')
      expect(workspace.state.savedIds).toEqual(['sample'])
      expect(workspace.state.rememberedAudience).toBe('patient')
      expect(workspace.state.persistent).toBe(true)
      expect(stored.get(PREFERENCE_KEY)).toBe(preferences)
      expect(stored.get('unrelated-setting')).toBe('keep')

      await workspace.loadCatalog()
      await workspace.loadAudience('patient')
      await workspace.loadAudience('professional')
      expect(requests).toHaveLength(6)
    } finally {
      wrapper.unmount()
    }
  })
})

describe('来源页按结构而不是段落编号前缀统计', () => {
  it.each(['other', 'sample.panel'])(
    '跨前缀段落与项目 %s 不会误归属或重复计数',
    async (secondId) => {
      const bundle = contentBundle()
      const first = bundle.catalog.items[0]!
      bundle.catalog.sources[0]!.kind = 'institutional'
      first.institutional.orderName = documentClaim(`${secondId}.order-name`)
      bundle.catalog.items.push({
        ...structuredClone(first),
        id: secondId,
        name: '第二测试项目',
        summary: documentClaim(`${secondId}.summary`),
        institutional: { ...first.institutional, orderName: null },
      })
      bundle.patient.articles[0]!.sections[0]!.claims[0]!.id = `${secondId}.misassigned`
      for (const audience of ['professional', 'patient'] as const) {
        bundle[audience].articles.push({
          itemId: secondId,
          sections: [
            {
              id: 'context',
              title: '第二项目说明',
              claims: [
                modelClaim(
                  audience === 'patient' ? 'sample.cross-prefix' : `${secondId}.professional`,
                ),
              ],
            },
          ],
        })
      }
      bundle.professional.topics.push({
        id: 'test-topic',
        title: '测试主题',
        summary: modelClaim('sample.topic'),
        itemIds: ['sample', secondId],
      })
      bundle.patient.guides.push({
        id: 'test-guide',
        title: '测试指南',
        claims: [modelClaim(`${secondId}.guide`)],
      })
      const validated = validateBundle(bundle)
      const workspace = createWorkspace(
        {
          getCatalog: async () => validated.catalog,
          getAudience: async (audience) => validated[audience],
          invalidateContent: () => {},
        },
        null,
      )
      const wrapper = mount(SourcesView, {
        global: {
          provide: {
            [workspaceKey as symbol]: workspace,
            [routeLocationKey as symbol]: { query: {} },
          },
          stubs: { RouterLink: RouterLinkStub },
        },
      })
      await flushPromises()
      const rows = wrapper.findAll('.coverage-row')
      expect(rows).toHaveLength(2)
      expect.soft(rows[0]!.find('.document-text').text()).toBe('文件 2')
      expect.soft(rows[0]!.find('.model-text').text()).toBe('模型 2')
      expect.soft(rows[1]!.find('.document-text').text()).toBe('文件 1')
      expect.soft(rows[1]!.find('.model-text').text()).toBe('模型 2')
      expect
        .soft(wrapper.find('.coverage-footnote').text())
        .toBe('另有 2 段主题与指南内容属于模型补充。')
      wrapper.unmount()
    },
  )
})

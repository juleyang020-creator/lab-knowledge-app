import { describe, expect, it } from 'vitest'
import {
  collectClaims,
  validateBundle,
  validateAudience,
  validateCatalog,
} from '../domain/validation'
import { contentBundle, documentClaim } from './fixtures'

describe('跨文件来源完整性', () => {
  it('接收来源完整的混合试验数据并统计全部独立段落', () => {
    expect(validateBundle).toBeTypeOf('function')
    const bundle = validateBundle(contentBundle())
    expect(collectClaims(bundle)).toHaveLength(3)
  })
  it('未知来源编号不能显示成文件依据', () => {
    const bundle = contentBundle()
    bundle.catalog.sources = []
    expect(() => validateBundle(bundle)).toThrow('未知来源')
  })
  it('PDF物理页不能超出已登记文档页数', () => {
    const bundle = contentBundle()
    bundle.catalog.sources[0]!.pdfPages = 1
    expect(() => validateCatalog(bundle.catalog)).toThrow('页码')
  })
  it('同编号的不同医学段落不能相互覆盖', () => {
    const bundle = contentBundle()
    bundle.patient.articles[0]!.sections[0]!.claims[0]!.id = 'sample.professional'
    expect(() => validateBundle(bundle)).toThrow('重复')
  })
  it('专业数据不能被标成患者数据', () => {
    const bundle = contentBundle()
    expect(() => validateAudience(bundle.professional, bundle.catalog, 'patient')).toThrow(
      '阅读入口',
    )
  })
  it('每个项目在两端都要有对应内容', () => {
    const bundle = contentBundle()
    bundle.patient.articles = []
    expect(() => validateBundle(bundle)).toThrow('缺少项目')
  })
  it.each(['professional', 'patient'] as const)('%s 的空文章段落在数据层被拒绝', (audience) => {
    const bundle = contentBundle()
    bundle[audience].articles[0]!.sections = []
    expect(() => validateAudience(bundle[audience], bundle.catalog, audience)).toThrow('sections')
    expect(() => validateBundle(bundle)).toThrow('sections')
  })
  it('不存在的场景项目关联被拒绝', () => {
    const bundle = contentBundle()
    bundle.professional.topics = [
      {
        id: 'test-topic',
        title: '测试关联',
        summary: documentClaim('topic.summary'),
        itemIds: ['missing'],
      },
    ]
    expect(() => validateBundle(bundle)).toThrow('未知项目')
  })
  it('教材不能冒充本院开单文件', () => {
    const bundle = contentBundle()
    bundle.catalog.items[0]!.institutional.orderName = documentClaim('local.name')
    expect(() => validateBundle(bundle)).toThrow('本院文件')
  })
  it('只允许文件依据模式会拒绝剩余模型段落', () => {
    expect(() => validateBundle(contentBundle(), { documentOnly: true })).toThrow('模型补充')
  })
  it('同编号段落全部替换为文件依据后可通过严格模式', () => {
    const bundle = contentBundle()
    for (const audience of [bundle.patient, bundle.professional]) {
      for (const section of audience.articles[0]!.sections) {
        section.claims = section.claims.map((claim) => documentClaim(claim.id))
      }
    }
    expect(() => validateBundle(bundle, { documentOnly: true })).not.toThrow()
  })
})

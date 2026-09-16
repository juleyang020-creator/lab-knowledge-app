import { describe, expect, it } from 'vitest'
import { ClaimSchema, CatalogSchema, AudiencePayloadSchema } from '../domain/content'

const base = {
  id: 'sample.overview',
  text: '用于测试来源字段的示例，不是医学内容。',
  reviewStatus: 'unreviewed',
}

describe('每段知识必须明确来源', () => {
  it.each([
    [{ ...base, provenance: { kind: 'model', generatedOn: '2026-09-15' } }, true],
    [
      {
        ...base,
        provenance: {
          kind: 'document',
          sourceId: 'book-example',
          pdfPage: 2,
          quote: '来源核验示例',
        },
      },
      true,
    ],
    [base, false],
    [
      { ...base, provenance: { kind: 'document', sourceId: 'book-example', quote: '缺少页码' } },
      false,
    ],
    [
      {
        ...base,
        provenance: { kind: 'model', generatedOn: '2026-09-15', sourceId: 'pretend-book' },
      },
      false,
    ],
    [
      {
        ...base,
        reviewStatus: 'reviewed',
        provenance: { kind: 'model', generatedOn: '2026-09-15' },
      },
      false,
    ],
  ])('来源结构与试验版审核状态必须有效：%j', (input, valid) => {
    expect(ClaimSchema.safeParse(input).success).toBe(valid)
  })
})

describe('资料与阅读视图的数据契约', () => {
  const claim = { ...base, provenance: { kind: 'model', generatedOn: '2026-09-15' } }
  const local = {
    orderName: null,
    orderCode: null,
    specimen: null,
    turnaround: null,
    location: null,
  }
  const item = {
    id: 'sample',
    name: '测试项目',
    abbreviation: 'TEST',
    aliases: [],
    category: '测试类别',
    kind: 'analyte',
    summary: claim,
    institutional: local,
  }
  it('允许本院信息缺项，但不能把模型内容当成本院开单信息', () => {
    expect(CatalogSchema).toBeDefined()
    const catalog = { version: 'test', updatedAt: '2026-09-15', sources: [], items: [item] }
    expect(CatalogSchema.safeParse(catalog).success).toBe(true)
    const fabricated = { ...item, institutional: { ...local, orderName: claim } }
    expect(CatalogSchema.safeParse({ ...catalog, items: [fabricated] }).success).toBe(false)
  })
  it('两种视图都使用分段、有来源的内容而不是无标注正文', () => {
    expect(AudiencePayloadSchema).toBeDefined()
    const article = {
      itemId: 'sample',
      sections: [{ id: 'overview', title: '说明', claims: [claim] }],
    }
    const payload = { audience: 'patient', articles: [article], topics: [], guides: [] }
    expect(AudiencePayloadSchema.safeParse(payload).success).toBe(true)
    expect(
      AudiencePayloadSchema.safeParse({
        ...payload,
        articles: [{ itemId: 'sample', text: '没有来源' }],
      }).success,
    ).toBe(false)
  })
})

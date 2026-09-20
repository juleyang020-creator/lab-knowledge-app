import { describe, expect, it } from 'vitest'
import { harvest } from '../../scripts/build-diseases'
import { validateDiseases, diseasesByItem } from '../domain/disease'
import type { Catalog } from '../domain/content'

describe('病种抽取规则', () => {
  it('从「见于」句抽出枚举病名并带上方向', () => {
    expect(harvest('增高见于甲状旁腺机能亢进、多发性骨髓瘤、结节病等；减低见于尿毒症、佝偻病等。')).toEqual([
      { name: '甲状旁腺机能亢进', direction: 'increase' },
      { name: '多发性骨髓瘤', direction: 'increase' },
      { name: '结节病', direction: 'increase' },
      { name: '尿毒症', direction: 'decrease' },
      { name: '佝偻病', direction: 'decrease' },
    ])
  })
  it('剥掉泛化修饰与触发词跨界', () => {
    expect(harvest('升高见于各类黄疸。')).toEqual([{ name: '黄疸', direction: 'increase' }])
    expect(harvest('铁缺乏容易导致缺铁性贫血，过多易致血色病等')).toEqual([
      { name: '缺铁性贫血', direction: 'decrease' },
      { name: '血色病', direction: 'increase' },
    ])
  })
  it('括号内举例同样拆开抽取', () => {
    const hits = harvest('阳性见于急性传染性病（如风疹、麻疹等）。')
    expect(hits.map((hit) => hit.name)).toContain('风疹')
    expect(hits.map((hit) => hit.name)).toContain('麻疹')
  })
  it('共用后缀的并列碎片不展开、不造词', () => {
    // 「肝、胆及骨骼疾病」不允许猜出「肝病」「胆病」，只保留完整词
    const names = harvest('升高见于各类肝、胆及骨骼疾病。').map((hit) => hit.name)
    expect(names).toContain('骨骼疾病')
    expect(names).not.toContain('肝')
    expect(names).not.toContain('胆')
  })
  it('诊断/危险因素/表现为等次要句式', () => {
    expect(harvest('早期诊断急性心肌梗死的敏感指标。')).toEqual([
      { name: '急性心肌梗死', direction: 'related' },
    ])
    expect(harvest('是冠心病、心肌梗死、脑梗死的独立危险因素。')).toEqual([
      { name: '冠心病', direction: 'related' },
      { name: '心肌梗死', direction: 'related' },
      { name: '脑梗死', direction: 'related' },
    ])
    expect(harvest('降低表现为抽搐、心律失常。')).toEqual([
      { name: '抽搐', direction: 'decrease' },
      { name: '心律失常', direction: 'decrease' },
    ])
  })
  it('泛化词与医学判断语句不成卡', () => {
    expect(harvest('增高减低见于各类疾病。')).toEqual([])
    expect(harvest('反映肾小球滤过功能的敏感指标。')).toEqual([])
    expect(harvest('血氧结果是否可靠的判断依据。')).toEqual([])
  })
})

function catalogFixture(): Catalog {
  return {
    version: 'test',
    updatedAt: '2026-09-19',
    sources: [],
    items: [
      {
        id: 'sample',
        name: '测试项目',
        abbreviation: 'TEST',
        aliases: [],
        category: '测试',
        kind: 'test',
        summary: {
          id: 'sample.summary',
          text: '测试',
          provenance: { kind: 'model', generatedOn: '2026-09-19' },
          reviewStatus: 'unreviewed',
        },
        institutional: {
          orderName: null,
          orderCode: null,
          specimen: null,
          turnaround: null,
          location: null,
        },
        manual: {
          sourceId: 'manual-x',
          location: { sectionId: 's1', line: 42, printedPages: [7] },
          row: 1,
          fields: [{ label: '临床意义', value: '升高见于各类黄疸。' }],
          notes: [],
        },
      },
    ],
  }
}

function payloadFixture() {
  return {
    version: 'diseases-test',
    generatedFrom: 'test',
    note: '测试',
    diseaseCount: 1,
    diseases: [
      {
        id: 'd0001',
        name: '黄疸',
        mentions: [{ itemId: 'sample', direction: 'increase', quote: '升高见于各类黄疸。', line: 42 }],
      },
    ],
  }
}

describe('病种关联库跨文件校验', () => {
  it('合法载荷通过并可反查项目', () => {
    const payload = validateDiseases(payloadFixture(), catalogFixture())
    expect(payload.diseases).toHaveLength(1)
    const index = diseasesByItem(payload)
    expect(index.get('sample')?.map((disease) => disease.name)).toEqual(['黄疸'])
  })
  it('引文与手册原文逐字不一致时拒绝', () => {
    const payload = payloadFixture()
    payload.diseases[0]!.mentions[0]!.quote = '升高见于各类黄疸'
    expect(() => validateDiseases(payload, catalogFixture())).toThrow('引文')
  })
  it('关联未知项目时拒绝', () => {
    const payload = payloadFixture()
    payload.diseases[0]!.mentions[0]!.itemId = 'missing'
    expect(() => validateDiseases(payload, catalogFixture())).toThrow('未知项目')
  })
  it('行号与手册定位不一致时拒绝', () => {
    const payload = payloadFixture()
    payload.diseases[0]!.mentions[0]!.line = 43
    expect(() => validateDiseases(payload, catalogFixture())).toThrow('行号')
  })
  it('病种名称重复时拒绝', () => {
    const payload = payloadFixture()
    payload.diseases.push({ ...payload.diseases[0]!, id: 'd0002' })
    payload.diseaseCount = 2
    expect(() => validateDiseases(payload, catalogFixture())).toThrow('名称重复')
  })
})

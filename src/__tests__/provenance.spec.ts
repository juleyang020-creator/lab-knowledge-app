import { describe, expect, it } from 'vitest'
import { evidenceStats } from '../domain/provenance'
import { documentClaim, modelClaim } from './fixtures'

describe('来源覆盖统计不冒充医学准确率', () => {
  it('区分文件、模型和仍待医学审核的段落', () => {
    expect(evidenceStats).toBeTypeOf('function')
    expect(evidenceStats([documentClaim(), modelClaim()])).toEqual({
      total: 2,
      document: 1,
      model: 1,
      percent: 50,
      awaitingReview: 2,
    })
  })
  it('相同段落在两个视图出现不会重复计数', () => {
    const claim = documentClaim()
    expect(evidenceStats([claim, claim]).total).toBe(1)
  })
  it('冲突的同编号内容不能被统计静默覆盖', () => {
    expect(() => evidenceStats([modelClaim('same'), documentClaim('same')])).toThrow('冲突')
  })
  it('没有内容时不是百分之百文件覆盖', () => {
    expect(evidenceStats([]).percent).toBe(0)
  })
  it('替换同一段模型内容的依据后自动更新统计', () => {
    const before = [modelClaim('stable-id')]
    const after = [documentClaim('stable-id')]
    expect(evidenceStats(before).model).toBe(1)
    expect(evidenceStats(after)).toMatchObject({ model: 0, document: 1, percent: 100 })
  })
  it('仍有模型段落时不因四舍五入显示百分之百', () => {
    const claims = Array.from({ length: 999 }, (_, index) => documentClaim(`doc-${index}`))
    expect(evidenceStats([...claims, modelClaim()]).percent).toBeLessThan(100)
  })
})

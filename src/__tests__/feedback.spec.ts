import { describe, expect, it } from 'vitest'
import { buildFeedbackDraft } from '../domain/feedback'
const input = {
  itemId: 'glucose',
  itemName: '测试项目',
  audience: 'patient' as const,
  version: 'test',
  note: '此处说明需要核对来源。',
}
describe('只在本机生成的纠错草稿', () => {
  it('包含稳定条目编号、版本和未提交说明', () => {
    expect(buildFeedbackDraft).toBeTypeOf('function')
    const text = buildFeedbackDraft(input)
    expect(text).toContain('条目编号：glucose')
    expect(text).toContain('内容版本：test')
    expect(text).toContain('未提交')
    expect(text).toContain(input.note)
    expect(text).not.toContain('提交成功')
  })
  it('拒绝空内容和非法项目编号', () => {
    expect(() => buildFeedbackDraft({ ...input, note: '  ' })).toThrow()
    expect(() => buildFeedbackDraft({ ...input, itemId: '../private' })).toThrow()
  })
})

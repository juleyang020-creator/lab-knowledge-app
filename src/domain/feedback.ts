import { z } from 'zod'
import { AudienceSchema, IdentifierSchema } from './content'
const FeedbackSchema = z
  .object({
    itemId: IdentifierSchema,
    itemName: z.string().min(1),
    audience: AudienceSchema,
    version: z.string().min(1),
    note: z.string().trim().min(1).max(1000),
  })
  .strict()
export type FeedbackInput = z.infer<typeof FeedbackSchema>
export function buildFeedbackDraft(input: FeedbackInput): string {
  const value = FeedbackSchema.parse(input)
  return [
    '检验知识库 · 纠错草稿（未提交）',
    `项目名称：${value.itemName}`,
    `条目编号：${value.itemId}`,
    `阅读入口：${value.audience === 'professional' ? '我是专业人士' : '我是患者'}`,
    `内容版本：${value.version}`,
    '',
    '说明：本文件仅在本机生成，未发送给医院或维护者。请勿包含患者信息。',
    '',
    '修改建议：',
    value.note,
    '',
  ].join('\n')
}

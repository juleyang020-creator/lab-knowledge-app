import { z } from 'zod'
import type { Catalog } from './content.ts'

/**
 * 病种关联库的数据契约。
 * 关联全部照录手册「临床意义」原文（build-diseases.ts 生成），
 * 病名是索引标签：不构成诊断、选检或个体化建议。
 */

export const DiseaseMentionSchema = z
  .object({
    itemId: z.string().regex(/^[a-z][a-z0-9.-]*$/),
    direction: z.enum(['increase', 'decrease', 'related']),
    quote: z.string().trim().min(1).max(240),
    line: z.number().int().positive(),
  })
  .strict()
export type DiseaseMention = z.infer<typeof DiseaseMentionSchema>

export const DiseaseSchema = z
  .object({
    id: z.string().regex(/^d\d{4}$/),
    name: z.string().min(2),
    mentions: z.array(DiseaseMentionSchema).min(1),
  })
  .strict()
export type Disease = z.infer<typeof DiseaseSchema>

export const DiseasesPayloadSchema = z
  .object({
    version: z.string().min(1),
    generatedFrom: z.string().min(1),
    note: z.string().min(1),
    diseaseCount: z.number().int().nonnegative(),
    diseases: z.array(DiseaseSchema),
  })
  .strict()
export type DiseasesPayload = z.infer<typeof DiseasesPayloadSchema>

/** 跨文件校验：关联项目必须存在，引文与行号必须和手册字段逐字一致 */
export function validateDiseases(input: unknown, catalog: Catalog): DiseasesPayload {
  const payload = DiseasesPayloadSchema.parse(input)
  if (payload.diseaseCount !== payload.diseases.length)
    throw new Error('病种数量与清单不一致')
  const ids = payload.diseases.map((disease) => disease.id)
  if (new Set(ids).size !== ids.length) throw new Error('病种编号重复')
  const names = payload.diseases.map((disease) => disease.name)
  if (new Set(names).size !== names.length) throw new Error('病种名称重复')
  const items = new Map(catalog.items.map((item) => [item.id, item]))
  for (const disease of payload.diseases) {
    const seen = new Set<string>()
    for (const mention of disease.mentions) {
      const item = items.get(mention.itemId)
      if (!item?.manual) throw new Error(`病种关联了未知项目：${mention.itemId}`)
      const field = item.manual.fields.find((entry) => entry.label === '临床意义')
      const value = field?.inheritedFrom?.value ?? field?.value ?? ''
      if (!value.trim() || mention.quote !== value.trim().slice(0, 240))
        throw new Error(`病种引文与手册原文不一致：${disease.id} / ${mention.itemId}`)
      if (mention.line !== item.manual.location.line)
        throw new Error(`病种关联行号与手册定位不一致：${disease.id} / ${mention.itemId}`)
      const key = `${mention.itemId}${mention.direction}`
      if (seen.has(key)) throw new Error(`病种内关联重复：${disease.id}`)
      seen.add(key)
    }
  }
  return payload
}

/** 项目 → 病种反向索引（详情页「相关病种」用） */
export function diseasesByItem(payload: DiseasesPayload): Map<string, Disease[]> {
  const index = new Map<string, Disease[]>()
  for (const disease of payload.diseases)
    for (const mention of disease.mentions) {
      const list = index.get(mention.itemId) ?? []
      if (!list.some((entry) => entry.id === disease.id)) list.push(disease)
      index.set(mention.itemId, list)
    }
  return index
}

import { z } from 'zod'

export const AudienceSchema = z.enum(['professional', 'patient'])
export type Audience = z.infer<typeof AudienceSchema>
export const IdentifierSchema = z.string().regex(/^[a-z][a-z0-9.-]*$/)

export const ManualLocationSchema = z
  .object({
    sectionId: IdentifierSchema,
    line: z.number().int().positive(),
    printedPages: z.array(z.number().int().positive()).min(1),
  })
  .strict()

const documentProvenance = z
  .object({
    kind: z.literal('document'),
    sourceId: IdentifierSchema,
    pdfPage: z.number().int().positive().optional(),
    manualLocation: ManualLocationSchema.optional(),
    quote: z.string().trim().min(1).max(240),
  })
  .strict()
  .refine(
    (value) => Boolean(value.pdfPage) !== Boolean(value.manualLocation),
    '文件依据须且仅须一种定位方式',
  )
const modelProvenance = z
  .object({
    kind: z.literal('model'),
    generatedOn: z.iso.date(),
  })
  .strict()

export const ClaimSchema = z
  .object({
    id: IdentifierSchema,
    text: z.string().trim().min(1).max(1600),
    provenance: z.discriminatedUnion('kind', [documentProvenance, modelProvenance]),
    reviewStatus: z.literal('unreviewed'),
  })
  .strict()
export type Claim = z.infer<typeof ClaimSchema>

export const SourceSchema = z
  .object({
    id: IdentifierSchema,
    title: z.string().min(1),
    edition: z.string().min(1),
    publisher: z.string().min(1),
    year: z.number().int(),
    pdfPages: z.number().int().positive(),
    kind: z.enum(['textbook', 'institutional']),
    asset: z
      .string()
      .regex(/^library\/[a-z0-9.-]+\.pdf$/)
      .optional(),
    manual: z
      .object({
        asset: z.literal('xwh-manual-2026.md'),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        lineCount: z.number().int().positive(),
        sectionCount: z.number().int().positive(),
        groups: z
          .array(
            z
              .object({
                id: IdentifierSchema,
                name: z.string().min(1),
                count: z.number().int().positive(),
              })
              .strict(),
          )
          .min(1),
      })
      .strict()
      .optional(),
  })
  .strict()
export type SourceDocument = z.infer<typeof SourceSchema>

const institutionalField = ClaimSchema.refine(
  (claim) => claim.provenance.kind === 'document',
  '本院业务信息必须有文件依据，不能由模型生成',
).nullable()
export const ManualEntrySchema = z
  .object({
    sourceId: IdentifierSchema,
    location: ManualLocationSchema,
    row: z.number().int().positive(),
    fields: z
      .array(
        z
          .object({
            label: z.string().min(1),
            value: z.string(),
            inheritedFrom: z
              .object({ itemId: IdentifierSchema, value: z.string().min(1) })
              .strict()
              .optional(),
          })
          .strict(),
      )
      .min(1),
    notes: z.array(z.string()),
  })
  .strict()
export type ManualEntry = z.infer<typeof ManualEntrySchema>
export const CatalogItemSchema = z
  .object({
    id: IdentifierSchema,
    name: z.string().min(1),
    abbreviation: z.string(),
    aliases: z.array(z.string()),
    category: z.string().min(1),
    kind: z.enum(['panel', 'analyte', 'test']),
    manual: ManualEntrySchema.optional(),
    summary: ClaimSchema,
    institutional: z
      .object({
        orderName: institutionalField,
        orderCode: institutionalField,
        specimen: institutionalField,
        turnaround: institutionalField,
        location: institutionalField,
      })
      .strict(),
  })
  .strict()
export type CatalogItem = z.infer<typeof CatalogItemSchema>
export const CatalogSchema = z
  .object({
    version: z.string().min(1),
    updatedAt: z.iso.date(),
    sources: z.array(SourceSchema),
    items: z.array(CatalogItemSchema),
  })
  .strict()
export type Catalog = z.infer<typeof CatalogSchema>

export const SectionSchema = z
  .object({
    id: IdentifierSchema,
    title: z.string().min(1),
    claims: z.array(ClaimSchema).min(1),
  })
  .strict()
export type ClaimSection = z.infer<typeof SectionSchema>
export const ArticleSchema = z
  .object({ itemId: IdentifierSchema, sections: z.array(SectionSchema).min(1) })
  .strict()
export type Article = z.infer<typeof ArticleSchema>
export const TopicSchema = z
  .object({
    id: IdentifierSchema,
    title: z.string().min(1),
    summary: ClaimSchema,
    itemIds: z.array(IdentifierSchema).min(1),
  })
  .strict()
export type Topic = z.infer<typeof TopicSchema>
export const AudiencePayloadSchema = z
  .object({
    audience: AudienceSchema,
    articles: z.array(ArticleSchema),
    topics: z.array(TopicSchema),
    guides: z.array(SectionSchema),
  })
  .strict()
export type AudiencePayload = z.infer<typeof AudiencePayloadSchema>
export interface ContentBundle {
  catalog: Catalog
  professional: AudiencePayload
  patient: AudiencePayload
}

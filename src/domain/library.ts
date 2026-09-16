import { z } from 'zod'

const BookSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9.-]*$/),
    sourceId: z.string().regex(/^[a-z][a-z0-9.-]*$/),
    title: z.string().min(1),
    edition: z.string().min(1),
    year: z.number().int(),
    pages: z.number().int().positive(),
    bytes: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    asset: z.string().regex(/^library\/[a-z0-9.-]+\.pdf$/),
    outline: z.array(
      z
        .object({
          title: z.string(),
          page: z.number().int().positive(),
          level: z.number().int().positive(),
        })
        .strict(),
    ),
    imageOnly: z.boolean(),
    textSearch: z.literal('not-indexed'),
  })
  .strict()
  .refine((book) => book.outline.every((entry) => entry.page <= book.pages), '目录页码超出原文件')

export const LibrarySchema = z
  .object({
    version: z.literal(1),
    documents: z.array(BookSchema).min(1),
    totals: z
      .object({ documents: z.number().int(), pages: z.number().int(), bytes: z.number().int() })
      .strict(),
  })
  .strict()
  .refine(
    (library) =>
      library.totals.documents === library.documents.length &&
      new Set(library.documents.map((book) => book.id)).size === library.documents.length &&
      library.totals.pages === library.documents.reduce((sum, book) => sum + book.pages, 0) &&
      library.totals.bytes === library.documents.reduce((sum, book) => sum + book.bytes, 0),
    '资料库总数或文件编号不一致',
  )
export type Library = z.infer<typeof LibrarySchema>
export type LibraryBook = z.infer<typeof BookSchema>

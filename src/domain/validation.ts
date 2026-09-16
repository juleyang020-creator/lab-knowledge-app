import { CatalogSchema, AudiencePayloadSchema } from './content.ts'
import type {
  Audience,
  AudiencePayload,
  Catalog,
  Claim,
  ContentBundle,
  SourceDocument,
} from './content.ts'

function requireUnique(ids: string[], label: string): void {
  if (new Set(ids).size !== ids.length) throw new Error(`${label}编号重复`)
}

function checkClaims(claims: Claim[], sources: SourceDocument[]): void {
  const byId = new Map(sources.map((source) => [source.id, source]))
  for (const claim of claims) {
    if (claim.provenance.kind !== 'document') continue
    const source = byId.get(claim.provenance.sourceId)
    if (!source) throw new Error(`未知来源：${claim.provenance.sourceId}`)
    if (claim.provenance.pdfPage && claim.provenance.pdfPage > source.pdfPages)
      throw new Error(`来源页码超出文档：${claim.id}`)
    if (claim.provenance.manualLocation) {
      const location = claim.provenance.manualLocation
      if (
        !source.manual ||
        location.line > source.manual.lineCount ||
        location.printedPages.some((page) => page > source.pdfPages)
      )
        throw new Error(`手册来源定位无效：${claim.id}`)
    }
  }
}

function catalogClaims(catalog: Catalog): Claim[] {
  return catalog.items.flatMap((item) => [
    item.summary,
    ...Object.values(item.institutional).filter((claim): claim is Claim => claim !== null),
  ])
}

export function referenceClaims(payload: AudiencePayload): Claim[] {
  return [
    ...payload.topics.map((topic) => topic.summary),
    ...payload.guides.flatMap((guide) => guide.claims),
  ]
}

export function audienceClaims(payload: AudiencePayload): Claim[] {
  return [
    ...payload.articles.flatMap((article) => article.sections.flatMap((section) => section.claims)),
    ...referenceClaims(payload),
  ]
}

export function collectItemClaims(bundle: ContentBundle, itemId: string): Claim[] {
  const item = bundle.catalog.items.find((entry) => entry.id === itemId)
  if (!item) return []
  return [
    item.summary,
    ...Object.values(item.institutional).filter((claim): claim is Claim => claim !== null),
    ...[bundle.professional, bundle.patient].flatMap((payload) =>
      payload.articles
        .filter((article) => article.itemId === itemId)
        .flatMap((article) => article.sections.flatMap((section) => section.claims)),
    ),
  ]
}

export function validateCatalog(input: unknown): Catalog {
  const catalog = CatalogSchema.parse(input)
  requireUnique(
    catalog.items.map((item) => item.id),
    '项目',
  )
  requireUnique(
    catalog.sources.map((source) => source.id),
    '来源',
  )
  for (const source of catalog.sources) {
    if (!source.manual) continue
    requireUnique(
      source.manual.groups.map((group) => group.id),
      '手册分组',
    )
    for (const group of source.manual.groups) {
      if (
        catalog.items.filter(
          (item) =>
            item.manual?.sourceId === source.id && item.manual.location.sectionId === group.id,
        ).length !== group.count
      )
        throw new Error(`手册分组数量不一致：${group.id}`)
    }
  }
  const claims = catalogClaims(catalog)
  requireUnique(
    claims.map((claim) => claim.id),
    '内容',
  )
  checkClaims(claims, catalog.sources)
  for (const item of catalog.items) {
    if (item.manual) {
      const source = catalog.sources.find((entry) => entry.id === item.manual?.sourceId)
      const provenance = item.summary.provenance
      if (
        !source?.manual ||
        !source.manual.groups.some(
          (group) => group.id === item.manual?.location.sectionId && group.name === item.category,
        ) ||
        provenance.kind !== 'document' ||
        provenance.sourceId !== item.manual.sourceId ||
        JSON.stringify(provenance.manualLocation) !== JSON.stringify(item.manual.location)
      )
        throw new Error(`手册条目来源或分组不一致：${item.id}`)
      requireUnique(
        item.manual.fields.map((field) => field.label),
        '手册字段',
      )
      for (const field of item.manual.fields) {
        if (!field.inheritedFrom) continue
        const previous = catalog.items.find(
          (entry) => entry.id === field.inheritedFrom?.itemId,
        )?.manual
        if (
          field.value !== '同上' ||
          !previous ||
          previous.sourceId !== item.manual.sourceId ||
          previous.location.sectionId !== item.manual.location.sectionId ||
          previous.location.line >= item.manual.location.line ||
          previous.fields.find((entry) => entry.label === field.label)?.value !==
            field.inheritedFrom.value
        )
          throw new Error(`同上引用无效：${item.id}`)
      }
    }
    for (const claim of Object.values(item.institutional)) {
      if (!claim || claim.provenance.kind !== 'document') continue
      const sourceId = claim.provenance.sourceId
      if (catalog.sources.find((source) => source.id === sourceId)?.kind !== 'institutional') {
        throw new Error(`本院信息缺少本院文件依据：${claim.id}`)
      }
    }
  }
  return catalog
}

export function validateAudience(
  input: unknown,
  catalog: Catalog,
  expected: Audience,
): AudiencePayload {
  const payload = AudiencePayloadSchema.parse(input)
  if (payload.audience !== expected) throw new Error('内容与阅读入口不一致')
  const itemIds = new Set(catalog.items.map((item) => item.id))
  const articleIds = new Set(payload.articles.map((article) => article.itemId))
  requireUnique(
    payload.articles.map((article) => article.itemId),
    '文章',
  )
  requireUnique(
    payload.topics.map((topic) => topic.id),
    '场景',
  )
  requireUnique(
    payload.guides.map((guide) => guide.id),
    '指南',
  )
  for (const id of itemIds) {
    // Handbook rows carry their complete original fields, not invented audience rewrites.
    if (!articleIds.has(id) && !catalog.items.find((item) => item.id === id)?.manual)
      throw new Error(`阅读入口缺少项目内容：${id}`)
  }
  for (const article of payload.articles) {
    if (!itemIds.has(article.itemId)) throw new Error(`未知项目：${article.itemId}`)
    requireUnique(
      article.sections.map((section) => section.id),
      '段落',
    )
  }
  for (const topic of payload.topics) {
    for (const id of topic.itemIds) if (!itemIds.has(id)) throw new Error(`未知项目：${id}`)
  }
  const claims = audienceClaims(payload)
  requireUnique(
    claims.map((claim) => claim.id),
    '内容',
  )
  checkClaims(claims, catalog.sources)
  return payload
}

export function collectClaims(bundle: ContentBundle): Claim[] {
  return [
    ...catalogClaims(bundle.catalog),
    ...audienceClaims(bundle.professional),
    ...audienceClaims(bundle.patient),
  ]
}

export function validateBundle(
  input: unknown,
  options: { documentOnly?: boolean } = {},
): ContentBundle {
  if (!input || typeof input !== 'object') throw new Error('缺少资料包')
  const raw = input as Record<string, unknown>
  const catalog = validateCatalog(raw.catalog)
  const bundle = {
    catalog,
    professional: validateAudience(raw.professional, catalog, 'professional'),
    patient: validateAudience(raw.patient, catalog, 'patient'),
  }
  const claims = collectClaims(bundle)
  requireUnique(
    claims.map((claim) => claim.id),
    '跨文件内容',
  )
  if (options.documentOnly && claims.some((claim) => claim.provenance.kind === 'model')) {
    throw new Error('仍有模型补充，尚不能启用全文件依据模式')
  }
  return bundle
}

import type { CatalogItem, ManualEntry } from './content'
import { inlineTokens, manualText } from './manual'

export interface PanelMember {
  /** Source wording, not a corrected/expanded abbreviation. */
  label: string
  status: 'linked' | 'ambiguous' | 'unresolved'
  candidates: CatalogItem[]
}
export interface ItemKnowledge {
  item: CatalogItem
  members: PanelMember[]
  /** Only unique exact-name/abbreviation references, never ambiguous candidates. */
  panels: CatalogItem[]
}
export type KnowledgeIndex = Map<string, ItemKnowledge>

export function manualField(
  item: CatalogItem,
  label: string,
): ManualEntry['fields'][number] | undefined {
  return item.manual?.fields.find((field) => field.label === label)
}

export function fieldValue(item: CatalogItem, label: string): string {
  const field = manualField(item, label)
  return field?.inheritedFrom?.value ?? field?.value ?? ''
}

// Only used for names/codes. Clinical numbers and source text are never normalized this way.
function nameKey(text: string): string {
  return inlineTokens(text)
    .map((token) => token.text)
    .join('')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\s▲]/g, '')
}

/** Delimiters inside assay descriptions are not separate panel members. */
function memberLabels(text: string): string[] {
  const members: string[] = []
  let buffer = '',
    depth = 0
  for (const character of text) {
    if ('（('.includes(character)) depth++
    if ('）)'.includes(character)) depth = Math.max(0, depth - 1)
    if (depth === 0 && '、，,'.includes(character)) {
      if (buffer.trim()) members.push(buffer.trim())
      buffer = ''
    } else buffer += character
  }
  if (buffer.trim()) members.push(buffer.trim())
  return members
}

/** Builds navigation references; it does not assert order-code or specimen equivalence. */
export function createKnowledgeIndex(items: readonly CatalogItem[]): KnowledgeIndex {
  const index: KnowledgeIndex = new Map(
    items.map((item) => [item.id, { item, members: [], panels: [] }]),
  )
  const candidates = new Map<string, CatalogItem[]>()
  for (const item of items) {
    if (!item.manual || item.kind === 'panel') continue
    for (const key of new Set([item.name, item.abbreviation, ...item.aliases].map(nameKey))) {
      if (!key || key === '-') continue
      const scopedKey = `${item.manual.sourceId}:${key}`
      candidates.set(scopedKey, [...(candidates.get(scopedKey) ?? []), item])
    }
  }
  for (const panel of items) {
    if (!panel.manual || panel.kind !== 'panel') continue
    index.get(panel.id)!.members = memberLabels(fieldValue(panel, '具体项目')).map((label) => {
      const matches = candidates.get(`${panel.manual!.sourceId}:${nameKey(label)}`) ?? []
      if (matches.length === 1) {
        const parents = index.get(matches[0]!.id)!.panels
        if (!parents.some((item) => item.id === panel.id)) parents.push(panel)
      }
      return {
        label,
        candidates: matches,
        status: matches.length === 1 ? 'linked' : matches.length ? 'ambiguous' : 'unresolved',
      }
    })
  }
  return index
}

export interface SpecimenHit {
  knowledge: ItemKnowledge
  evidence: { label: string; text: string }[]
}

/** Local lexical retrieval, not clinical decision support. All terms must occur in the record. */
export function suggestSpecimens(index: KnowledgeIndex, query: string): SpecimenHit[] {
  if (query.length > 100) return []
  const words = query
    .normalize('NFKC')
    .toLocaleLowerCase()
    .trim()
    .split(/[\s,;、]+/)
    .filter(Boolean)
  if (!words.length || words.some((word) => word.length < 2 && !/^[a-z]$/.test(word))) return []
  return [...index.values()]
    .flatMap((knowledge) => {
      const item = knowledge.item
      if (!item.manual) return []
      const fields = [
        { label: '项目名称', text: item.name },
        { label: '缩写', text: item.abbreviation },
        ...['临床意义', '标本要求', '具体项目'].map((label) => ({
          label,
          text: fieldValue(item, label),
        })),
      ]
      const normalized = fields.map((field) =>
        manualText(field.text).normalize('NFKC').toLocaleLowerCase(),
      )
      if (!words.every((word) => normalized.some((field) => field.includes(word)))) return []
      const evidence = fields.filter((_, i) => words.some((word) => normalized[i]!.includes(word)))
      const exactName = words.some((word) => normalized.slice(0, 2).includes(word))
      const nameMatch = evidence.some(
        (field) => field.label === '项目名称' || field.label === '缩写',
      )
      return [{ knowledge, evidence, score: exactName ? 3 : nameMatch ? 2 : 1 }]
    })
    .sort((a, b) => b.score - a.score)
    .map(({ knowledge, evidence }) => ({ knowledge, evidence }))
}

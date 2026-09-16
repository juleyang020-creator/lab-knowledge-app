import type { CatalogItem } from './content'
import { manualText } from './manual'
import { fieldValue } from './knowledge'

export interface SearchFilters {
  category?: string
  provenance?: 'document' | 'model' | 'all'
  kind?: 'all' | 'panel' | 'individual'
}
const normalize = (text: string): string => text.normalize('NFKC').trim().toLocaleLowerCase()

export function filterCatalog(
  items: readonly CatalogItem[],
  query: string,
  filters: SearchFilters = {},
): CatalogItem[] {
  const normalizedQuery = normalize(query)
  const words = normalizedQuery.split(/\s+/).filter(Boolean)
  return items
    .map((item, index) => {
      const fields = [item.name, item.abbreviation, ...item.aliases].map(normalize)
      const searchable = [...fields, normalize(manualText(fieldValue(item, '具体项目')))]
      const matches = words.every((word) => searchable.some((field) => field.includes(word)))
      const categoryMatches = !filters.category || item.category === filters.category
      const kindMatches =
        !filters.kind ||
        filters.kind === 'all' ||
        (filters.kind === 'panel' ? item.kind === 'panel' : item.kind !== 'panel')
      const sourceMatches =
        !filters.provenance ||
        filters.provenance === 'all' ||
        item.summary.provenance.kind === filters.provenance
      const score = !normalizedQuery
        ? 0
        : fields.includes(normalizedQuery)
          ? 4
          : fields.some((field) => field.startsWith(normalizedQuery))
            ? 3
            : 1
      return {
        item,
        index,
        score,
        matches: matches && categoryMatches && sourceMatches && kindMatches,
      }
    })
    .filter((entry) => entry.matches)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item)
}

import type { CatalogItem } from './content'

/** Original manual grouping, not a claim about the user's hospital routing. */
export function departmentLabel(item: CatalogItem): string {
  if (!item.manual) return '检验科 · 通用参考'
  if (item.category === '检验项目组合') return '检验科 · 组合'
  if (item.category === '外送检验项目') return '检验科 · 外送'
  return `检验科 · ${item.category.replace(/检验项目$/, '')}`
}

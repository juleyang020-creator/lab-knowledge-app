import type { CatalogItem } from './content'
import { MANUAL_SOURCE_ID, manualText } from './manual'
import { fieldValue } from './knowledge'

export interface CollectionGuide {
  id: string
  title: string
  scope: string
  excerpts: { text: string; sectionId: string; line: number; printedPage: number }[]
}

/** Short, verbatim reading excerpts, checked against the immutable manual in collection.spec.ts. */
export const collectionGuides: CollectionGuide[] = [
  {
    id: 'chemistry',
    title: '临床化学 · 采集准备',
    scope: '临床化学通用章节，不替代单项的特殊要求。',
    excerpts: [
      {
        text: '临床化学检验多用非抗凝血标本，最好使用真空负压采血管。',
        sectionId: 'section-56',
        line: 685,
        printedPage: 14,
      },
      {
        text: '（1）空腹采集静脉血，多个单项化学检测项目组合检验时一般可采1 管血；',
        sectionId: 'section-56',
        line: 691,
        printedPage: 14,
      },
    ],
  },
  {
    id: 'blood-count',
    title: '血常规 · 静脉血采集',
    scope: '此处是静脉血章节；不能套用为末梢血操作要求。',
    excerpts: [
      {
        text: '一般用EDTA-2K（EDTA-K<sub>2</sub>•2H<sub>2</sub>O）1.5～2.2 mg/ml 抗凝（EDTA 抗凝采血管）。',
        sectionId: 'section-57',
        line: 715,
        printedPage: 14,
      },
      {
        text: '（1）采血后立即上下颠倒混匀5～10 次，不可用力震荡；',
        sectionId: 'section-57',
        line: 721,
        printedPage: 14,
      },
    ],
  },
  {
    id: 'coagulation',
    title: '凝血检测 · 标本注意事项',
    scope: '限原文列出的PT、APTT、FIB、TT、DD；不外推到其他凝血项目。',
    excerpts: [
      {
        text: '静脉采血抗凝血最好真空负压系统采血，抗凝剂用枸橼酸钠（109 mmol/L，即32.06 g/L，抗凝剂:全血=1:9）。',
        sectionId: 'section-55',
        line: 640,
        printedPage: 13,
      },
      { text: '（3）应单独采一管血；', sectionId: 'section-55', line: 652, printedPage: 14 },
    ],
  },
  {
    id: 'routine-urine',
    title: '常规尿液 · 容器与送检',
    scope: '常规尿液通用章节，不适用于尿培养或定时尿的特殊要求。',
    excerpts: [
      {
        text: '2.2.1 洁净、干燥、有盖、便于标记和传送、一次性使用，有较大开口便于收集；',
        sectionId: 'section-68',
        line: 874,
        printedPage: 16,
      },
      {
        text: '2.4.2 标本留取后应及时送检，以免细菌繁殖、细胞溶解或被污染等。送检标本时要置于有盖容器内，以免尿液蒸发影响检测结果。',
        sectionId: 'section-70',
        line: 925,
        printedPage: 17,
      },
    ],
  },
  {
    id: 'timed-urine',
    title: '定时尿 · 按检查目的留取',
    scope: '24小时与其他时段不能互换；容器、防腐及完整时段须向检验科确认。',
    excerpts: [
      {
        text: '2.1.4 24 h 尿：用于尿液成分定量检查分析；',
        sectionId: 'section-67',
        line: 856,
        printedPage: 16,
      },
      {
        text: '2.1.5 特殊试验尿：（如3 h、8 h、12 h 等计时尿和餐后尿等），则应按照医嘱要求进行留尿，并注明用药时间，便于分析对比。',
        sectionId: 'section-67',
        line: 865,
        printedPage: 16,
      },
    ],
  },
  {
    id: 'routine-stool',
    title: '常规粪便 · 避免污染',
    scope: '只摘录一般容器及防污染要求；不同检测方法的饮食、用药要求另行确认。',
    excerpts: [
      {
        text: '3.1.2 盛粪便标本的容器必须有盖，有明显的标记。要选取粪便的脓、血、黏液等异常成分进行检查，表面无异常时应从粪便表面、深处及粪端多处取材；采取标本后及时送检，否则可因pH 及消化酶等影响，而使粪便中的细胞成分被破坏分解。',
        sectionId: 'section-72',
        line: 946,
        printedPage: 18,
      },
      {
        text: '3.1.3 不应留取尿壶或便盆中的粪便标本。若标本中混入尿液，可导致某些项目检验结果出现错误。粪便标本中也不可混入植物、泥土、污水等异物，易混淆试验结果。不应该从卫生纸或衣裤、纸尿裤等物品上留取标本，不能用棉签有棉絮端挑取标本。',
        sectionId: 'section-72',
        line: 949,
        printedPage: 18,
      },
    ],
  },
]

export function collectionGuidesFor(item: CatalogItem): CollectionGuide[] {
  if (item.manual?.sourceId !== MANUAL_SOURCE_ID) return []
  const table = item.manual.location.sectionId
  const specimen = manualText(fieldValue(item, '标本要求')).replace(/\s+/g, '')
  let id = ''
  if (
    (table === 'table-4-1' ||
      (table === 'table-4-8' && fieldValue(item, '送标本：地点') === '生化室')) &&
    specimen === '红盖管'
  )
    id = 'chemistry'
  if (table === 'table-4-3' && item.manual.row <= 18) id = 'blood-count'
  if (
    (table === 'table-4-4' && ['PT', 'APTT', 'FIB', 'TT', 'D-Dimer'].includes(item.abbreviation)) ||
    item.id === 'xwh2026.table-4-8.015'
  )
    id = 'coagulation'
  if (['table-4-1', 'table-4-3'].includes(table) && ['新鲜尿液', '随机尿液'].includes(specimen))
    id = 'routine-urine'
  if (table === 'table-4-1' && ['24小时尿', '12小时尿'].includes(specimen)) id = 'timed-urine'
  if (['xwh2026.table-4-3.040', 'xwh2026.table-4-3.041'].includes(item.id)) id = 'routine-stool'
  return collectionGuides.filter((guide) => guide.id === id)
}

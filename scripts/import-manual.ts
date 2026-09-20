import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  MANUAL_ASSET,
  MANUAL_SOURCE_ID,
  importManualItems,
  manualBlocks,
  parseManual,
} from '../src/domain/manual.ts'
import { validateBundle } from '../src/domain/validation.ts'
import type { Catalog, SourceDocument } from '../src/domain/content.ts'

const expectedCounts = [113, 105, 55, 14, 40, 74, 49, 36, 31]
const root = new URL('../', import.meta.url)
const asset = new URL(`public/content/${MANUAL_ASSET}`, root)
const args = process.argv.slice(2)
const check = args.length === 1 && args[0] === '--check'
if (args.length && !check && !(args.length === 2 && args[0] === '--source'))
  throw new Error(
    '用法：node --experimental-strip-types scripts/import-manual.ts [--source 文件路径 | --check]',
  )
const bytes = await readFile(args[0] === '--source' ? args[1]! : asset)
const sha256 = createHash('sha256').update(bytes).digest('hex')
const markdown = bytes.toString('utf8')
const sections = parseManual(markdown)
const imported = importManualItems(sections)
const groups = sections
  .filter((section) => /^table-4-[1-9]$/.test(section.id))
  .map((section) => ({
    id: section.id,
    name: section.title.replace(/^表(?:4-)?\d+\s*/, ''),
    count: imported.filter((item) => item.manual?.location.sectionId === section.id).length,
  }))
if (JSON.stringify(groups.map((group) => group.count)) !== JSON.stringify(expectedCounts))
  throw new Error('原书分组数量变化，需人工核对再更新导入契约，不能静默接受缺行')
const readJSON = async (name: string) =>
  JSON.parse(await readFile(new URL(`public/content/${name}.json`, root), 'utf8'))
const original = (await readJSON('catalog')) as Catalog
const source: SourceDocument = {
  id: MANUAL_SOURCE_ID,
  title: '标本采集手册',
  edition: '2026版 · XWH-JY-CJ',
  publisher: '首都医科大学宣武医院检验科',
  year: 2026,
  pdfPages: 99,
  kind: 'institutional',
  manual: {
    asset: MANUAL_ASSET,
    sha256,
    lineCount: markdown.split('\n').length - (markdown.endsWith('\n') ? 1 : 0),
    sectionCount: sections.length,
    groups,
  },
}
const previousSource = original.sources.find((entry) => entry.id === MANUAL_SOURCE_ID)
// A separately verified original PDF remains valid only for the same Markdown snapshot.
if (previousSource?.manual?.sha256 === sha256 && previousSource.asset)
  source.asset = previousSource.asset
const catalog: Catalog = {
  ...original,
  version: '0.2.0-manual-2026',
  updatedAt: '2026-09-16',
  sources: previousSource
    ? original.sources.map((entry) => (entry.id === MANUAL_SOURCE_ID ? source : entry))
    : [...original.sources, source],
  // Preserve every pre-existing teaching item/ID; source rows are a separate institution-specific layer.
  items: [...imported, ...original.items.filter((item) => !item.id.startsWith('xwh2026.'))],
}
validateBundle({
  catalog,
  professional: await readJSON('professional'),
})
if (check) {
  if (JSON.stringify(original) !== JSON.stringify(catalog))
    throw new Error('应用条目与手册源文件不一致，请检查差异后重新导入')
} else {
  await writeFile(asset, bytes)
  await writeFile(
    new URL('public/content/catalog.json', root),
    JSON.stringify(catalog, null, 2) + '\n',
  )
}
const blocks = sections.flatMap(manualBlocks)
const report = {
  mode: check ? 'check' : 'import',
  source: MANUAL_ASSET,
  sha256,
  sourceBytes: bytes.length,
  lineCount: source.manual!.lineCount,
  sectionCount: sections.length,
  tables: blocks.filter((block) => block.kind === 'table').length,
  paragraphs: blocks.filter((block) => block.kind === 'paragraph').length,
  groups,
  importedItems: imported.length,
  retainedTeachingItems: catalog.items.length - imported.length,
  retainedBlankRow: { section: 'table-4-7', line: 2738, disposition: '全文保留，不生成虚构项目' },
  originalCells: imported.reduce((sum, item) => sum + item.manual!.fields.length, 0),
  blankCells: imported.flatMap((item) => item.manual!.fields).filter((field) => field.value === '')
    .length,
  dittoCells: imported.flatMap((item) => item.manual!.fields).filter((field) => field.inheritedFrom)
    .length,
  restoredSourceIsIdentical: Buffer.from(
    sections.map((section) => section.markdown).join(''),
  ).equals(bytes),
  medicalReview:
    '未校订原文；仅验证录入完整性，不证明医学准确性；来源定位为MD行号和原书页码，未核验原PDF',
}
if (!check)
  await writeFile(
    new URL('docs/审核/标本采集手册录入对账.json', root),
    JSON.stringify(report, null, 2) + '\n',
  )
console.info(JSON.stringify(report, null, 2))
console.info(`校验位置：${fileURLToPath(asset)}`)

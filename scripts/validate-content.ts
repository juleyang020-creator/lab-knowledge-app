import { readFile } from 'node:fs/promises'
import { validateBundle, collectClaims } from '../src/domain/validation.ts'
import { evidenceStats } from '../src/domain/provenance.ts'

try {
  const args = process.argv.slice(2).filter((arg) => arg !== '--')
  if (args.some((arg) => arg !== '--require-documents'))
    throw new Error('未知参数，仅支持 --require-documents')
  const [catalog, professional, patient] = await Promise.all(
    ['catalog', 'professional', 'patient'].map(async (name): Promise<unknown> =>
      JSON.parse(
        await readFile(new URL(`../public/content/${name}.json`, import.meta.url), 'utf8'),
      ),
    ),
  )
  const bundle = validateBundle(
    { catalog, professional, patient },
    { documentOnly: args.includes('--require-documents') },
  )
  const stats = evidenceStats(collectClaims(bundle))
  console.info(
    JSON.stringify(
      {
        mode: args.includes('--require-documents') ? 'document-only' : 'mixed-experimental',
        items: bundle.catalog.items.length,
        sources: bundle.catalog.sources.length,
        ...stats,
        scope: '医学说明段落来源，不等于医学准确率；本院业务信息另行核验',
      },
      null,
      2,
    ),
  )
} catch (error) {
  console.error(error instanceof Error ? error.message : '内容校验失败')
  process.exitCode = 1
}

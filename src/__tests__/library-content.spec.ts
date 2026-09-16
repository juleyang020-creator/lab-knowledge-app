import { createHash } from 'node:crypto'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// CI is explicitly source-only; normal local checks still require every original PDF.
describe.skipIf(process.env.CI_SOURCE_ONLY === 'true')(
  '资料库全部主文件无损接入（本地原件校验）',
  () => {
    it('所有主件均实际存在，逐份核对大小和SHA-256，不把派生分片重复计入', async () => {
      expect(existsSync('public/library/index.json')).toBe(true)
      const manifest = JSON.parse(readFileSync('public/library/index.json', 'utf8'))
      const inventory = JSON.parse(readFileSync('docs/审核/library-inventory.json', 'utf8'))
      expect(manifest.documents).toHaveLength(inventory.summary.primary_document_count)
      expect(manifest.totals.pages).toBe(inventory.summary.primary_pdf_pages)
      for (const document of manifest.documents) {
        const path = `public/${document.asset}`
        expect(existsSync(path)).toBe(true)
        expect(statSync(path).size).toBe(document.bytes)
        const hash = createHash('sha256')
        for await (const chunk of createReadStream(path)) hash.update(chunk)
        expect(hash.digest('hex')).toBe(document.sha256)
        expect(
          inventory.documents.some(
            (source: { source_version_sha256: string }) =>
              source.source_version_sha256 === document.sha256,
          ),
        ).toBe(true)
      }
      expect(new Set(manifest.documents.map((document: { id: string }) => document.id)).size).toBe(
        manifest.documents.length,
      )
    }, 60000)
  },
)

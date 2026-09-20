import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateBundle, collectClaims } from '../domain/validation'
import { evidenceStats } from '../domain/provenance'

const load = (name: string): unknown =>
  JSON.parse(readFileSync(resolve(process.cwd(), 'public/content', `${name}.json`), 'utf8'))

describe('实际发布内容', () => {
  it('所有医学段落都有来源，本院信息缺失时不填模型值', () => {
    const bundle = validateBundle({
      catalog: load('catalog'),
      professional: load('professional'),
    })
    const stats = evidenceStats(collectClaims(bundle))
    expect(bundle.catalog.items.length).toBeGreaterThan(0)
    expect(stats.document).toBeGreaterThan(0)
    expect(stats.awaitingReview).toBe(stats.total)
    const localFields = bundle.catalog.items.flatMap((item) => Object.values(item.institutional))
    expect(
      localFields.every((value) => value === null || value.provenance.kind === 'document'),
    ).toBe(true)
    let strictError = ''
    try {
      validateBundle(bundle, { documentOnly: true })
    } catch (error) {
      strictError = error instanceof Error ? error.message : '未知错误'
    }
    expect(strictError).toBe(stats.model > 0 ? '仍有模型补充，尚不能启用全文件依据模式' : '')
  })
})

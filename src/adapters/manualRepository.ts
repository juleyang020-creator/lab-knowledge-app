import type { SourceDocument } from '../domain/content'
import { MANUAL_ASSET, parseManual } from '../domain/manual'
import type { ManualSection } from '../domain/manual'

/** The digest binds the full-text download to the edition used by the project catalog. */
export async function loadManual(
  baseUrl: string,
  source: SourceDocument,
  signal?: AbortSignal,
): Promise<ManualSection[]> {
  if (!source.manual) throw new Error('未接入手册原文')
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const response = await fetch(`${base}content/${MANUAL_ASSET}`, { cache: 'no-store', signal })
  if (!response.ok) throw new Error(`手册加载失败（HTTP ${response.status}）`)
  const bytes = await response.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const sha256 = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  if (sha256 !== source.manual.sha256) throw new Error('手册原文与目录版本不一致，请更新内容后重试')
  const sections = parseManual(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  if (
    sections.length !== source.manual.sectionCount ||
    sections.at(-1)?.lineEnd !== source.manual.lineCount
  )
    throw new Error('手册章节不完整')
  return sections
}

import type { Claim } from './content'

export interface EvidenceStats {
  total: number
  document: number
  model: number
  percent: number
  awaitingReview: number
}

export function evidenceStats(claims: readonly Claim[]): EvidenceStats {
  const unique = new Map<string, Claim>()
  for (const claim of claims) {
    const previous = unique.get(claim.id)
    if (previous && JSON.stringify(previous) !== JSON.stringify(claim)) {
      throw new Error(`内容编号存在冲突：${claim.id}`)
    }
    unique.set(claim.id, claim)
  }
  const values = [...unique.values()]
  const total = values.length
  const document = values.filter((claim) => claim.provenance.kind === 'document').length
  return {
    total,
    document,
    model: total - document,
    percent: total ? Math.floor((document / total) * 1000) / 10 : 0,
    awaitingReview: values.filter((claim) => claim.reviewStatus === 'unreviewed').length,
  }
}

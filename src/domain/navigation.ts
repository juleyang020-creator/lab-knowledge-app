import { IdentifierSchema } from './content'
import type { Audience } from './content'

export function nextAudiencePath(
  target: Audience,
  context: { name?: string | symbol | null; itemId?: unknown },
): string {
  const itemId = IdentifierSchema.safeParse(context.itemId)
  if (context.name === 'item' && itemId.success) return `/${target}/items/${itemId.data}`
  if (context.name === 'saved') return `/${target}/saved`
  if (context.name === 'manual') return `/${target}/manual`
  if (context.name === 'specimens') return `/${target}/specimens`
  if (context.name === 'topics' || context.name === 'guide')
    return target === 'professional' ? '/professional/topics' : '/patient/guide'
  return `/${target}`
}

import { AudienceSchema, IdentifierSchema } from '../domain/content'
import type { Audience } from '../domain/content'

export const PREFERENCE_KEY = 'lab-knowledge.preferences.v1'
export interface StoragePort {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}
export interface Preferences {
  savedIds: string[]
  audience: Audience | null
}

export function readPreferences(
  storage: StoragePort | null,
  knownIds?: readonly string[],
): Preferences & { persistent: boolean } {
  const empty = { savedIds: [], audience: null, persistent: !!storage }
  if (!storage) return empty
  let raw: string | null
  try {
    raw = storage.getItem(PREFERENCE_KEY)
  } catch {
    return { ...empty, persistent: false }
  }
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (!parsed || typeof parsed !== 'object') return empty
    const value = parsed as Record<string, unknown>
    const candidates = Array.isArray(value.savedIds) ? value.savedIds : []
    const savedIds = [
      ...new Set(
        candidates.filter(
          (id): id is string =>
            typeof id === 'string' &&
            IdentifierSchema.safeParse(id).success &&
            (!knownIds || knownIds.includes(id)),
        ),
      ),
    ].slice(0, 500)
    const audience = AudienceSchema.safeParse(value.audience)
    return { savedIds, audience: audience.success ? audience.data : null, persistent: true }
  } catch {
    return empty
  }
}

export function writePreferences(storage: StoragePort | null, preferences: Preferences): boolean {
  if (!storage) return false
  try {
    storage.setItem(
      PREFERENCE_KEY,
      JSON.stringify({
        version: 1,
        savedIds: preferences.savedIds,
        audience: preferences.audience,
      }),
    )
    return true
  } catch {
    return false
  }
}

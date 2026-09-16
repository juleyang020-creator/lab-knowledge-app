import { AudienceSchema } from '../domain/content'
import type { Audience, AudiencePayload, Catalog } from '../domain/content'
import type { KnowledgeRepository } from '../domain/repository'
import { validateCatalog, validateAudience } from '../domain/validation'

export function createHttpRepository(
  baseUrl: string,
  // Memory promises still deduplicate reads; network reads must see corrected content.
  fetcher: (url: string) => Promise<Response> = (url) => fetch(url, { cache: 'no-store' }),
): KnowledgeRepository {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  let catalogPromise: Promise<Catalog> | undefined
  const audiencePromises = new Map<Audience, Promise<AudiencePayload>>()

  function invalidateContent(): void {
    catalogPromise = undefined
    audiencePromises.clear()
  }

  async function readJSON(name: string): Promise<unknown> {
    const response = await fetcher(`${base}content/${name}.json`)
    if (!response.ok) throw new Error(`资料加载失败（HTTP ${response.status}）`)
    return response.json()
  }
  function getCatalog(): Promise<Catalog> {
    if (!catalogPromise) {
      const promise = readJSON('catalog')
        .then(validateCatalog)
        .catch((error) => {
          if (catalogPromise === promise) catalogPromise = undefined
          throw error
        })
      catalogPromise = promise
    }
    return catalogPromise
  }
  async function getAudience(value: Audience): Promise<AudiencePayload> {
    const audience = AudienceSchema.parse(value)
    let promise = audiencePromises.get(audience)
    if (!promise) {
      promise = (async () => {
        const catalog = await getCatalog()
        return validateAudience(await readJSON(audience), catalog, audience)
      })().catch((error) => {
        if (audiencePromises.get(audience) === promise) audiencePromises.delete(audience)
        throw error
      })
      audiencePromises.set(audience, promise)
    }
    return promise
  }
  return { invalidateContent, getCatalog, getAudience }
}

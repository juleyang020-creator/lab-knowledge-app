import type { Audience, AudiencePayload, Catalog } from './content'

/** Content delivery is replaceable; a future authenticated service implements this boundary. */
export interface KnowledgeRepository {
  /** Forget all content together; reading preferences are outside this boundary. */
  invalidateContent(): void
  getCatalog(): Promise<Catalog>
  getAudience(audience: Audience): Promise<AudiencePayload>
}

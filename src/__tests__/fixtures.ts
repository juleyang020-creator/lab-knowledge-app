import type { Claim, ContentBundle } from '../domain/content'

export const jsonResponse = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

export function modelClaim(id = 'sample.model'): Claim {
  return {
    id,
    text: '明确标记的测试内容，不是医学事实。',
    provenance: { kind: 'model', generatedOn: '2026-09-15' },
    reviewStatus: 'unreviewed',
  }
}
export function documentClaim(id = 'sample.document'): Claim {
  return {
    id,
    text: '来自测试文件的占位说明。',
    provenance: { kind: 'document', sourceId: 'test-book', pdfPage: 2, quote: '仅用于软件测试' },
    reviewStatus: 'unreviewed',
  }
}
export function contentBundle(): ContentBundle {
  return {
    catalog: {
      version: 'test',
      updatedAt: '2026-09-15',
      sources: [
        {
          id: 'test-book',
          title: '软件测试资料',
          edition: '测试版',
          publisher: '测试',
          year: 2026,
          pdfPages: 10,
          kind: 'textbook',
        },
      ],
      items: [
        {
          id: 'sample',
          name: '测试项目',
          abbreviation: 'TEST',
          aliases: ['测试别名'],
          category: '测试分类',
          kind: 'analyte',
          summary: documentClaim(),
          institutional: {
            orderName: null,
            orderCode: null,
            specimen: null,
            turnaround: null,
            location: null,
          },
        },
      ],
    },
    professional: {
      audience: 'professional',
      articles: [
        {
          itemId: 'sample',
          sections: [
            { id: 'context', title: '专业说明', claims: [modelClaim('sample.professional')] },
          ],
        },
      ],
      topics: [],
      guides: [],
    },
  }
}

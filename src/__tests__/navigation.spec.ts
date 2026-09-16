import { describe, expect, it } from 'vitest'
import { nextAudiencePath } from '../domain/navigation'

describe('双入口切换保留阅读上下文', () => {
  it.each([
    ['patient', { name: 'item', itemId: 'glucose' }, '/patient/items/glucose'],
    ['professional', { name: 'item', itemId: 'glucose' }, '/professional/items/glucose'],
    ['patient', { name: 'item', itemId: 'sample.panel-2' }, '/patient/items/sample.panel-2'],
    ['patient', { name: 'topics' }, '/patient/guide'],
    ['professional', { name: 'guide' }, '/professional/topics'],
    ['patient', { name: 'saved' }, '/patient/saved'],
    ['professional', { name: 'saved' }, '/professional/saved'],
    ['professional', { name: 'specimens' }, '/professional/specimens'],
    ['patient', { name: 'specimens' }, '/patient/specimens'],
    ['professional', { name: 'home' }, '/professional'],
    ['patient', { name: 'sources' }, '/patient'],
    ['professional', { name: 'directory' }, '/professional'],
    ['patient', { name: 'item', itemId: '../../secret' }, '/patient'],
    ['patient', { name: 'item' }, '/patient'],
    ['patient', { name: 'not-found', itemId: 'glucose' }, '/patient'],
  ] as const)('%s ← %j', (audience, context, expected) => {
    expect(nextAudiencePath).toBeTypeOf('function')
    expect(nextAudiencePath(audience, context)).toBe(expected)
  })
})

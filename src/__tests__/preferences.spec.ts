import { describe, expect, it } from 'vitest'
import { readPreferences, writePreferences, PREFERENCE_KEY } from '../adapters/preferences'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
}
describe('无需账户的本地阅读偏好', () => {
  it('收藏和阅读入口可以保存后恢复', () => {
    expect(writePreferences).toBeTypeOf('function')
    const storage = memoryStorage()
    expect(writePreferences(storage, { savedIds: ['glucose'], audience: 'patient' })).toBe(true)
    expect(readPreferences(storage)).toEqual({
      savedIds: ['glucose'],
      audience: 'patient',
      persistent: true,
    })
  })
  it('损坏的存储不会让网页打不开', () => {
    const storage = memoryStorage()
    storage.setItem(PREFERENCE_KEY, '{broken')
    expect(readPreferences(storage).savedIds).toEqual([])
  })
  it('清理不存在的项目和重复收藏', () => {
    const storage = memoryStorage()
    storage.setItem(
      PREFERENCE_KEY,
      JSON.stringify({
        savedIds: ['glucose', 'missing', 'glucose', '../bad'],
        audience: 'professional',
      }),
    )
    expect(readPreferences(storage, ['glucose']).savedIds).toEqual(['glucose'])
  })
  it('无法访问存储时明确降级为会话内使用', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(readPreferences(storage).persistent).toBe(false)
    expect(writePreferences(storage, { savedIds: [], audience: null })).toBe(false)
    expect(readPreferences(null).persistent).toBe(false)
  })
  it('不把任意身份值当作有效阅读入口', () => {
    const storage = memoryStorage()
    storage.setItem(PREFERENCE_KEY, JSON.stringify({ savedIds: [], audience: 'administrator' }))
    expect(readPreferences(storage).audience).toBe(null)
  })
})

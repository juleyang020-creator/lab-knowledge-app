import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('锁定依赖对应的 Node 支持范围', () => {
  it('只声明已经验证的 Node 22.x 范围', () => {
    const manifest = JSON.parse(read('package.json')) as { engines: { node: string } }
    expect(manifest.engines.node).toBe('^22.23.1')
  })
  it('README 同步说明最低版本和 22.x 范围', () => {
    const readme = read('README.md')
    expect(readme).toContain('`^22.23.1`')
    expect(readme).toContain('22.x')
    expect(readme).not.toContain('^22.18.0')
    expect(readme).not.toContain('>=24.12.0')
  })
  it('CI 固定使用已验证的最低版本', () => {
    expect(read('.github/workflows/ci.yml')).toMatch(/^\s+node-version: '22\.23\.1'$/m)
  })
})

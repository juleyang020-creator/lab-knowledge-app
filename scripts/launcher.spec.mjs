// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import {
  startLauncher,
  assertNodeVersion,
  ensureDependencies,
  browserCommand,
  packageCommand,
} from './launch.mjs'

const closers = []
afterEach(async () => {
  for (const close of closers.splice(0).reverse()) await close()
})

describe('本地双击入口', () => {
  it.each(['20.19.0', '22.23.0', '24.0.0', '22.23.1-rc.1'])('拒绝未声明支持的 Node %s', (version) =>
    expect(() => assertNodeVersion(version)).toThrow('22.23.1'),
  )
  it.each(['22.23.1', '22.24.0'])('允许支持范围内的 Node %s', (version) =>
    expect(() => assertNodeVersion(version)).not.toThrow(),
  )

  it('缺依赖或锁文件变更才安装固定pnpm版本，不写入全局环境', async () => {
    mkdirSync('.hermes', { recursive: true })
    const root = mkdtempSync('.hermes/launcher 中文 & ! (test)-')
    closers.push(() => rmSync(root, { recursive: true, force: true }))
    writeFileSync(join(root, 'package.json'), JSON.stringify({ packageManager: 'pnpm@11.17.0' }))
    writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfile-test')
    const calls = []
    const runner = async (command, args, options) => {
      calls.push({ command, args, cwd: options.cwd })
      return 'not-the-required-version'
    }
    await ensureDependencies(root, runner)
    expect(calls).toEqual([
      { command: 'pnpm', args: ['--version'], cwd: root },
      {
        command: 'npm',
        args: [
          'exec',
          '--yes',
          '--package=pnpm@11.17.0',
          '--',
          'pnpm',
          'install',
          '--frozen-lockfile',
          '--prod=false',
        ],
        cwd: root,
      },
    ])
    mkdirSync(join(root, 'node_modules/vite'), { recursive: true })
    mkdirSync(join(root, 'node_modules/.pnpm'), { recursive: true })
    writeFileSync(join(root, 'node_modules/vite/package.json'), '{}')
    writeFileSync(join(root, 'node_modules/.pnpm/lock.yaml'), 'lockfile-test')
    calls.length = 0
    await ensureDependencies(root, runner)
    expect(calls).toEqual([])
    writeFileSync(join(root, 'pnpm-lock.yaml'), 'new-lock')
    await ensureDependencies(root, runner)
    expect(calls).toHaveLength(2)
  })

  it('依赖安装失败释放端口，不能报告应用已就绪', async () => {
    const available = await startLauncher({ port: 0, open: false })
    const port = Number(new URL(available.url).port)
    await available.close()
    await expect(
      startLauncher({
        port,
        open: false,
        prepare: async () => {
          throw new Error('安装失败')
        },
      }),
    ).rejects.toThrow('安装失败')
    await expect(fetch(available.url)).rejects.toThrow()
  })

  it('macOS与Windows浏览器命令传参数，不把项目路径拼接进shell', () => {
    const url = 'http://127.0.0.1:4317/'
    expect(browserCommand(url, 'darwin')).toEqual(['/usr/bin/open', [url]])
    expect(browserCommand(url, 'win32')).toEqual([
      'rundll32.exe',
      ['url.dll,FileProtocolHandler', url],
    ])
    expect(packageCommand('pnpm', ['install', '--frozen-lockfile'], 'win32')).toEqual([
      'cmd.exe',
      ['/d', '/s', '/c', 'pnpm install --frozen-lockfile'],
    ])
    expect(() => packageCommand('pnpm', ['x&whoami'], 'win32')).toThrow()
  })

  it('重复启动复用同一项目，关闭重复入口不会停止主服务', async () => {
    const app = await startLauncher({ port: 0, open: false })
    closers.push(app.close)
    const duplicate = await startLauncher({ port: Number(new URL(app.url).port), open: false })
    expect(duplicate.reused).toBe(true)
    expect(duplicate.url).toBe(app.url)
    await duplicate.close()
    expect((await fetch(app.url)).status).toBe(200)
  })

  it('启动尚未就绪时返回503，第二个入口等待并且不会重复安装', async () => {
    const available = await startLauncher({ port: 0 })
    const port = Number(new URL(available.url).port)
    await available.close()
    const gate = Promise.withResolvers()
    const preparing = Promise.withResolvers()
    let preparations = 0
    const pending = startLauncher({
      port,
      prepare: async () => {
        preparations += 1
        preparing.resolve()
        await gate.promise
      },
    })
    closers.push(async () => {
      gate.resolve()
      await (await pending).close()
    })
    await preparing.promise
    expect((await fetch(available.url)).status).toBe(503)
    const duplicate = startLauncher({ port })
    gate.resolve()
    const app = await pending
    expect((await duplicate).reused).toBe(true)
    expect(preparations).toBe(1)
    expect((await fetch(app.url)).status).toBe(200)
  })

  it.each(['html', 'other-project', 'redirect', 'large-response', 'null'])(
    '端口上的 %s 不能被当作本项目，也不能被停止',
    async (kind) => {
      const server = createServer((_request, response) => {
        response.writeHead(kind === 'redirect' ? 302 : 200, {
          'Content-Type': kind === 'html' ? 'text/html' : 'application/json',
          Location: 'https://example.invalid/',
        })
        response.end(
          kind === 'html'
            ? '<html>other app</html>'
            : kind === 'large-response'
              ? 'x'.repeat(5000)
              : JSON.stringify(
                  kind === 'null'
                    ? null
                    : {
                        protocol: 'lab-knowledge-launcher-v1',
                        projectId: 'other',
                        state: 'ready',
                      },
                ),
        )
      })
      await new Promise((done) => server.listen(0, '127.0.0.1', done))
      closers.push(() => new Promise((done) => server.close(done)))
      const port = server.address().port
      await expect(startLauncher({ port, open: false })).rejects.toThrow('端口')
      expect(server.listening).toBe(true)
    },
  )

  it('提供真实应用和资料，只绑定loopback，并在关闭时释放端口', async () => {
    const app = await startLauncher({ port: 0, open: false })
    closers.push(app.close)
    const page = await fetch(app.url)
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('/src/main.ts')
    const catalog = await fetch(`${app.url}content/catalog.json`).then((response) =>
      response.json(),
    )
    expect(catalog.items.length).toBeGreaterThan(0)
    expect(app.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/)
    await app.close()
    await expect(fetch(app.url)).rejects.toThrow()
  }, 30000)
})

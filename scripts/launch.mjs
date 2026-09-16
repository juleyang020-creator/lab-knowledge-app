import { createServer, get } from 'node:http'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const protocol = 'lab-knowledge-launcher-v1'
const statusPath = '__lab_launcher_status'
const execFileAsync = promisify(execFile)

export function assertNodeVersion(version = process.versions.node) {
  const [major, minor, patch] = version.split('.').map(Number)
  if (
    !/^\d+\.\d+\.\d+$/.test(version) ||
    major !== 22 ||
    minor < 23 ||
    (minor === 23 && patch < 1)
  ) {
    throw new Error(
      `请安装 Node.js 22.x（不低于22.23.1）；当前版本 ${version}。下载：https://nodejs.org/download/release/latest-v22.x/`,
    )
  }
}

export function packageCommand(command, args, platform = process.platform) {
  // Only package-manager commands and shell-safe, non-path arguments reach cmd.exe.
  if (!['npm', 'pnpm'].includes(command) || args.some((arg) => !/^[\w@./=:-]+$/.test(arg))) {
    throw new Error('不安全的依赖安装参数')
  }
  return platform === 'win32'
    ? ['cmd.exe', ['/d', '/s', '/c', [command, ...args].join(' ')]]
    : [command, args]
}

async function runPackageCommand(command, args, { cwd, capture = false, signal } = {}) {
  signal?.throwIfAborted()
  const [file, parameters] = packageCommand(command, args)
  if (capture) {
    const result = await execFileAsync(file, parameters, { cwd, signal, timeout: 10000 })
    return result.stdout.trim()
  }
  await new Promise((done, reject) => {
    const child = spawn(file, parameters, {
      cwd,
      stdio: 'inherit',
      shell: false,
      detached: process.platform !== 'win32',
    })
    const stop = () => {
      if (!child.pid) return
      if (process.platform === 'win32') {
        const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
          stdio: 'ignore',
        })
        killer.on('error', () => child.kill())
      } else {
        try {
          process.kill(-child.pid, 'SIGTERM')
        } catch {
          child.kill()
        }
      }
    }
    signal?.addEventListener('abort', stop, { once: true })
    const cleanup = () => signal?.removeEventListener('abort', stop)
    child.on('error', (error) => {
      cleanup()
      reject(error)
    })
    child.on('exit', (code) => {
      cleanup()
      if (code === 0 && !signal?.aborted) done()
      else
        reject(
          new Error('依赖安装失败或已取消。请检查网络和上方提示后重新双击；不会修改锁定版本。'),
        )
    })
  })
}

export async function ensureDependencies(root, runner = runPackageCommand, signal) {
  const lock = readFileSync(join(root, 'pnpm-lock.yaml'))
  const installedLock = join(root, 'node_modules/.pnpm/lock.yaml')
  if (
    existsSync(join(root, 'node_modules/vite/package.json')) &&
    existsSync(installedLock) &&
    readFileSync(installedLock).equals(lock)
  )
    return
  const { packageManager } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  if (!/^pnpm@\d+\.\d+\.\d+$/.test(packageManager)) throw new Error('项目缺少明确的pnpm版本')
  console.log('首次运行或依赖有变化，正在安装本项目依赖，需要联网。请勿关闭窗口…')
  let installed = ''
  try {
    installed = await runner('pnpm', ['--version'], { cwd: root, capture: true, signal })
  } catch {
    /* Fall back to npm bundled with Node. */
  }
  signal?.throwIfAborted()
  const args = ['install', '--frozen-lockfile', '--prod=false']
  if (installed === packageManager.slice(5)) await runner('pnpm', args, { cwd: root, signal })
  else
    await runner('npm', ['exec', '--yes', `--package=${packageManager}`, '--', 'pnpm', ...args], {
      cwd: root,
      signal,
    })
}

export function browserCommand(url, platform = process.platform) {
  if (!/^http:\/\/127\.0\.0\.1:\d+\/$/.test(url)) throw new Error('只允许打开本地应用地址')
  if (platform === 'darwin') return ['/usr/bin/open', [url]]
  if (platform === 'win32') return ['rundll32.exe', ['url.dll,FileProtocolHandler', url]]
  return ['xdg-open', [url]]
}

async function openPage(url) {
  const [file, args] = browserCommand(url)
  try {
    await execFileAsync(file, args, { timeout: 10000 })
  } catch {
    console.warn(`无法自动打开浏览器，请手动访问：${url}`)
  }
}

function readStatus(url) {
  return new Promise((done, reject) => {
    const request = get(`${url}${statusPath}`, { agent: false }, (response) => {
      if (
        response.statusCode !== 200 ||
        !response.headers['content-type']?.includes('application/json')
      ) {
        response.resume()
        reject(new Error('无法识别端口上的服务'))
        return
      }
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        body += chunk
        if (body.length > 4096) request.destroy(new Error('服务身份响应过大'))
      })
      response.on('error', reject)
      response.on('end', () => {
        try {
          done(JSON.parse(body))
        } catch (error) {
          reject(error)
        }
      })
    })
    const timer = setTimeout(() => request.destroy(new Error('服务身份检查超时')), 1500)
    request.on('close', () => clearTimeout(timer))
    request.on('error', reject)
  })
}

async function waitForExisting(url, projectId, waitTimeout) {
  const deadline = Date.now() + waitTimeout
  do {
    let status
    try {
      status = await readStatus(url)
    } catch {
      throw new Error('端口已被占用，且不是可识别的本项目服务。请关闭占用程序后重试。')
    }
    if (!status || status.protocol !== protocol || status.projectId !== projectId) {
      throw new Error('端口已被其他程序或另一个项目副本占用；不会停止该程序。')
    }
    if (status.state === 'ready') return
    if (status.state !== 'starting') throw new Error('已有入口启动失败，请查看原启动窗口。')
    await delay(200)
  } while (Date.now() < deadline)
  throw new Error('等待已有入口启动超时，请查看原启动窗口。')
}

export async function startLauncher({
  root = projectRoot,
  port = 4317,
  waitTimeout = 180000,
  open = false,
  prepare = ensureDependencies,
  signal,
} = {}) {
  assertNodeVersion()
  signal?.throwIfAborted()
  const projectId = createHash('sha256').update(realpathSync(root)).digest('hex')
  let vite
  const server = createServer((request, response) => {
    if (request.url === `/${statusPath}`) {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      response.end(JSON.stringify({ protocol, projectId, state: vite ? 'ready' : 'starting' }))
    } else if (vite) vite.middlewares(request, response)
    else {
      response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('正在启动，请稍候。')
    }
  })
  let closed = false
  async function close() {
    if (closed) return
    closed = true
    await vite?.close()
    server.closeAllConnections()
    await new Promise((done) => server.close(done))
  }
  try {
    try {
      await new Promise((done, reject) => {
        server.once('error', reject)
        server.listen(port, '127.0.0.1', done)
      })
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error
      const url = `http://127.0.0.1:${port}/`
      await waitForExisting(url, projectId, waitTimeout)
      if (open) await openPage(url)
      return { url, reused: true, close: async () => {} }
    }
    const url = `http://127.0.0.1:${server.address().port}/`
    await prepare(root, undefined, signal)
    signal?.throwIfAborted()
    const { createServer: createViteServer } = await import('vite')
    vite = await createViteServer({
      root,
      server: { middlewareMode: true, ws: { server } },
      appType: 'spa',
    })
    signal?.throwIfAborted()
    await waitForExisting(url, projectId, waitTimeout)
    if (open) await openPage(url)
    return { url, reused: false, close }
  } catch (error) {
    await close()
    throw error
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = new AbortController()
  let app
  const stop = async () => {
    controller.abort()
    const deadline = setTimeout(() => process.exit(0), 5000)
    deadline.unref()
    await app?.close()
  }
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(signal, () => void stop())
  try {
    app = await startLauncher({
      open: !process.argv.includes('--no-open'),
      signal: controller.signal,
    })
    if (controller.signal.aborted) await app.close()
    else {
      console.log(`${app.reused ? '已在运行，打开已有页面' : '检验知识库已启动'}：${app.url}`)
      if (!app.reused)
        console.log('请保留本窗口。退出软件：在这里按 Ctrl+C，或关闭这个最初的启动窗口。')
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      console.error(`启动失败：${error.message}`)
      console.error('请参阅项目文件夹中的“打开软件说明.md”；不要直接打开 index.html。')
      process.exitCode = 1
    }
  }
}

import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import offlineSkillsScript from '../../offline-skills.js'
import pageHtml from '../../index.html'
import {
  bindWithFallback,
  resolveDataDirectoryCandidates,
  resolveSkillRoots,
  resolveWritableDirectory,
} from '../../src/backend/exeRuntime.js'
import { DEFAULT_PORT, STUDIO_ID, createStudioServer } from '../../src/backend/studioServer.js'

const exePath = process.execPath
const appRoot = path.dirname(exePath)

function openBrowser(url) {
  if (process.env.SKILL_STUDIO_NO_OPEN === '1') return

  const commands = {
    win32: ['cmd.exe', ['/c', 'start', '', url]],
    darwin: ['open', [url]],
  }
  const [command, args] = commands[process.platform] || ['xdg-open', [url]]

  try {
    spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref()
  } catch {
    // 打不开浏览器时窗口里仍然打印了地址，可以手动访问。
  }
}

async function readRunningStudio(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/studio-info`, { signal: AbortSignal.timeout(1500) })
    if (!response.ok) return null
    const payload = await response.json()
    return payload?.app === STUDIO_ID ? payload : null
  } catch {
    return null
  }
}

async function resolveDataDirectory() {
  const candidates = resolveDataDirectoryCandidates({
    exePath,
    env: process.env,
    homedir: os.homedir(),
    appData: process.env.APPDATA,
  })

  try {
    return await resolveWritableDirectory(candidates)
  } catch {
    const fallback = path.join(os.tmpdir(), 'SkillStudio', 'data')
    await fs.mkdir(fallback, { recursive: true })
    return fallback
  }
}

function printBanner(url, dataDirectory) {
  console.log([
    '',
    '  Skill Studio 已启动',
    `  管理界面：${url}`,
    `  数据文件：${path.join(dataDirectory, 'state.json')}`,
    '',
    '  浏览器会自动打开；关闭这个窗口即可停止服务。',
    '',
  ].join('\n'))
}

async function waitForEnter() {
  if (!process.stdin.isTTY) return
  console.error('按回车键关闭窗口…')
  await new Promise((resolve) => {
    process.stdin.resume()
    process.stdin.once('data', resolve)
    process.stdin.once('error', resolve)
  })
}

async function main() {
  const preferredPort = Number(process.env.SKILL_STUDIO_PORT || DEFAULT_PORT)

  const running = await readRunningStudio(preferredPort)
  if (running) {
    const url = `http://127.0.0.1:${preferredPort}/`
    openBrowser(url)
    console.log(`\n  Skill Studio 已经在运行，直接复用：${url}\n  数据文件：${running.stateFile}\n`)
    return
  }

  const dataDirectory = await resolveDataDirectory()
  const skillRoots = resolveSkillRoots({
    homedir: os.homedir(),
    additionalRoots: [path.join(appRoot, '.agents', 'skills')],
  })
  const targetDirectory = process.env.CODEX_SKILL_TARGET || path.join(os.homedir(), '.agents', 'skills')

  const { server, port } = await bindWithFallback(
    () => createStudioServer({
      dataDirectory,
      skillRoots,
      targetDirectory,
      assets: { html: pageHtml, offlineSkillsScript },
    }),
    { host: '127.0.0.1', preferredPort },
  )

  server.on('error', (error) => console.error(`  服务异常：${error.message}`))

  const url = `http://127.0.0.1:${port}/`
  printBanner(url, dataDirectory)
  openBrowser(url)
}

main().catch(async (error) => {
  console.error(`\n  Skill Studio 启动失败：${error.message}\n`)
  process.exitCode = 1
  await waitForEnter()
})

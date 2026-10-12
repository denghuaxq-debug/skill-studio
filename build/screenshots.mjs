#!/usr/bin/env node
/**
 * 重新生成 docs/images/ 里的界面截图。
 *
 * 用一个只含示例数据的本地服务跑真实界面，再通过 DevTools 协议截屏，
 * 所以截图里的角色、Skill 和路径都是假的，不会暴露本机的真实环境。
 *
 *   npm run screenshots
 *
 * 需要本机有 Chromium 内核的浏览器，按下面的顺序查找：
 *   1. CHROME_PATH 环境变量
 *   2. Playwright 缓存的 Chromium（~/.cache/ms-playwright）
 *   3. 系统安装的 Chrome / Edge
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createStudioServer } from '../src/backend/studioServer.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const imagesDirectory = path.join(repo, 'docs', 'images')
const stage = path.join(os.tmpdir(), 'skill-studio-screenshots')
const skillsRoot = path.join(stage, 'skills')
const dataDirectory = path.join(stage, 'data')
const targetDirectory = path.join(stage, 'synced')

const WIDTH = 1440
const HEIGHT = 900

// 截图里不该出现本机的临时目录，统一显示成家目录形式。
const realRootInJson = skillsRoot.replace(/\\/g, '\\\\')
const fakeRootInJson = String.raw`C:\\Users\\you\\.agents\\skills`

const demoSkills = {
  'api-design': ['API 设计规范', '设计一致的 REST 接口：资源命名、状态码、分页、过滤与错误结构。'],
  'tdd-workflow': ['测试驱动开发', '先写会失败的测试，再实现，最后重构并保持覆盖率。'],
  'security-review': ['安全审查', '检查输入校验、密钥管理、注入防护、鉴权与限流。'],
}

const demoAliases = {
  'api-design': 'API 接口设计',
  'tdd-workflow': '测试驱动开发',
  'security-review': '安全审查',
}

const shots = [
  { name: 'overview', action: '' },
  { name: 'new-role', action: "click('#newRole')" },
  { name: 'skill-picker', action: "click('#addSkillBtn')" },
  { name: 'inspector', action: 'selectSkillAt(1)' },
  { name: 'knowledge', action: "click('#knowledgeBtn')" },
  { name: 'export-preview', action: "click('#exportPreviewBtn')" },
  { name: 'delete-role', action: "clickAt('.role-remove', 1)" },
]

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const exists = (target) => fs.access(target).then(() => true, () => false)

const runner = (action) => `<script>
window.addEventListener('load', () => setTimeout(() => {
  const click = (selector) => { const node = document.querySelector(selector); if (node) node.click(); };
  const clickAt = (selector, index) => { const node = document.querySelectorAll(selector)[index]; if (node) node.click(); };
  const selectSkillAt = (index) => {
    const node = document.querySelectorAll('.skill-node')[index];
    // 停在「概览」页签，好让截图里能看到别名和启用模式这些配置项。
    if (node) window.skillStudio.selectSkill(node.dataset.skill);
  };
  ${action}
}, 1200));
</script>`

async function findChrome() {
  const candidates = []
  if (process.env.CHROME_PATH) candidates.push(process.env.CHROME_PATH)

  const playwrightRoot = process.platform === 'win32'
    ? path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright')
    : path.join(os.homedir(), '.cache', 'ms-playwright')
  const entries = await fs.readdir(playwrightRoot, { withFileTypes: true }).catch(() => [])
  // 多个版本共存时用最新的，旧构建的 DevTools 接口不一定可靠。
  const chromiumDirectories = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('chromium'))
    .map((entry) => entry.name)
    .sort()
    .reverse()
  for (const name of chromiumDirectories) {
    candidates.push(
      path.join(playwrightRoot, name, 'chrome-win64', 'chrome.exe'),
      path.join(playwrightRoot, name, 'chrome-win', 'chrome.exe'),
      path.join(playwrightRoot, name, 'chrome-linux', 'chrome'),
    )
  }

  candidates.push(
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  )

  for (const candidate of candidates) {
    if (candidate && await exists(candidate)) return candidate
  }
  throw new Error('找不到 Chromium 内核的浏览器，可以用 CHROME_PATH 指定可执行文件')
}

async function seedSkills() {
  for (const [name, [title, description]] of Object.entries(demoSkills)) {
    const directory = path.join(skillsRoot, name)
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(path.join(directory, 'SKILL.md'), `---
name: ${name}
description: ${description}
---

# ${title}

## 何时使用

- 任务涉及${title}相关内容时
- 需要在动手前先对齐约定时

## 关键约定

- 先确认输入来源，再动手改动
- 输出结论时说明依据和验证方式
`, 'utf8')
  }
}

async function seedState(scanSkillRoots) {
  const scanned = await scanSkillRoots([skillsRoot])
  const byName = new Map(scanned.map((skill) => [skill.name, skill.id]))
  const skillAliases = {}
  for (const [name, alias] of Object.entries(demoAliases)) {
    const id = byName.get(name)
    if (id) skillAliases[id] = alias
  }

  const state = {
    roles: {
      'example-backend': {
        name: 'Java 后端工程师',
        description: '负责 Spring Boot 接口开发、测试和代码审查',
        avatar: '👨‍💻',
        invoke: '$java-backend',
        synced: true,
        // 故意留一个没被赋予的 Skill，好让「添加 Skill」弹框两种状态都能截到。
        skills: [
          { id: byName.get('api-design'), mode: 'core' },
          { id: byName.get('tdd-workflow'), mode: 'on_demand' },
        ],
        defaultConstraints: ['接口变更先补测试，再实现功能', '所有外部输入必须校验，禁止硬编码密钥'],
      },
      'example-research': {
        name: '市场研究员',
        description: '收集信息、分析竞品并输出决策材料',
        avatar: '🔎',
        invoke: '$market-researcher',
        synced: false,
        skills: [{ id: byName.get('security-review'), mode: 'on_demand' }],
        defaultConstraints: ['结论必须标注来源和日期'],
      },
    },
    syncHistory: [],
    skillAliases,
  }

  await fs.mkdir(dataDirectory, { recursive: true })
  await fs.writeFile(path.join(dataDirectory, 'state.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

class Session {
  constructor(socket) {
    this.socket = socket
    this.nextId = 1
    this.pending = new Map()
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (!message.id || !this.pending.has(message.id)) return
      const { resolve, reject } = this.pending.get(message.id)
      this.pending.delete(message.id)
      if (message.error) reject(new Error(message.error.message))
      else resolve(message.result)
    })
  }

  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }
}

async function waitForDevtoolsPort(userDataDirectory) {
  const portFile = path.join(userDataDirectory, 'DevToolsActivePort')
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const content = await fs.readFile(portFile, 'utf8').catch(() => null)
    if (content) return Number(content.split('\n')[0])
    await wait(150)
  }
  throw new Error('浏览器没有在预期时间内就绪')
}

async function capture(devtoolsPort, url, file) {
  const target = await fetch(
    `http://127.0.0.1:${devtoolsPort}/json/new?${encodeURIComponent('about:blank')}`,
    { method: 'PUT', signal: AbortSignal.timeout(15000) },
  ).then((response) => response.json())

  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })

  const session = new Session(socket)
  await session.send('Page.enable')
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false,
  })
  await session.send('Page.navigate', { url })
  await wait(1200)

  // 等角色和 Skill 都渲染出来再截，否则会拍到空的容器。
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const { result } = await session.send('Runtime.evaluate', {
      expression: "document.querySelectorAll('.skill-node').length",
      returnByValue: true,
    })
    if (result.value > 0) break
    await wait(200)
  }

  await wait(400)
  const { data } = await session.send('Page.captureScreenshot', { format: 'png' })
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, Buffer.from(data, 'base64'))
  socket.close()
  await fetch(`http://127.0.0.1:${devtoolsPort}/json/close/${target.id}`, { signal: AbortSignal.timeout(5000) }).catch(() => {})
}

async function main() {
  const chrome = await findChrome()
  const { scanSkillRoots } = await import('../src/backend/skillScanner.js')

  await fs.rm(stage, { recursive: true, force: true })
  await seedSkills()
  await seedState(scanSkillRoots)

  const page = await fs.readFile(path.join(repo, 'index.html'), 'utf8')
  const offlineSkillsScript = await fs.readFile(path.join(repo, 'offline-skills.js'), 'utf8')

  const server = createStudioServer({
    dataDirectory,
    skillRoots: [skillsRoot],
    targetDirectory,
    assets: { html: page, offlineSkillsScript },
  })

  // 包一层请求处理：?shot= 时注入操作脚本，API 响应里替换掉本机路径。
  const original = server.listeners('request')[0]
  server.removeAllListeners('request')
  server.on('request', (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1')

    if (url.pathname.startsWith('/api/')) {
      const originalEnd = response.end.bind(response)
      response.end = (body, ...rest) => {
        if (typeof body === 'string' && body.includes(realRootInJson)) {
          return originalEnd(body.split(realRootInJson).join(fakeRootInJson), ...rest)
        }
        return originalEnd(body, ...rest)
      }
      original(request, response)
      return
    }

    const shot = shots.find((item) => item.name === url.searchParams.get('shot'))
    if (!shot) {
      original(request, response)
      return
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    response.end(page.replace(/<\/body>/, `${runner(shot.action)}</body>`))
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  const userDataDirectory = path.join(stage, 'profile')
  const browser = spawn(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--disable-extensions',
    '--hide-scrollbars',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDirectory}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    'about:blank',
  ], { stdio: 'ignore' })

  try {
    const devtoolsPort = await waitForDevtoolsPort(userDataDirectory)
    for (const shot of shots) {
      await capture(devtoolsPort, `http://127.0.0.1:${port}/?shot=${shot.name}`, path.join(imagesDirectory, `${shot.name}.png`))
      console.log(`已截图：docs/images/${shot.name}.png`)
    }
  } finally {
    browser.kill('SIGKILL')
    // 浏览器留下的 keep-alive 连接会让进程一直不退出，主动断开。
    server.closeAllConnections?.()
    server.close()
    await fs.rm(stage, { recursive: true, force: true })
  }

  console.log(`完成，共 ${shots.length} 张，输出到 docs/images/`)
  // 兜底：个别平台上的残留句柄不该让这个脚本挂住。
  process.exit(0)
}

main().catch((error) => {
  console.error(`截图失败：${error.message}`)
  process.exit(1)
})

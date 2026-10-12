import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as Resedit from 'resedit'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectDirectory = path.resolve(here, '..', '..')
const outputDirectory = process.env.SKILL_STUDIO_OUTPUT || path.resolve(projectDirectory, 'SkillStudio')
const shellName = process.env.SKILL_STUDIO_SHELL_NAME || 'SkillStudio.exe'
const cargoTargetDirectory = path.join(here, 'target')
const shellBinary = path.join(cargoTargetDirectory, 'release', 'skill-studio-desktop.exe')
const assetsDirectory = path.join(here, 'assets')
const iconSizes = [16, 24, 32, 48, 64, 128, 200]

const log = (message) => console.log(`[app] ${message}`)

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false, ...options })
  if (result.error) throw new Error(`无法执行 ${command}：${result.error.message}`)
  if (result.status !== 0) throw new Error(`命令失败（退出码 ${result.status}）：${command} ${args.join(' ')}`)
}

async function buildService() {
  log('第一步：打包本地服务 exe')
  run(process.execPath, [path.join(projectDirectory, 'build', 'exe', 'build.mjs')], {
    env: { ...process.env, SKILL_STUDIO_OUTPUT: outputDirectory },
  })
}

async function buildShell() {
  log('第二步：编译 Rust 桌面外壳')
  run('cargo', ['build', '--release'], { cwd: here })
}

async function copyShell() {
  await fs.mkdir(outputDirectory, { recursive: true })
  const destination = path.join(outputDirectory, shellName)
  await fs.copyFile(shellBinary, destination)
  const stat = await fs.stat(destination)
  log(`外壳已就位：${destination}（${(stat.size / 1024).toFixed(0)} KB）`)
  return destination
}

/// 用各尺寸 PNG 拼一个 ICO 容器（ICO 允许直接内嵌 PNG 数据）。
function buildIcoBuffer(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)

  const directory = Buffer.alloc(16 * entries.length)
  let offset = header.length + directory.length

  entries.forEach((entry, index) => {
    const base = index * 16
    const dimension = entry.size >= 256 ? 0 : entry.size
    directory.writeUInt8(dimension, base)
    directory.writeUInt8(dimension, base + 1)
    directory.writeUInt8(0, base + 2)
    directory.writeUInt8(0, base + 3)
    directory.writeUInt16LE(1, base + 4)
    directory.writeUInt16LE(32, base + 6)
    directory.writeUInt32LE(entry.data.length, base + 8)
    directory.writeUInt32LE(offset, base + 12)
    offset += entry.data.length
  })

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.data)])
}

/// 把 logo 写进 exe 资源，资源管理器里显示的文件图标就是它。
async function applyExeIcon(targetFile) {
  const entries = []
  for (const size of iconSizes) {
    entries.push({ size, data: await fs.readFile(path.join(assetsDirectory, `icon-${size}.png`)) })
  }

  const executable = Resedit.NtExecutable.from(await fs.readFile(targetFile), { ignoreCert: true })
  const resources = Resedit.NtExecutableResource.from(executable)
  const iconFile = Resedit.Data.IconFile.from(buildIcoBuffer(entries))

  Resedit.Resource.IconGroupEntry.replaceIconsForResource(
    resources.entries,
    1,
    1033,
    iconFile.icons.map((item) => item.data),
  )

  resources.outputResource(executable)
  await fs.writeFile(targetFile, Buffer.from(executable.generate()))
  log(`已写入应用图标：${iconSizes.join('/')} px`)
}

async function writeReadme() {
  const readme = [
    'Skill Studio 使用说明',
    '====================',
    '',
    `1. 双击「${shellName}」启动，会直接打开应用自己的窗口，不再跳浏览器。`,
    '2. 角色、别名、同步记录都保存在本目录的 data\\state.json 中，重启电脑不会丢失。',
    '3. 关闭窗口即可退出应用，后台服务会一起结束。',
    '4. service 子目录是本地服务程序，请和主程序放在一起，不要单独删除。',
    '5. 需要换端口时，先设置环境变量 SKILL_STUDIO_PORT 再启动。',
    '',
  ].join('\r\n')
  await fs.writeFile(path.join(outputDirectory, '使用说明.txt'), readme, 'utf8')
}

async function main() {
  log(`输出目录：${outputDirectory}`)
  await buildService()
  await buildShell()
  const shellFile = await copyShell()
  await applyExeIcon(shellFile)
  await writeReadme()
  log('打包完成，双击应用窗口程序即可使用')
}

main().catch((error) => {
  console.error(`[app] 失败：${error.message}`)
  process.exitCode = 1
})

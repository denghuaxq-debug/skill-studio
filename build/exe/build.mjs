import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectDirectory = path.resolve(here, '..', '..')
const workDirectory = path.join(projectDirectory, 'build', '.work')
const outputDirectory = process.env.SKILL_STUDIO_OUTPUT || path.resolve(projectDirectory, 'SkillStudio')
const exeName = process.env.SKILL_STUDIO_EXE_NAME || 'SkillStudio.exe'
const bundleFile = path.join(workDirectory, 'launcher.cjs')
const seaConfigFile = path.join(workDirectory, 'sea-config.json')
const seaBlobFile = path.join(workDirectory, 'skill-studio.blob')
const seaFuse = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'

const log = (message) => console.log(`[build] ${message}`)

// offline-skills.js 是给网页用的脚本，这里要当成文本内嵌进 exe。
const inlineOfflineSkills = {
  name: 'inline-offline-skills',
  setup(pluginBuild) {
    pluginBuild.onLoad({ filter: /offline-skills\.js$/ }, async (args) => ({
      contents: await fs.readFile(args.path, 'utf8'),
      loader: 'text',
    }))
  },
}

function runNode(args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`命令执行失败：node ${args.join(' ')}`)
}

async function bundleLauncher() {
  await fs.mkdir(workDirectory, { recursive: true })
  await build({
    entryPoints: [path.join(here, 'launcher.js')],
    outfile: bundleFile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    legalComments: 'none',
    loader: { '.html': 'text' },
    plugins: [inlineOfflineSkills],
    logLevel: 'warning',
  })
  log(`已打包服务端脚本（含内嵌页面）：${path.relative(projectDirectory, bundleFile)}`)
}

async function writeSeaConfig() {
  await fs.writeFile(seaConfigFile, `${JSON.stringify({
    main: bundleFile,
    output: seaBlobFile,
    disableExperimentalSEAWarning: true,
  }, null, 2)}\n`, 'utf8')
}

async function createSeaBlob() {
  runNode(['--experimental-sea-config', seaConfigFile])
  const stat = await fs.stat(seaBlobFile)
  log(`已生成 SEA 数据块：${(stat.size / 1024).toFixed(1)} KB`)
}

async function resolvePostjectEntry() {
  const manifest = JSON.parse(
    await fs.readFile(path.join(projectDirectory, 'node_modules', 'postject', 'package.json'), 'utf8'),
  )
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.postject
  if (!bin) throw new Error('postject 缺少可执行入口，请重新执行 npm install')
  return path.join(projectDirectory, 'node_modules', 'postject', bin)
}

async function injectBlob(targetFile) {
  runNode([
    await resolvePostjectEntry(),
    targetFile,
    'NODE_SEA_BLOB',
    seaBlobFile,
    '--sentinel-fuse',
    seaFuse,
  ])
  log('已把 Skill Studio 注入 Node 运行时')
}

async function seedState() {
  const destination = path.join(outputDirectory, 'data', 'state.json')
  try {
    await fs.access(destination)
    log('检测到已有数据文件，保留现有数据')
    return
  } catch { /* 首次打包需要初始化数据文件 */ }

  try {
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.copyFile(path.join(projectDirectory, 'data', 'state.example.json'), destination)
    log('已把当前角色数据复制到 exe 目录')
  } catch {
    log('没有可复制的初始数据，exe 首次运行会新建数据文件')
  }
}

async function main() {
  // 服务放在 service 子目录，桌面外壳按固定相对路径找它。
  const serviceDirectory = path.join(outputDirectory, 'service')
  const targetFile = path.join(serviceDirectory, exeName)
  log(`服务输出目录：${serviceDirectory}`)

  await bundleLauncher()
  await writeSeaConfig()
  await createSeaBlob()

  await fs.mkdir(serviceDirectory, { recursive: true })
  await fs.copyFile(process.execPath, targetFile)
  await injectBlob(targetFile)
  await seedState()

  const stat = await fs.stat(targetFile)
  log(`服务打包完成：${targetFile}（${(stat.size / 1024 / 1024).toFixed(1)} MB）`)
}

main().catch((error) => {
  console.error(`[build] 失败：${error.message}`)
  process.exitCode = 1
})

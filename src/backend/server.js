import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveSkillRoots } from './exeRuntime.js'
import { DEFAULT_PORT, createStudioServer } from './studioServer.js'

const appDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const projectDirectory = path.resolve(appDirectory, '..')
const dataDirectory = process.env.SKILL_STUDIO_DATA_DIR || path.join(appDirectory, 'data')
const targetDirectory = process.env.CODEX_SKILL_TARGET || path.join(os.homedir(), '.agents', 'skills')
const port = Number(process.env.SKILL_STUDIO_PORT || DEFAULT_PORT)
const htmlFile = path.join(appDirectory, 'index.html')
const offlineSkillsFile = path.join(appDirectory, 'offline-skills.js')

const skillRoots = resolveSkillRoots({
  homedir: os.homedir(),
  additionalRoots: [path.join(projectDirectory, '.agents', 'skills')],
})

const server = createStudioServer({
  dataDirectory,
  skillRoots,
  targetDirectory,
  // 开发模式按请求读取文件，改完页面直接刷新即可生效。
  assets: {
    html: () => fs.readFile(htmlFile, 'utf8'),
    offlineSkillsScript: () => fs.readFile(offlineSkillsFile, 'utf8'),
  },
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Skill Studio running at http://127.0.0.1:${port}/`)
  console.log(`数据文件：${path.join(dataDirectory, 'state.json')}`)
})

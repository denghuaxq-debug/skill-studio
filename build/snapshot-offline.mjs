#!/usr/bin/env node
/**
 * 扫描本机 Skill 目录，生成 offline-skills.js。
 *
 * 用法：
 *   npm run snapshot               扫描默认根目录（~/.agents/skills、~/.codex/skills）
 *   npm run snapshot -- <dir> ...  扫描指定目录，便于生成示例快照
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveSkillRoots } from '../src/backend/exeRuntime.js'
import { scanSkillRoots } from '../src/backend/skillScanner.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputFile = path.join(root, 'offline-skills.js')

const explicitRoots = process.argv.slice(2)
const roots = explicitRoots.length
  ? explicitRoots.map((directory) => path.resolve(directory))
  : resolveSkillRoots({ homedir: os.homedir(), additionalRoots: [path.join(root, '.agents', 'skills')] })

const skills = (await scanSkillRoots(roots)).map((skill) => ({
  id: skill.id,
  name: skill.name,
  description: skill.description,
  path: skill.path,
  sourceRoot: skill.sourceRoot,
  modifiedAt: skill.modifiedAt,
  source: 'offline-snapshot',
}))

const banner = [
  '// 由 `npm run snapshot` 生成，请勿手工编辑。',
  '// 仅在直接用浏览器打开 index.html（离线预览）时使用；启动本地服务后界面读取的是实时扫描结果。',
  '',
].join('\n')

await fs.writeFile(outputFile, `${banner}window.SKILL_STUDIO_OFFLINE_SKILLS = ${JSON.stringify(skills, null, 2)}\n`, 'utf8')
console.log(`已写入 ${path.relative(root, outputFile)}（${skills.length} 个 Skill）`)

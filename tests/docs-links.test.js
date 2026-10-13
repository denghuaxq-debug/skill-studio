import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// 这些目录要么是依赖，要么是产物，里面的 Markdown 不参与检查。
const skipped = new Set(['node_modules', '.git', 'SkillStudio', 'target', '.work'])

function collectMarkdown(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (skipped.has(entry.name)) continue
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) collectMarkdown(full, files)
    else if (entry.name.endsWith('.md')) files.push(full)
  }
  return files
}

test('every relative link in the docs points at a file that exists', () => {
  const broken = []
  let checked = 0

  for (const file of collectMarkdown(root)) {
    const markdown = fs.readFileSync(file, 'utf8')
    for (const match of markdown.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const target = match[1]
      if (/^(https?:|mailto:|#)/.test(target)) continue
      const [relative] = target.split('#')
      if (!relative) continue

      checked += 1
      const resolved = path.resolve(path.dirname(file), decodeURIComponent(relative))
      if (!fs.existsSync(resolved)) broken.push(`${path.relative(root, file)} -> ${target}`)
    }
  }

  // 防止正则写挂了导致「一条都没检查」也算通过。
  assert.ok(checked > 20, `应当检查到一批链接，实际只检查到 ${checked} 条`)
  assert.deepEqual(broken, [], `以下链接指向的文件不存在：\n${broken.join('\n')}`)
})

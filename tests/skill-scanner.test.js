import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parseSkillDocument, scanSkillRoots } from '../src/backend/skillScanner.js'

test('parses Skill frontmatter and keeps the markdown body', () => {
  const result = parseSkillDocument(`---\nname: local-review\ndescription: Review local changes\n---\n\n# Review\n\nCheck the diff.`)

  assert.deepEqual(result, {
    name: 'local-review',
    description: 'Review local changes',
    body: '# Review\n\nCheck the diff.',
  })
})

test('rejects a Skill document without required metadata', () => {
  assert.throws(() => parseSkillDocument('# Missing metadata'), /缺少 name 或 description/)
})

test('joins folded multiline descriptions from YAML frontmatter', () => {
  const result = parseSkillDocument(`---\nname: folded\ndescription: >-\n  First sentence.\n  Second sentence.\n---\n\n# Folded`)

  assert.equal(result.description, 'First sentence. Second sentence.')
})

test('scans only directories containing SKILL.md and returns file paths', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-studio-'))
  await fs.mkdir(path.join(root, 'valid'), { recursive: true })
  await fs.mkdir(path.join(root, 'ignored'), { recursive: true })
  await fs.writeFile(path.join(root, 'valid', 'SKILL.md'), '---\nname: valid\ndescription: Valid skill\n---\n\n# Valid')

  const result = await scanSkillRoots([root])

  assert.equal(result.length, 1)
  assert.match(result[0].id, /^valid-/)
  assert.equal(result[0].name, 'valid')
  assert.equal(result[0].path, path.join(root, 'valid', 'SKILL.md'))
})

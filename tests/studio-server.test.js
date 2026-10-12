import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { STUDIO_ID, createStudioServer } from '../src/backend/studioServer.js'

const pageHtml = '<!doctype html><html><body><h1>Skill Studio</h1></body></html>'
const offlineSkillsScript = 'window.SKILL_STUDIO_OFFLINE_SKILLS = [];'

async function startStudio(options = {}) {
  const dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-studio-server-'))
  const server = createStudioServer({
    dataDirectory,
    skillRoots: [],
    targetDirectory: path.join(dataDirectory, 'skills'),
    assets: { html: pageHtml, offlineSkillsScript },
    ...options,
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`

  return {
    origin,
    dataDirectory,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

test('serves the studio page and the offline skill snapshot', async () => {
  const studio = await startStudio()
  try {
    const page = await fetch(`${studio.origin}/index.html`)
    assert.equal(page.status, 200)
    assert.match(await page.text(), /Skill Studio/)

    const snapshot = await fetch(`${studio.origin}/offline-skills.js`)
    assert.equal(snapshot.status, 200)
    assert.match(snapshot.headers.get('content-type'), /javascript/)
    assert.match(await snapshot.text(), /SKILL_STUDIO_OFFLINE_SKILLS/)
  } finally {
    await studio.close()
  }
})

test('answers studio identity so a second launch can reuse the running window', async () => {
  const studio = await startStudio()
  try {
    const response = await fetch(`${studio.origin}/api/studio-info`)
    const payload = await response.json()

    assert.equal(response.status, 200)
    assert.equal(payload.app, STUDIO_ID)
    assert.ok(payload.stateFile.endsWith('state.json'))
  } finally {
    await studio.close()
  }
})

test('persists roles, aliases and sync history into the state file', async () => {
  const studio = await startStudio()
  try {
    const roles = { backend: { name: 'Java 后端工程师', description: '', skills: [] } }
    const saved = await fetch(`${studio.origin}/api/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roles, skillAliases: { 'tdd-workflow': '测试驱动开发' } }),
    })

    assert.equal(saved.status, 200)

    const bootstrap = await (await fetch(`${studio.origin}/api/bootstrap`)).json()
    assert.deepEqual(bootstrap.roles, roles)
    assert.deepEqual(bootstrap.skillAliases, { 'tdd-workflow': '测试驱动开发' })
    assert.deepEqual(bootstrap.syncHistory, [])

    const onDisk = JSON.parse(await fs.readFile(path.join(studio.dataDirectory, 'state.json'), 'utf8'))
    assert.deepEqual(onDisk.roles, roles)

    await fetch(`${studio.origin}/api/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ syncHistory: [{ roleId: 'backend', timestamp: '2026-10-10' }] }),
    })

    const merged = JSON.parse(await fs.readFile(path.join(studio.dataDirectory, 'state.json'), 'utf8'))
    assert.deepEqual(merged.roles, roles)
    assert.equal(merged.syncHistory.length, 1)
  } finally {
    await studio.close()
  }
})

test('writes a role skill into the Codex target directory on sync', async () => {
  const studio = await startStudio()
  try {
    const destinationDirectory = path.join(studio.dataDirectory, 'skills')
    const response = await fetch(`${studio.origin}/api/roles/java-backend/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: '# Java 后端工程师\n' }),
    })
    const payload = await response.json()

    assert.equal(response.status, 200)
    assert.equal(payload.ok, true)
    assert.match(await fs.readFile(path.join(destinationDirectory, 'java-backend', 'SKILL.md'), 'utf8'), /Java 后端工程师/)
  } finally {
    await studio.close()
  }
})

test('removes the synced skill folder when the role is deleted', async () => {
  const studio = await startStudio()
  try {
    const roleDirectory = path.join(studio.dataDirectory, 'skills', 'demo-1')
    await fetch(`${studio.origin}/api/roles/demo-1/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: '# demo\n' }),
    })
    assert.equal(await fs.stat(roleDirectory).then(() => true, () => false), true)

    const response = await fetch(`${studio.origin}/api/roles/demo-1/sync`, { method: 'DELETE' })
    const payload = await response.json()

    assert.equal(response.status, 200)
    assert.equal(payload.ok, true)
    assert.equal(payload.removed, true)
    assert.equal(await fs.stat(roleDirectory).then(() => true, () => false), false)
  } finally {
    await studio.close()
  }
})

test('cleans uploaded knowledge files when the role is deleted', async () => {
  const studio = await startStudio()
  try {
    const knowledgeDirectory = path.join(studio.dataDirectory, 'knowledge', 'demo-9')
    const roleDirectory = path.join(studio.dataDirectory, 'skills', 'demo-9')

    await fetch(`${studio.origin}/api/knowledge/demo-9/files?name=spec.md`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: 'spec',
    })
    await fetch(`${studio.origin}/api/roles/demo-9/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: '# demo\n' }),
    })
    assert.equal(await fs.stat(knowledgeDirectory).then(() => true, () => false), true)

    // synced=0 表示用户取消勾选：同步出去的目录保留，但应用自己存的副本要清掉，
    // 否则角色删掉之后这些文件再也没机会被访问。
    const payload = await (await fetch(`${studio.origin}/api/roles/demo-9/sync?synced=0`, { method: 'DELETE' })).json()

    assert.equal(payload.removed, false)
    assert.equal(await fs.stat(knowledgeDirectory).then(() => true, () => false), false)
    assert.equal(await fs.stat(roleDirectory).then(() => true, () => false), true)
  } finally {
    await studio.close()
  }
})

test('reports nothing to remove when the role was never synced', async () => {
  const studio = await startStudio()
  try {
    const response = await fetch(`${studio.origin}/api/roles/never-synced/sync`, { method: 'DELETE' })
    const payload = await response.json()

    assert.equal(response.status, 200)
    assert.equal(payload.removed, false)
  } finally {
    await studio.close()
  }
})

test('refuses to delete a folder that does not contain a SKILL.md', async () => {
  const studio = await startStudio()
  try {
    const folder = path.join(studio.dataDirectory, 'skills', 'not-a-skill')
    await fs.mkdir(folder, { recursive: true })
    await fs.writeFile(path.join(folder, 'notes.txt'), 'keep me', 'utf8')

    const response = await fetch(`${studio.origin}/api/roles/not-a-skill/sync`, { method: 'DELETE' })
    const payload = await response.json()

    assert.equal(payload.removed, false)
    assert.equal(await fs.stat(folder).then(() => true, () => false), true)
  } finally {
    await studio.close()
  }
})

test('stores an uploaded knowledge file for a role', async () => {
  const studio = await startStudio()
  try {
    const response = await fetch(
      `${studio.origin}/api/knowledge/demo-1/files?name=${encodeURIComponent('db design.md')}`,
      { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: 'table users(id, name)' },
    )
    const payload = await response.json()

    assert.equal(response.status, 200)
    assert.equal(payload.ok, true)
    assert.equal(payload.name, 'db-design.md')
    assert.equal(
      await fs.readFile(path.join(studio.dataDirectory, 'knowledge', 'demo-1', 'db-design.md'), 'utf8'),
      'table users(id, name)',
    )
  } finally {
    await studio.close()
  }
})

test('lists and deletes uploaded knowledge files', async () => {
  const studio = await startStudio()
  try {
    const upload = (name, body) => fetch(
      `${studio.origin}/api/knowledge/demo-2/files?name=${encodeURIComponent(name)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body },
    )
    await upload('a.md', 'aaa')
    await upload('b.md', 'bbb')

    const listed = await (await fetch(`${studio.origin}/api/knowledge/demo-2/files`)).json()
    assert.deepEqual(listed.files.map((file) => file.name).sort(), ['a.md', 'b.md'])
    assert.equal(listed.files.find((file) => file.name === 'a.md').size, 3)

    const removed = await (await fetch(`${studio.origin}/api/knowledge/demo-2/files/a.md`, { method: 'DELETE' })).json()
    assert.equal(removed.removed, true)

    const after = await (await fetch(`${studio.origin}/api/knowledge/demo-2/files`)).json()
    assert.deepEqual(after.files.map((file) => file.name), ['b.md'])
  } finally {
    await studio.close()
  }
})

test('copies knowledge files next to the synced skill and cleans stale ones', async () => {
  const studio = await startStudio()
  try {
    const knowledgeTarget = path.join(studio.dataDirectory, 'skills', 'demo-3', 'knowledge')
    await fetch(`${studio.origin}/api/knowledge/demo-3/files?name=spec.md`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: 'spec content',
    })
    await fetch(`${studio.origin}/api/roles/demo-3/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: '# demo\n' }),
    })
    assert.equal(await fs.readFile(path.join(knowledgeTarget, 'spec.md'), 'utf8'), 'spec content')

    // 删除知识文件后重新同步，旧副本不应残留
    await fetch(`${studio.origin}/api/knowledge/demo-3/files/spec.md`, { method: 'DELETE' })
    await fetch(`${studio.origin}/api/roles/demo-3/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: '# demo\n' }),
    })
    assert.equal(await fs.stat(knowledgeTarget).then(() => true, () => false), false)
  } finally {
    await studio.close()
  }
})

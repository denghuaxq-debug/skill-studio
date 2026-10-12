import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

import {
  bindWithFallback,
  ensureWritableDirectory,
  resolveDataDirectoryCandidates,
  resolveSkillRoots,
  resolveWritableDirectory,
} from '../src/backend/exeRuntime.js'

const exePath = 'C:\\apps\\SkillStudio\\SkillStudio.exe'
const homedir = 'C:\\Users\\tester'
const appData = path.join(homedir, 'AppData', 'Roaming')

test('prefers an explicit data directory override', () => {
  const candidates = resolveDataDirectoryCandidates({
    exePath,
    env: { SKILL_STUDIO_DATA_DIR: 'D:\\custom-data' },
    homedir,
    appData,
  })

  assert.equal(candidates[0], path.resolve('D:\\custom-data'))
  assert.ok(candidates.includes(path.join(path.dirname(exePath), 'data')))
  assert.ok(candidates.includes(path.join(appData, 'SkillStudio', 'data')))
})

test('keeps packaged data next to the executable by default', () => {
  const candidates = resolveDataDirectoryCandidates({ exePath, env: {}, homedir, appData })

  assert.equal(candidates[0], path.join(path.dirname(exePath), 'data'))
  assert.equal(candidates.length, 3)
  assert.equal(new Set(candidates).size, candidates.length)
})

test('deduplicates data candidates when the fallback equals the exe folder', () => {
  const shared = path.join(homedir, 'SkillStudio')
  const candidates = resolveDataDirectoryCandidates({
    exePath: path.join(shared, 'SkillStudio.exe'),
    env: {},
    homedir,
    appData: path.join(homedir, 'SkillStudio'),
  })

  assert.equal(new Set(candidates).size, candidates.length)
  assert.ok(candidates.length >= 2)
})

test('resolves skill roots for the packaged app without duplicates', () => {
  const roots = resolveSkillRoots({
    homedir,
    additionalRoots: [path.join(homedir, '.agents', 'skills'), path.join(homedir, 'app', '.agents', 'skills')],
  })

  assert.deepEqual(roots, [
    path.join(homedir, '.agents', 'skills'),
    path.join(homedir, '.codex', 'skills'),
    path.join(homedir, 'app', '.agents', 'skills'),
  ])
})

test('skips an occupied port and keeps trying the next one', async () => {
  const busy = http.createServer((request, response) => response.end('busy'))
  await new Promise((resolve) => busy.listen(0, '127.0.0.1', resolve))
  const busyPort = busy.address().port

  let bound
  try {
    bound = await bindWithFallback(
      () => http.createServer((request, response) => response.end('ok')),
      { host: '127.0.0.1', preferredPort: busyPort, attemptLimit: 5 },
    )
    // 相邻端口可能被其它并行测试占用，只要在尝试范围内换到了别的端口即可。
    assert.notEqual(bound.port, busyPort)
    assert.ok(bound.port > busyPort && bound.port < busyPort + 5)
  } finally {
    if (bound) await new Promise((resolve) => bound.server.close(resolve))
    await new Promise((resolve) => busy.close(resolve))
  }
})

test('throws when every candidate port is already taken', async () => {
  const busy = http.createServer((request, response) => response.end('busy'))
  await new Promise((resolve) => busy.listen(0, '127.0.0.1', resolve))
  const busyPort = busy.address().port

  try {
    await assert.rejects(
      bindWithFallback(() => http.createServer(), { host: '127.0.0.1', preferredPort: busyPort, attemptLimit: 1 }),
      /占用/,
    )
  } finally {
    await new Promise((resolve) => busy.close(resolve))
  }
})

test('detects whether a directory can actually be written to', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-studio-writable-'))
  const blockingFile = path.join(tempRoot, 'blocking-file')
  await fs.writeFile(blockingFile, 'not a directory', 'utf8')

  assert.equal(await ensureWritableDirectory(path.join(tempRoot, 'fresh')), true)
  assert.equal(await ensureWritableDirectory(path.join(blockingFile, 'data')), false)

  await fs.rm(tempRoot, { recursive: true, force: true })
})

test('picks the first writable data directory and reports failures', async () => {
  const order = []
  const picked = await resolveWritableDirectory(['C:\\blocked', 'C:\\usable'], {
    ensure: async (directory) => {
      order.push(directory)
      return directory === 'C:\\usable'
    },
  })

  assert.equal(picked, 'C:\\usable')
  assert.deepEqual(order, ['C:\\blocked', 'C:\\usable'])

  await assert.rejects(
    resolveWritableDirectory(['C:\\blocked'], { ensure: async () => false }),
    /可写入/,
  )
})

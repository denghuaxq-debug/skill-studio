import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'

import { scanSkillRoots } from './skillScanner.js'

export const STUDIO_ID = 'skill-studio'
export const DEFAULT_PORT = 4173

const json = (value) => JSON.stringify(value)
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export function safeSegment(value) {
  const segment = String(value ?? '').trim()
  if (!segment || segment === '.' || segment === '..' || /[\\/]/.test(segment)) {
    throw new Error('非法路径片段')
  }
  return segment.replace(/[^\p{Letter}\p{Number}._-]/gu, '-')
}

function normalizeState(value) {
  return {
    roles: isRecord(value?.roles) ? value.roles : {},
    syncHistory: Array.isArray(value?.syncHistory) ? value.syncHistory : [],
    skillAliases: isRecord(value?.skillAliases) ? value.skillAliases : {},
  }
}

async function listKnowledgeFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => [])
  const files = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const stat = await fs.stat(path.join(directory, entry.name)).catch(() => null)
    if (stat) files.push({ name: entry.name, size: stat.size, modifiedAt: stat.mtime.toISOString() })
  }
  return files.sort((left, right) => left.name.localeCompare(right.name))
}

export function createStateStore(dataDirectory) {
  const stateFile = path.join(dataDirectory, 'state.json')
  const legacyRolesFile = path.join(dataDirectory, 'roles.json')

  async function readState() {
    try {
      return normalizeState(JSON.parse(await fs.readFile(stateFile, 'utf8')))
    } catch {
      try {
        const legacyRoles = JSON.parse(await fs.readFile(legacyRolesFile, 'utf8'))
        return { roles: isRecord(legacyRoles) ? legacyRoles : {}, syncHistory: [], skillAliases: {} }
      } catch {
        return { roles: {}, syncHistory: [], skillAliases: {} }
      }
    }
  }

  async function writeState(nextState) {
    const state = normalizeState(nextState)
    await fs.mkdir(path.dirname(stateFile), { recursive: true })
    await fs.writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    return state
  }

  return { stateFile, readState, writeState }
}

export function createStudioServer({ dataDirectory, skillRoots = [], targetDirectory, assets = {} }) {
  const store = createStateStore(dataDirectory)
  const listSkills = () => scanSkillRoots(skillRoots)
  const resolveAsset = async (asset) => (typeof asset === 'function' ? asset() : asset ?? '')

  const send = (response, status, payload, contentType = 'application/json; charset=utf-8') => {
    response.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store' })
    response.end(typeof payload === 'string' ? payload : json(payload))
  }

  const readJsonBody = async (request) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const raw = Buffer.concat(chunks).toString('utf8')
    return raw ? JSON.parse(raw) : {}
  }

  // 上传的知识文件走原始字节，避免引入 multipart 解析。
  const readRawBody = async (request, limit = 32 * 1024 * 1024) => {
    const chunks = []
    let size = 0
    for await (const chunk of request) {
      size += chunk.length
      if (size > limit) throw new Error('文件超过 32 MB 上限')
      chunks.push(chunk)
    }
    return Buffer.concat(chunks)
  }

  const readSkillContent = async (skill) => {
    try {
      return { skill, content: await fs.readFile(skill.path, 'utf8') }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      return { skill, content: skill.body || '' }
    }
  }

  async function handleApi(request, response, url) {
    if (request.method === 'GET' && url.pathname === '/api/studio-info') {
      return send(response, 200, {
        app: STUDIO_ID,
        dataDirectory,
        stateFile: store.stateFile,
        roots: skillRoots,
        targetDirectory,
      })
    }

    if (request.method === 'GET' && url.pathname === '/api/bootstrap') {
      const [skills, state] = await Promise.all([listSkills(), store.readState()])
      return send(response, 200, { skills, ...state, roots: skillRoots, targetDirectory })
    }

    if (request.method === 'GET' && url.pathname === '/api/skills') {
      return send(response, 200, { skills: await listSkills(), roots: skillRoots })
    }

    if (request.method === 'GET' && url.pathname === '/api/roles') {
      return send(response, 200, { roles: (await store.readState()).roles })
    }

    if (request.method === 'PUT' && url.pathname === '/api/roles') {
      const body = await readJsonBody(request)
      const roles = isRecord(body.roles) ? body.roles : {}
      await store.writeState({ ...(await store.readState()), roles })
      return send(response, 200, { roles })
    }

    if (request.method === 'PUT' && url.pathname === '/api/state') {
      const body = await readJsonBody(request)
      const state = await store.readState()
      const nextState = {
        roles: isRecord(body.roles) ? body.roles : state.roles,
        syncHistory: Array.isArray(body.syncHistory) ? body.syncHistory : state.syncHistory,
        skillAliases: isRecord(body.skillAliases) ? body.skillAliases : state.skillAliases,
      }
      return send(response, 200, await store.writeState(nextState))
    }

    const skillMatch = url.pathname.match(/^\/api\/skills\/([^/]+)$/)
    if (request.method === 'GET' && skillMatch) {
      const skillId = decodeURIComponent(skillMatch[1])
      const skill = (await listSkills()).find(item => item.id === skillId)
      if (!skill) return send(response, 404, { error: 'Skill 不存在' })
      return send(response, 200, await readSkillContent(skill))
    }

    const syncMatch = url.pathname.match(/^\/api\/roles\/([^/]+)\/sync$/)
    // 知识库：上传的文件存在客户端数据目录，同步时再复制到角色 Skill 旁边。
    const knowledgeListMatch = url.pathname.match(/^\/api\/knowledge\/([^/]+)\/files$/)
    if (knowledgeListMatch) {
      const roleId = safeSegment(decodeURIComponent(knowledgeListMatch[1]))
      const directory = path.join(dataDirectory, 'knowledge', roleId)

      if (request.method === 'GET') {
        return send(response, 200, { files: await listKnowledgeFiles(directory) })
      }

      if (request.method === 'POST') {
        const name = safeSegment(url.searchParams.get('name') || '')
        const buffer = await readRawBody(request)
        await fs.mkdir(directory, { recursive: true })
        await fs.writeFile(path.join(directory, name), buffer)
        return send(response, 200, { ok: true, name, size: buffer.length })
      }
    }

    const knowledgeFileMatch = url.pathname.match(/^\/api\/knowledge\/([^/]+)\/files\/([^/]+)$/)
    if (request.method === 'DELETE' && knowledgeFileMatch) {
      const roleId = safeSegment(decodeURIComponent(knowledgeFileMatch[1]))
      const name = safeSegment(decodeURIComponent(knowledgeFileMatch[2]))
      const file = path.join(dataDirectory, 'knowledge', roleId, name)
      const existed = await fs.stat(file).then(() => true, () => false)
      if (existed) await fs.rm(file, { force: true })
      return send(response, 200, { ok: true, removed: existed })
    }

    if (request.method === 'POST' && syncMatch) {
      const body = await readJsonBody(request)
      const roleId = safeSegment(decodeURIComponent(syncMatch[1]))
      const roleDirectory = path.join(targetDirectory, roleId)
      await fs.mkdir(roleDirectory, { recursive: true })
      const destination = path.join(roleDirectory, 'SKILL.md')
      await fs.writeFile(destination, String(body.markdown || ''), 'utf8')

      // 知识库文件跟着角色一起走：先清掉旧副本，避免已删除的文件残留在目标目录。
      const knowledgeSource = path.join(dataDirectory, 'knowledge', roleId)
      const knowledgeTarget = path.join(roleDirectory, 'knowledge')
      await fs.rm(knowledgeTarget, { recursive: true, force: true })
      try {
        const stored = await fs.readdir(knowledgeSource)
        if (stored.length) await fs.cp(knowledgeSource, knowledgeTarget, { recursive: true })
      } catch { /* 没有知识文件就跳过 */ }

      return send(response, 200, { ok: true, destination })
    }

    if (request.method === 'DELETE' && syncMatch) {
      const resolvedTarget = path.resolve(targetDirectory)
      const roleDirectory = path.resolve(path.join(resolvedTarget, safeSegment(decodeURIComponent(syncMatch[1]))))

      // 只允许删目标目录下的子目录，避免路径穿越误删别的文件。
      if (!roleDirectory.startsWith(resolvedTarget + path.sep)) {
        return send(response, 400, { error: '非法路径片段' })
      }

      // 只有确实存在 SKILL.md 才认为是同步出去的目录，避免误删同名普通目录。
      try {
        await fs.access(path.join(roleDirectory, 'SKILL.md'))
      } catch {
        return send(response, 200, { ok: true, removed: false })
      }

      await fs.rm(roleDirectory, { recursive: true, force: true })
      return send(response, 200, { ok: true, removed: true, path: roleDirectory })
    }

    return send(response, 404, { error: 'API 路径不存在' })
  }

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)

      if (url.pathname.startsWith('/api/')) {
        await handleApi(request, response, url)
        return
      }

      if (request.method === 'GET' && url.pathname === '/offline-skills.js') {
        return send(response, 200, await resolveAsset(assets.offlineSkillsScript), 'application/javascript; charset=utf-8')
      }

      if (request.method !== 'GET' || !['/', '/index.html'].includes(url.pathname)) {
        return send(response, 404, 'Not found', 'text/plain; charset=utf-8')
      }

      return send(response, 200, await resolveAsset(assets.html), 'text/html; charset=utf-8')
    } catch (error) {
      const status = error?.message === '非法路径片段' ? 400 : 500
      send(response, status, { error: error instanceof Error ? error.message : '服务器错误' })
    }
  })

  server.studio = { dataDirectory, stateFile: store.stateFile, skillRoots, targetDirectory }

  return server
}

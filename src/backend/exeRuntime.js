import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * Helpers shared by the packaged .exe launcher. They stay free of any import.meta
 * usage so the bundle can be compiled to CommonJS for Node's single executable
 * application (SEA) format.
 */

export function resolveDataDirectoryCandidates({ exePath, env = {}, homedir, appData } = {}) {
  const candidates = []
  const push = (value) => {
    if (!value) return
    const resolved = path.resolve(value)
    if (!candidates.includes(resolved)) candidates.push(resolved)
  }

  push(env.SKILL_STUDIO_DATA_DIR)
  if (exePath) push(path.join(path.dirname(path.resolve(exePath)), 'data'))
  if (appData) push(path.join(appData, 'SkillStudio', 'data'))
  else if (homedir) push(path.join(homedir, 'AppData', 'Roaming', 'SkillStudio', 'data'))
  if (homedir) push(path.join(homedir, '.skill-studio', 'data'))

  return candidates
}

export function resolveSkillRoots({ homedir, additionalRoots = [] } = {}) {
  const roots = []
  const push = (value) => {
    if (!value) return
    const resolved = path.resolve(value)
    if (!roots.includes(resolved)) roots.push(resolved)
  }

  if (homedir) {
    push(path.join(homedir, '.agents', 'skills'))
    push(path.join(homedir, '.codex', 'skills'))
  }
  additionalRoots.forEach(push)

  return roots
}

export async function ensureWritableDirectory(directory) {
  try {
    await fs.mkdir(directory, { recursive: true })
    const probe = path.join(directory, `.skill-studio-write-probe-${process.pid}-${Date.now()}`)
    await fs.writeFile(probe, '', 'utf8')
    await fs.rm(probe, { force: true })
    return true
  } catch {
    return false
  }
}

export async function resolveWritableDirectory(candidates, { ensure = ensureWritableDirectory } = {}) {
  for (const candidate of candidates) {
    if (await ensure(candidate)) return candidate
  }

  throw new Error(`找不到可写入的数据目录：${candidates.join('、')}`)
}

export async function bindWithFallback(createServer, { host = '127.0.0.1', preferredPort, attemptLimit = 12 } = {}) {
  let lastError

  for (let offset = 0; offset < attemptLimit; offset += 1) {
    const port = preferredPort + offset
    const server = createServer()

    try {
      await new Promise((resolve, reject) => {
        let settled = false
        const onError = (error) => {
          if (settled) return
          settled = true
          server.removeListener('listening', onListening)
          reject(error)
        }
        const onListening = () => {
          if (settled) return
          settled = true
          server.removeListener('error', onError)
          resolve()
        }

        server.once('error', onError)
        server.once('listening', onListening)
        server.listen(port, host)
      })

      return { server, port }
    } catch (error) {
      lastError = error
      if (error?.code !== 'EADDRINUSE') throw error
      try { server.close() } catch { /* 端口被占用时服务器并未启动 */ }
    }
  }

  throw new Error(`端口 ${preferredPort} 起连续 ${attemptLimit} 个端口都被占用`, { cause: lastError })
}

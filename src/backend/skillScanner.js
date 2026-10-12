import fs from 'node:fs/promises'
import path from 'node:path'

function unquote(value) {
  const trimmed = value.trim()
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function stableId(name, filePath) {
  let hash = 2166136261
  for (const char of filePath) {
    hash ^= char.codePointAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return `${name}-${(hash >>> 0).toString(16)}`
}

export function parseSkillDocument(content) {
  const normalized = String(content).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---\n')) {
    throw new Error('Skill 文档缺少 name 或 description')
  }

  const end = normalized.indexOf('\n---', 4)
  if (end === -1) {
    throw new Error('Skill 文档缺少 name 或 description')
  }

  const metadata = {}
  const metadataLines = normalized.slice(4, end).split('\n')
  for (let index = 0; index < metadataLines.length; index += 1) {
    const line = metadataLines[index]
    const separator = line.indexOf(':')
    if (separator === -1) continue
    const key = line.slice(0, separator).trim()
    const value = unquote(line.slice(separator + 1))
    if (!key) continue
    if (['>', '>-', '|', '|-'].includes(value)) {
      const continuation = []
      while (index + 1 < metadataLines.length && /^\s+/.test(metadataLines[index + 1])) {
        index += 1
        continuation.push(metadataLines[index].trim())
      }
      metadata[key] = value.startsWith('|') ? continuation.join('\n') : continuation.join(' ')
    } else {
      metadata[key] = value
    }
  }

  if (!metadata.name || !metadata.description) {
    throw new Error('Skill 文档缺少 name 或 description')
  }

  return {
    name: metadata.name,
    description: metadata.description,
    body: normalized.slice(end + 4).trim(),
  }
}

async function collectSkillFiles(directory, files = []) {
  let entries
  try {
    entries = await fs.readdir(directory, { withFileTypes: true })
  } catch {
    return files
  }

  const nested = entries.map(async (entry) => {
    if (entry.isSymbolicLink()) return
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      await collectSkillFiles(entryPath, files)
    } else if (entry.isFile() && entry.name.toLowerCase() === 'skill.md') {
      files.push(entryPath)
    }
  })
  await Promise.all(nested)
  return files
}

export async function scanSkillRoots(roots) {
  const records = []
  for (const root of roots) {
    const resolvedRoot = path.resolve(root)
    const files = await collectSkillFiles(resolvedRoot)
    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, 'utf8')
        const parsed = parseSkillDocument(content)
        const stat = await fs.stat(filePath)
        records.push({
          id: stableId(parsed.name, filePath),
          name: parsed.name,
          description: parsed.description,
          path: filePath,
          sourceRoot: resolvedRoot,
          body: parsed.body,
          modifiedAt: stat.mtime.toISOString(),
        })
      } catch {
        // Ignore incomplete or unreadable Skill folders; one bad Skill should not block the library.
      }
    }
  }

  return records.sort((left, right) => left.name.localeCompare(right.name))
}

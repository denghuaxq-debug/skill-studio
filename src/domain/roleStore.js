/**
 * 角色操作的纯函数集合，便于单测与复用。
 *
 * 注意：界面里生成角色 Skill 走的是 index.html 里的 roleMarkdown()，
 * 那边按 role.invoke 命名（$java → name: java）；本文件的 generateRoleSkill
 * 按 role.id 命名，两者规则不同。目前只有测试引用本文件，改这里不会影响界面行为。
 * 如果哪天要把生成逻辑收到这里，记得先统一命名规则。
 */
const slugify = (value) => {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'role'
}

export function createRole({ name, description = '', avatar = '👤' }) {
  const normalizedName = String(name ?? '').trim()

  if (!normalizedName) {
    throw new Error('角色名称不能为空')
  }

  return {
    id: `${slugify(normalizedName)}-${Date.now()}`,
    name: normalizedName,
    description: String(description ?? '').trim(),
    avatar,
    skills: [],
    synced: false,
  }
}

export function addSkillToRole(role, skill) {
  if (!skill?.id || role.skills.some((item) => item.id === skill.id)) {
    return { ...role, skills: [...role.skills] }
  }

  return {
    ...role,
    skills: [...role.skills, { id: skill.id, mode: skill.mode === 'core' ? 'core' : 'on_demand' }],
    synced: false,
  }
}

export function removeSkillFromRole(role, skillId) {
  return {
    ...role,
    skills: role.skills.filter((skill) => skill.id !== skillId),
    synced: false,
  }
}

export function setSkillMode(role, skillId, mode) {
  const normalizedMode = mode === 'core' ? 'core' : 'on_demand'

  return {
    ...role,
    skills: role.skills.map((skill) => skill.id === skillId ? { ...skill, mode: normalizedMode } : { ...skill }),
    synced: false,
  }
}

export function generateRoleSkill(role, catalog) {
  const safeName = slugify(role.id.replace(/-\d+$/, ''))
  const skillLines = role.skills.map((attachedSkill) => {
    const skill = catalog[attachedSkill.id] ?? { name: attachedSkill.id, description: '' }
    const mode = attachedSkill.mode === 'core' ? '核心能力' : '按需调用'
    return `- **${skill.name}**（${mode}）：${skill.description}`
  })

  return `---
name: ${safeName}
description: ${role.description || `${role.name}的编排 Skill，负责调度相关能力完成用户任务。`}
---

# ${role.name}

你是“${role.name}”这一角色 Skill，负责理解用户任务、选择合适的子 Skill、组织执行顺序，并汇总出可验证的结果。

## 可调度的 Skills

${skillLines.length ? skillLines.join('\n') : '- 当前还没有赋予子 Skill。'}

## 工作方式

1. 先理解任务目标、约束和当前项目上下文。
2. 根据任务选择相关的子 Skill；核心能力优先，按需能力仅在匹配时调用。
3. 按合理顺序组织工作，并明确说明正在使用的能力。
4. 涉及文件修改、命令执行或外部资源时，遵循当前环境的权限和确认要求。
5. 汇总结果，说明完成内容、验证方式和剩余风险。
`
}

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addSkillToRole,
  createRole,
  generateRoleSkill,
  removeSkillFromRole,
  setSkillMode,
} from '../src/domain/roleStore.js'

const baseRole = {
  id: 'java-backend',
  name: 'Java 后端工程师',
  description: '负责 Java 后端开发',
  avatar: '👨‍💻',
  skills: [{ id: 'tdd-workflow', mode: 'on_demand' }],
}

test('creates a normalized role with a stable id', () => {
  const role = createRole({ name: '  产品研究员  ', description: '研究市场' })

  assert.equal(role.name, '产品研究员')
  assert.equal(role.description, '研究市场')
  assert.match(role.id, /^产品研究员-/)
  assert.deepEqual(role.skills, [])
})

test('rejects an empty role name', () => {
  assert.throws(() => createRole({ name: '   ', description: '' }), /角色名称不能为空/)
})

test('adds a skill immutably and prevents duplicates', () => {
  const next = addSkillToRole(baseRole, { id: 'security-review', mode: 'on_demand' })

  assert.notEqual(next, baseRole)
  assert.equal(next.skills.length, 2)
  assert.equal(baseRole.skills.length, 1)
  assert.equal(addSkillToRole(next, { id: 'security-review', mode: 'core' }).skills.length, 2)
})

test('keeps every distinct Skill when a role has many Skills', () => {
  const manySkills = Array.from({ length: 200 }, (_, index) => ({ id: `skill-${index}`, mode: 'on_demand' }))
  const next = manySkills.reduce((role, skill) => addSkillToRole(role, skill), { ...baseRole, skills: [] })

  assert.equal(next.skills.length, manySkills.length)
  assert.equal(next.skills.at(-1).id, 'skill-199')
})

test('removes a skill immutably', () => {
  const next = removeSkillFromRole(baseRole, 'tdd-workflow')

  assert.deepEqual(next.skills, [])
  assert.deepEqual(baseRole.skills, [{ id: 'tdd-workflow', mode: 'on_demand' }])
})

test('changes skill mode without mutating the role', () => {
  const next = setSkillMode(baseRole, 'tdd-workflow', 'core')

  assert.deepEqual(next.skills, [{ id: 'tdd-workflow', mode: 'core' }])
  assert.deepEqual(baseRole.skills, [{ id: 'tdd-workflow', mode: 'on_demand' }])
})

test('generates a Codex-compatible orchestrator skill', () => {
  const markdown = generateRoleSkill(baseRole, {
    'tdd-workflow': {
      name: 'TDD Workflow',
      description: '测试驱动开发流程',
    },
  })

  assert.match(markdown, /name: java-backend/)
  assert.match(markdown, /# Java 后端工程师/)
  assert.match(markdown, /TDD Workflow/)
  assert.match(markdown, /按需调用/)
})

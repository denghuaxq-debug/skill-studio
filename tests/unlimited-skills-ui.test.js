import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const htmlPath = new URL('../index.html', import.meta.url)
const html = fs.readFileSync(htmlPath, 'utf8')
// 服务端实现已抽到 studioServer.js，server.js 只保留开发模式入口。
const serverPath = new URL('../src/backend/studioServer.js', import.meta.url)
const server = fs.readFileSync(serverPath, 'utf8')

test('keeps the local Skill library unbounded', () => {
  assert.doesNotMatch(html, /skills\.slice\(0,\s*12\)/)
  assert.match(html, /skills\.forEach\(skill => \{/) 
})

test('every inline script in the page parses as valid JavaScript', () => {
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1])
  assert.ok(blocks.length >= 2, '页面应当有内联脚本')

  blocks.forEach((code, index) => {
    assert.doesNotThrow(
      () => new vm.Script(code, { filename: `inline-${index + 1}.js` }),
      `第 ${index + 1} 段内联脚本存在语法错误`,
    )
  })
})

test('renders every assigned local Skill in a dynamic graph layout', () => {
  assert.doesNotMatch(html, /if \(!skill \|\| !positions\[index\]\) return/)
  assert.match(html, /const dynamicSkills = state\.role\.skills;/)
  assert.doesNotMatch(html, /const staticIds/)
  assert.match(html, /if \(!skill\) return/)
  assert.doesNotMatch(html, /builtinSkillTemplates/)
  assert.match(html, /Math\.cos\(angle\)/)
  assert.match(html, /Math\.sin\(angle\)/)
  assert.match(html, /\.orbit-viewport \{[^}]*overflow-x: auto/)
  assert.match(html, /stage\.style\.minWidth/)
})

test('does not ship hard-coded demo Skill nodes or a fake fallback catalog', () => {
  assert.doesNotMatch(html, /data-skill="backend-patterns"[^>]*>\s*<span class="skill-icon">🧩<\/span>/)
  assert.doesNotMatch(html, /data-skill="new-skill"[^>]*>\s*<span class="skill-icon">＋<\/span>/)
  assert.doesNotMatch(html, /const builtinSkillTemplates/)
  assert.match(html, /SKILL_STUDIO_OFFLINE_SKILLS/)
})

test('uses the offline snapshot when the HTML is opened without a local server', () => {
  assert.match(html, /const offlineSkills = Array\.isArray\(window\.SKILL_STUDIO_OFFLINE_SKILLS\)/)
  assert.match(html, /离线快照/)
  assert.match(html, /const cacheKey = 'skill-studio-local-skills-v1'/)
})

test('keeps the inspected local Skill selected for mode and remove actions', () => {
  assert.match(html, /window\.skillStudio\?\.selectSkill\(skill\.id\)/)
})

test('wires the list view button to a real assigned-Skill list', () => {
  assert.match(html, /id="skillListView"/)
  assert.match(html, /setView\('list'\)/)
  assert.match(html, /renderAssignedList/)
})

test('hides the graph empty state after real Skills are rendered', () => {
  assert.match(html, /\.graph-empty\.hidden\s*\{\s*display:\s*none/)
  assert.match(html, /empty\.classList\.toggle\('hidden', dynamicSkills\.length > 0\)/)
})

test('wires the inspector close button to clear the current Skill', () => {
  assert.match(html, /id="closeInspector"/)
  assert.match(html, /closeInspector.*addEventListener\('click'/s)
})

test('uses a clipboard fallback instead of claiming copy success unconditionally', () => {
  assert.match(html, /navigator\.clipboard\?\.writeText\(invoke\)/)
  assert.match(html, /document\.execCommand\('copy'\)/)
  assert.match(html, /copyInvoke.*addEventListener\('click',\s*\(\) => copyInvoke\(\)/s)
})

test('provides a live search for the local Skill library', () => {
  assert.match(html, /id="localSkillSearch"/)
  assert.match(html, /renderLibrary\(localSkills, localSearchQuery\)/)
  assert.match(html, /localSkillSearch.*addEventListener\('input'/s)
  assert.match(html, /没有匹配的 Skill/)
})

test('marks Skills already assigned to the current role in the local library', () => {
  assert.match(html, /const assignedIds = new Set\(window\.skillStudio\?\.getState/)
  assert.match(html, /action = isAssigned \? '已赋予' : '赋予'/)
  assert.match(html, /addButton\.disabled = isAssigned/)
  assert.match(html, /skill-studio-role-rendered.*renderLibrary\(localSkills, localSearchQuery\)/s)
})

test('lets each role configure default constraints from the central role card', () => {
  assert.match(html, /id="roleSettings"/)
  assert.match(html, /id="roleConstraints"/)
  assert.match(html, /defaultConstraints/)
  assert.match(html, /openRoleSettings/)
  assert.match(html, /saveRoleSettings/)
  assert.match(html, /## 默认规范约束/)
})

test('opens a larger local Skill picker from the role graph', () => {
  assert.match(html, /id="addSkillBtn"/)
  assert.match(html, /skill-studio-open-picker/)
  assert.match(html, /local-skill-picker/)
  assert.match(html, /max-height: min\(620px, calc\(90vh - 190px\)\)/)
})

test('keeps the local Skill picker open after assigning a Skill', () => {
  assert.match(html, /window\.skillStudio\?\.attachSkill\(skill\.id\);\s*openSkill\(skill\);/s)
  assert.doesNotMatch(html, /window\.skillStudio\?\.attachSkill\(skill\.id\);\s*closePicker\(\)/s)
})

test('refreshes the picker after assigning so the Skill cannot be assigned twice', () => {
  assert.match(html, /window\.addEventListener\('skill-studio-role-rendered', \(\) => renderPicker\(pickerSearch\.value\)\)/)
  assert.match(html, /button\.disabled = assignedIds\.has\(skill\.id\)/)
  assert.match(html, /action\.textContent = button\.disabled \? '已赋予' : '赋予'/)
})

test('previews the generated role Skill before downloading it', () => {
  assert.match(html, /id="exportPreviewBtn"/)
  assert.match(html, /id="roleExportPreview"[^>]*role="dialog"/)
  assert.match(html, /id="roleExportContent"/)
  assert.match(html, /function previewRole\(\)/)
  assert.match(html, /roleExportContent.*textContent = roleMarkdown\(role\)/s)
  assert.match(html, /id="downloadRoleExport"/)
  assert.match(html, /downloadRoleExport.*addEventListener\('click', exportRole\)/s)
})

test('uses an in-page dialog instead of browser prompts to create a role', () => {
  assert.match(html, /id="roleCreate"[^>]*role="dialog"/)
  assert.match(html, /id="roleCreateName"[^>]*type="text"/)
  assert.match(html, /textarea[^>]*id="roleCreateDescription"/)
  assert.doesNotMatch(html, /function createRole\(\)[\s\S]*window\.prompt/)
  assert.match(html, /function openRoleCreate\(\)/)
  assert.match(html, /function submitRoleCreate\(\)/)
  assert.match(html, /newRole.*addEventListener\('click', openRoleCreate\)/s)
  assert.match(html, /roleCreateSubmit.*addEventListener\('click', submitRoleCreate\)/s)
  assert.match(html, /roleCreateCancel.*addEventListener\('click', closeRoleCreate\)/s)
  assert.match(html, /roleCreateClose.*addEventListener\('click', closeRoleCreate\)/s)
})

test('provides a safe delete action for every role', () => {
  assert.match(html, /querySelectorAll\('\.role-entry, \.role'\)/)
  assert.match(html, /className = 'role-remove'/)
  assert.match(html, /function deleteRole\(id\)/)
  assert.match(html, /function submitRoleDelete\(\)/)
  assert.match(html, /至少保留一个角色/)
  assert.match(html, /role-remove.*删除角色/s)
})

test('asks for delete confirmation in an in-page dialog, not the browser confirm', () => {
  assert.doesNotMatch(html, /window\.confirm/)
  assert.match(html, /id="roleDeleteConfirm"[^>]*role="dialog"/)
  assert.match(html, /id="roleDeleteMessage"/)
  assert.match(html, /id="roleDeleteCancel"/)
  assert.match(html, /id="roleDeleteClose"/)
  assert.match(html, /id="roleDeleteSubmit"/)
  assert.match(html, /function deleteRole\(id\) \{ openRoleDeleteConfirm/)
  assert.match(html, /roleDeleteSubmit.*addEventListener\('click', submitRoleDelete\)/s)
  assert.match(html, /roleDeleteCancel.*addEventListener\('click', closeRoleDeleteConfirm\)/s)
  assert.match(html, /event\.target\.id === 'roleDeleteConfirm'/)
  assert.match(html, /class="danger" id="roleDeleteSubmit"/)
})

test('can remove the synced skill file together with the role', () => {
  const dialog = html.slice(html.indexOf('id="roleDeleteConfirm"'), html.indexOf('id="roleExportPreview"'))
  assert.match(dialog, /<input type="checkbox" id="deleteRoleSyncFile" checked \/>/)
  assert.match(dialog, /同时删除已同步到 Codex 的 Skill 文件/)

  assert.match(html, /document\.getElementById\('deleteRoleSyncFile'\)\.checked = true;/)
  assert.match(html, /const alsoRemoveSynced = document\.getElementById\('deleteRoleSyncFile'\)\.checked;/)
  assert.match(html, /function submitRoleDelete\(\) \{/)
  assert.match(html, /await fetch\(`\/api\/roles\/\$\{encodeURIComponent\(id\)\}\/sync`, \{ method: 'DELETE' \}\)/)
  assert.match(html, /已删除角色「\$\{role\.name\}」和已同步的文件/)
})

test('lets each role keep a knowledge base of folders and uploaded files', () => {
  assert.match(html, /id="knowledgeBtn"[^>]*type="button"/)
  assert.match(html, /id="knowledgeModal"[^>]*role="dialog"/)
  assert.match(html, /id="knowledgeList"/)
  assert.match(html, /id="addKnowledgeDir"[^>]*type="button"/)
  assert.match(html, /id="knowledgeDirForm"/)
  assert.match(html, /id="knowledgeDirPath"/)
  assert.match(html, /id="uploadKnowledgeFile"[^>]*type="button"/)
  assert.match(html, /<input type="file" id="knowledgeFileInput" multiple hidden \/>/)

  assert.match(html, /knowledge: Array\.isArray\(role\.knowledge\)/)
  assert.match(html, /const renderKnowledge = \(\) => \{/)
  assert.match(html, /const uploadKnowledgeFiles = async \(fileList\) => \{/)
  assert.match(html, /knowledgeBtn.*addEventListener\('click', openKnowledge\)/s)
  assert.match(html, /\/api\/knowledge\/\$\{encodeURIComponent\(activeRoleId\)\}\/files\?name=/)

  // 知识库弹框必须是顶层弹框，不能被嵌进别的弹框里（否则永远显示不出来）
  assert.match(html, /id="knowledgeDone"[\s\S]*?\n    <\/div>\n  <\/div>\n  <div class="modal-backdrop hidden" id="skillLibraryView"/)

  // 生成的角色 Skill 里要有知识库章节
  assert.match(html, /## 知识库/)
  assert.match(html, /const knowledgeSection = knowledgeLines/)
})

test('hides every scrollbar without breaking scrolling', () => {
  assert.match(html, /\* \{ box-sizing: border-box; scrollbar-width: none; -ms-overflow-style: none; \}/)
  assert.match(html, /\*::-webkit-scrollbar \{ width: 0; height: 0; display: none; \}/)

  // 滚动容器必须仍然能滚动，只是看不到滚动条。
  assert.match(html, /\.orbit-viewport \{[^}]*overflow-x: auto/)
  assert.match(html, /\.picker-list \{[^}]*overflow: auto/)
  assert.match(html, /\.local-list \{[^}]*overflow-y: auto/)
  assert.match(html, /\.sync-history-body \{[^}]*overflow: auto/)
  assert.match(html, /\.md-preview \{[^}]*overflow: auto/)
})

test('shows the generated logo as the sidebar brand mark', () => {
  assert.match(html, /class="brand-mark"><img id="brandLogo"/)
  assert.match(html, /src="data:image\/png;base64,[A-Za-z0-9+/=]{2000,}"/)
  assert.match(html, /\.brand-mark img \{ width: 100%; height: 100%; display: block; border-radius: inherit; \}/)
})

test('makes the sidebar navigation buttons functional', () => {
  assert.match(html, /id="skillLibraryNav"/)
  assert.match(html, /id="syncHistoryNav"/)
  assert.match(html, /id="settingsNav"/)
  assert.match(html, /id="syncHistory"[^>]*role="dialog"/)
  assert.match(html, /function openSyncHistory\(\)/)
  assert.match(html, /skillLibraryNav.*addEventListener\('click'/s)
  assert.match(html, /syncHistoryNav.*addEventListener\('click', openSyncHistory\)/s)
  assert.match(html, /settingsNav.*addEventListener\('click', openRoleSettings\)/s)
})

test('opens the local Skill list in its own dialog from the sidebar', () => {
  assert.match(html, /id="skillLibraryView"[^>]*role="dialog"/)
  assert.match(html, /id="libraryViewSearch"[^>]*type="search"/)
  assert.match(html, /id="libraryViewList"/)
  assert.match(html, /id="libraryViewCount"/)
  assert.match(html, /const openSkillLibraryView = \(\) => \{/)
  assert.match(html, /const renderSkillLibraryView = \(\) => \{/)
  assert.match(html, /const closeSkillLibraryView = \(\) => libraryView\.classList\.add\('hidden'\)/)
  assert.match(html, /function openSkillLibrary\(\) \{ window\.dispatchEvent\(new CustomEvent\('skill-studio-open-library'\)\); \}/)
  assert.match(html, /window\.addEventListener\('skill-studio-open-library', openSkillLibraryView\)/)
  assert.match(html, /libraryView\.classList\.remove\('hidden'\)/)
  assert.match(html, /libraryViewSearch\.addEventListener\('input', renderSkillLibraryView\)/)
  assert.match(html, /skillLibraryClose.*addEventListener\('click', closeSkillLibraryView\)/s)
  assert.match(html, /libraryViewList\.append\(row\)/)
  assert.doesNotMatch(html, /\.local-library'\)\?\.scrollIntoView/)
})

test('moves the Codex invoke command into the page header and makes it editable', () => {
  const topbar = html.match(/<header class="topbar">[\s\S]*?<\/header>/)[0]
  assert.match(topbar, /Codex 使用状态/)
  assert.match(topbar, /id="invokeInput"/)
  assert.match(topbar, /id="saveInvoke"/)
  assert.match(topbar, /id="copyInvoke"/)

  // 右侧栏不再保留这张卡片。
  assert.doesNotMatch(html, /class="card sync-card"/)
  assert.doesNotMatch(html, /sync-card \.codex-badge span:last-child/)

  assert.match(html, /const normalizeInvoke = \(value\) =>/)
  assert.match(html, /const invokeExists = /)
  assert.match(html, /function saveInvoke\(\)/)
  assert.match(html, /saveInvoke.*addEventListener\('click', saveInvoke\)/s)
  assert.match(html, /invokeInput.*addEventListener\('keydown'/s)
  assert.match(html, /invokeInput\.value = role\.invoke/)
  assert.match(html, /调用方式不能为空/)
  assert.match(html, /已被其它角色使用/)
})

test('drops the redundant page heading from the header', () => {
  const topbar = html.match(/<header class="topbar">[\s\S]*?<\/header>/)[0]
  assert.doesNotMatch(topbar, /<h1/)
  assert.doesNotMatch(topbar, />角色 Skill</)
  // 小标题和 Codex 使用状态保留。
  assert.match(topbar, /class="eyebrow">Role Skill Studio</)
  assert.match(topbar, /id="invokeInput"/)
  assert.doesNotMatch(html, /h1 \{ font-size: 25px/)
})

test('describes what the app does in the sidebar brand', () => {
  assert.match(html, /<strong>Skill Studio<\/strong><small>角色与 Skills 编排器<\/small>/)
  assert.doesNotMatch(html, /<small>角色 Skill 管理器<\/small>/)
  assert.match(html, /<title>Skill Studio · 角色与 Skills 编排器<\/title>/)
})

test('keeps role assignments when the same Skills live at a different path', () => {
  // 旧 id 形如 name-<hash>，hash 由文件路径算出，换台电脑就会变。
  assert.match(html, /function legacySkillName\(id\) \{ return String\(id\)\.replace\(\/-\[0-9a-f\]\{6,8\}\$\/, ''\); \}/)
  assert.match(html, /idByReference\.get\(item\.id\) \?\? idByReference\.get\(legacySkillName\(item\.id\)\)/)
  assert.match(html, /return canonicalId \? \{ \.\.\.item, id: canonicalId \} : \{ \.\.\.item \};/)
  assert.doesNotMatch(html, /return canonicalId \? \{ \.\.\.item, id: canonicalId \} : null;/)

  // 别名也要跟着迁移到新的 id。
  assert.match(html, /const remapAliases = \(skills\) => \{/)
  assert.match(html, /byName\.get\(legacySkillName\(key\)\)/)
  assert.match(html, /remapAliases\(localSkills\)/)
})

test('generates an orchestrator skill that can actually be routed to', () => {
  // 绝对路径要缩成 ~/... ，方便换电脑后仍然可读
  assert.match(html, /function shortSkillPath\(value\)/)
  assert.match(html, /\.replace\(\/\^\[A-Za-z\]:\\\\Users\\\\\[\^\\\\\]\+\/i, '~'\)/)

  // description 是 Codex 选择 Skill 的依据，必须带上编排的能力范围
  assert.match(html, /const roleAbilitySummary = \(role\) => \{/)
  assert.match(html, /当用户任务涉及这些能力时使用本 Skill/)
  assert.match(html, /const description = /)
  assert.match(html, /description: \$\{description\}/)

  // 明确职责边界，并给出每个子 Skill 的文件位置
  assert.match(html, /## 何时使用/)
  assert.match(html, /- 文件：/)
  assert.match(html, /shortSkillPath\(entry\.skill\.path\)/)

  // 导出与同步共用同一份模板
  assert.match(html, /const markdown = state\.markdown;/)
  assert.doesNotMatch(html, /const lines = state\.role\.skills\.map/)
})

test('provides a shortcut remove action on each assigned graph Skill', () => {
  assert.match(html, /skill-node-remove/)
  assert.match(html, /removeSkill\(skillId = currentSkillId\)/)
  assert.match(html, /window\.skillStudio\?\.removeSkill\(item\.id\)/)
  assert.match(html, /event\.stopPropagation\(\)/)
  assert.match(html, /setAttribute\('aria-label', `移除 \$\{skillName\}`\)/)
})

test('provides a remove action in the assigned Skill list', () => {
  assert.match(html, /assigned-skill-remove/)
  assert.match(html, /window\.skillStudio\?\.removeSkill\(item\.id\)/g)
  assert.match(html, /row\.append\(main, removeButton\)/)
  assert.match(html, /\.skill-list-view \{[^}]*min-width: 0/s)
  assert.match(html, /\.assigned-skill-row \{[^}]*min-width: 0/s)
})

test('keeps the sidebar Skill rows inside the card', () => {
  assert.match(html, /\.local-list \{[^}]*overflow-x: hidden/)
  assert.match(html, /\.local-skill-row \{[^}]*min-width: 0/)
  assert.match(html, /\.local-skill \{ flex: 1 1 auto; min-width: 0;/)
  assert.match(html, /\.local-skill-copy \{ min-width: 0; flex: 1 1 auto; overflow: hidden; \}/)
  assert.match(html, /\.local-skill span \{[^}]*max-width: 100%/)
  assert.match(html, /\.local-skill-add \{[^}]*flex: 0 0 auto/)
  assert.match(html, /\.local-skill-add \{[^}]*white-space: nowrap/)
  assert.match(html, /\.local-skill-add \{[^}]*align-self: center/)
  assert.match(html, /\.local-skill em \{[^}]*flex: 0 0 auto/)
  assert.match(html, /copy\.className = 'local-skill-copy'/)
})

test('lets the left sidebar collapse and remembers the choice', () => {
  // 收起按钮放在品牌行右上角，避免被主内容推到首屏之外。
  assert.match(html, /<div class="brand-copy">[\s\S]{0,80}?<button class="sidebar-toggle" id="sidebarToggle" type="button"[^>]*aria-expanded="true"/)
  assert.equal(html.split('id="sidebarToggle"').length - 1, 1)
  assert.match(html, /\.sidebar \{[^}]*position: sticky/s)
  assert.match(html, /\.sidebar \{[^}]*height: 100vh/s)
  assert.match(html, /\.brand-copy \{ flex: 1; min-width: 0; \}/)
  assert.match(html, /\.side-roles \{ flex: 0 0 auto; \}/)
  assert.match(html, /class="nav-icon"/)
  assert.match(html, /class="nav-text"/)
  assert.match(html, /class="new-role-icon"/)
  assert.match(html, /\.app\.collapsed \{ grid-template-columns: 68px 1fr; \}/)
  assert.match(html, /\.app\.collapsed \.nav-text \{ display: none; \}/)
  assert.match(html, /\.app\.collapsed \.role-copy \{ display: none; \}/)
  assert.match(html, /\.app\.collapsed \.brand-copy \{ display: none; \}/)
  assert.match(html, /\.app\.collapsed \.sidebar-toggle \{ width: 28px; height: 28px; \}/)
  // 旧的整行文字按钮已移除。
  assert.doesNotMatch(html, /sidebar-toggle-text/)

  assert.match(html, /const sidebarStorageKey = 'skill-studio-sidebar-collapsed'/)
  assert.match(html, /const sidebarToggle = document\.getElementById\('sidebarToggle'\)/)
  assert.match(html, /const applySidebarState = collapsed => \{/)
  assert.match(html, /sidebarToggle.*addEventListener\('click'/s)
  assert.match(html, /localStorage\.setItem\(sidebarStorageKey/)
  // 收起状态在启动时独立初始化，不再挂在 selectSkill 里。
  const selectSkillBody = html.match(/function selectSkill\(id\) \{[\s\S]*?\n    \}/)[0]
  assert.doesNotMatch(selectSkillBody, /applySidebarState/)
  assert.match(html, /applySidebarState\(sidebarCollapsed\);\n      sidebarToggle\?\.addEventListener/)
})

test('supports dragging graph Skills and persists custom positions', () => {
  assert.match(html, /setSkillPosition\(skillId, position\)/)
  assert.match(html, /pointerdown/)
  assert.match(html, /pointermove/)
  assert.match(html, /pointerup/)
  assert.match(html, /item\.position\?\.x/)
  assert.match(html, /window\.skillStudio\?\.setSkillPosition\(item\.id, \{ x, y \}\)/)
})

test('opens the aliased Skill details when a graph node is clicked without dragging', () => {
  assert.match(html, /startedOnMain: Boolean\(event\.target\.closest\('\.skill-node-main'\)\)/)
  assert.match(html, /if \(!finished\.moved && finished\.startedOnMain\) openSkill\(skill\)/)
  assert.match(html, /event\.detail === 0.*openSkill\(skill\)/s)
})

test('supports local Skill aliases across views and lets users save a custom alias', () => {
  assert.match(html, /id="skillAlias"/)
  assert.match(html, /id="saveSkillAlias"/)
  assert.match(html, /skill-studio-aliases-v1/)
  assert.match(html, /const getSkillAlias = \(skill\)/)
  assert.match(html, /getSkillAlias\(skill\)/g)
  assert.match(html, /localStorage\.setItem\(aliasStorageKey/)
})

test('loads and persists role state through the local service', () => {
  assert.match(html, /function hydrateRoles\(serverRoles\)/)
  assert.match(html, /queuePersistence\('\/api\/roles'/)
  assert.match(html, /window\.skillStudio\?\.hydrateRoles\(payload\.roles\)/)
  assert.match(html, /serverRoles.*clientRoles/s)
})

test('persists aliases and sync history in the local state file', () => {
  assert.match(html, /queuePersistence\('\/api\/state'/)
  assert.match(html, /persistState\?\.\(\{ skillAliases \}\)/)
  assert.match(html, /persistState\(\{ syncHistory \}\)/)
  assert.match(html, /skill-studio-state-loaded/)
  assert.match(server, /const stateFile/)
})

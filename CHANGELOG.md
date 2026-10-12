# 更新日志

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)，格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [Unreleased]

## [0.1.0] - 2026-10-12

第一个公开版本。

### 新增

- 角色管理：新建、切换、修改说明、删除；删除时可以顺带回收已同步出去的 `SKILL.md` 目录。
- Skill 赋予：从本机扫描到的真实 `SKILL.md` 里挑选，支持移除与重复校验。
- 关系图：以角色为中心的环绕布局，节点可以拖到自定义位置，位置随角色保存。
- 启用模式：核心 / 按需，写进生成的角色 Skill，供 Codex 判断调用优先级。
- Skill 别名：给英文 Skill 起中文名，关系图、列表、Skill 库统一显示别名。
- 调用指令：可编辑的 `$xxx`，重名和空值会被拦下。
- 导出与同步：预览、导出 `<调用指令>.SKILL.md`，或直接写入 Codex 的 Skill 目录。
- 知识库：支持指定目录和上传文件，同步时一起复制到角色目录。
- 角色默认规范约束：写进角色 Skill 的通用规则。
- 跨机器迁移：Skill 换路径后按名字重新对上原有分配关系。
- 界面：左侧栏可收起并记住状态，滚动条统一隐藏。
- 桌面应用：Node SEA 单文件服务 + Rust/WebView2 外壳，双击即用。
- 离线预览：直接用浏览器打开 `index.html` 即可查看界面。

### 修复

- 打开应用时右侧面板会停在「尚未选择 Skill」，与已赋予的 Skill 不一致。
- 删除角色时遗留本地知识库副本，`data/knowledge/<角色 ID>/` 再也不会被访问到。
- 离线预览下点「同步到 Codex」会同时提示「已标记为 Codex 可用」和「不能写入目录」。

### 说明

- 界面为原生 HTML/CSS/JS 单文件，无构建步骤；本地服务无运行时依赖。
- 所有数据只写在本机，不联网、不上传。

[Unreleased]: https://gitee.com/dqhm/skill-studio/compare/v0.1.0...HEAD
[0.1.0]: https://gitee.com/dqhm/skill-studio/releases/tag/v0.1.0

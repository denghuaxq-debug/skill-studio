# Skill Studio

把散落在 `~/.agents/skills`、`~/.codex/skills` 里的 Codex Skill 编排成「角色 Skill」，再一键同步回 Codex 的 Skill 目录。

一句话：**先给角色配好能力，之后一句 `$角色名` 就能把整套能力调起来。**

[![star](https://gitee.com/dqhm/skill-studio/badge/star.svg?theme=dark)](https://gitee.com/dqhm/skill-studio/stargazers)
[![fork](https://gitee.com/dqhm/skill-studio/badge/fork.svg?theme=dark)](https://gitee.com/dqhm/skill-studio/members)

MIT License · Node.js ≥ 22 · Windows 10/11（桌面版）

> 本地工具：不联网、不上传任何数据，所有内容只写在本机。

![界面总览](docs/images/overview.png)

## 它解决什么问题

Skill 一多就会遇到三个麻烦：

1. 记不住有哪些 Skill、每个是干什么的 —— 英文目录名点进去才知道内容。
2. 每次都要在提示词里手写「先用 A，再用 B，最后用 C」，写得长还容易漏。
3. 同一个人要在多个身份之间切换（后端开发 / 竞品调研 / 发版），每次都得重复交代一遍上下文。

Skill Studio 把「一组 Skill + 使用方式 + 约束 + 事实来源」固化成一个角色，角色本身就是一个能被 Codex 识别的 Skill。之后只需要 `$java-backend` 这样的调用指令，Codex 就会带着这套编排去干活。

## 核心概念

| 概念 | 说明 |
| --- | --- |
| 角色 Skill | 最终同步给 Codex 的 Skill，内部负责调度若干子 Skill |
| 子 Skill | 从本机目录扫描到的真实 `SKILL.md`，只被引用，不会被复制或改写 |
| 启用模式 | `核心`（优先调用）与 `按需`（匹配任务时才调用） |
| 别名 | 给英文 Skill 起中文名，列表和关系图里显示别名，英文原名保留在说明中 |
| 知识库 | 给角色挂一个目录或上传文件，同步时一起带到角色目录旁边 |
| 默认规范约束 | 这个角色每次干活都要遵守的规则，写进生成的角色 Skill |

## 功能

- **角色管理**：新建、切换、删除；删除时可选择同时回收已同步出去的 `SKILL.md` 目录。
- **关系图**：以角色为中心的环绕布局，节点可拖到自定义位置，位置会被记住。
- **Skill 库**：扫描本机 Skill 根目录，支持搜索、起别名、一键赋予或移除。
- **调用指令**：`$java` 这类唤起指令可直接编辑，留空或重名会被拦下。
- **导出与同步**：生成编排用的 `SKILL.md`，支持先预览再导出；同步会写入 Codex 的 Skill 目录。
- **知识库**：指定目录或上传文件，两者都可以附上「以什么为准」的说明。
- **跨机器**：换台电脑后 Skill 路径会变，界面按名字重新对上原有分配关系，不用重配。
- **界面**：左侧栏可收起并记住状态，滚动条统一隐藏。

## 快速开始

### 方式一：离线预览（零依赖）

直接用浏览器打开 `index.html`。此模式加载 `offline-skills.js` 里的示例快照，只用来查看界面，不能写入 Codex 目录。

### 方式二：本地服务（推荐开发调试）

```bash
npm install
npm run client
# 打开 http://127.0.0.1:4173/
```

服务启动后实时扫描本机 Skill 目录，改完界面刷新即可生效。

### 方式三：打包成 Windows 桌面应用

```bash
npm install
npm run build:app
```

产物在 `SkillStudio/`：

| 路径 | 说明 |
| --- | --- |
| `SkillStudio.exe` | 应用窗口程序（Rust + WebView2），双击启动 |
| `service/SkillStudio.exe` | 本地服务（Node 单文件 exe），由窗口程序自动拉起 |
| `data/state.json` | 角色、别名、同步记录 |

行为说明：

- 打开的是应用自己的窗口，不会跳浏览器，也不会闪命令行窗口。
- 关闭窗口时后台服务一起结束，不留残留进程。
- 端口被占用时自动顺延；已有实例在跑时重复双击只会再开一个窗口。

构建依赖：Rust 工具链 + WebView2 运行时（Windows 10/11 一般自带）。

## 界面速览

| 新建角色 | 赋予 Skill |
| --- | --- |
| ![新建角色](docs/images/new-role.png) | ![赋予 Skill](docs/images/skill-picker.png) |

| 调整 Skill 配置 | 知识库 |
| --- | --- |
| ![Skill 详情](docs/images/inspector.png) | ![知识库](docs/images/knowledge.png) |

| 导出预览 | 删除角色 |
| --- | --- |
| ![导出预览](docs/images/export-preview.png) | ![删除角色](docs/images/delete-role.png) |

## 文档

| 文档 | 内容 |
| --- | --- |
| [使用指南](docs/usage.md) | 从扫描到同步的完整操作流程，含每个界面的说明 |
| [常见问题](docs/faq.md) | 扫不到 Skill、同步位置、换电脑、数据迁移等 |
| [开发说明](docs/development.md) | 架构、数据流、代码导航、打包原理、发版流程 |
| [贡献指南](CONTRIBUTING.md) | 环境准备、代码约定、提交与 PR 规范 |
| [更新日志](CHANGELOG.md) | 版本变更记录 |
| [安全说明](SECURITY.md) | 本地工具的安全边界与报告方式 |

## 目录结构

```text
.
├── index.html                单文件界面（HTML + CSS + JS，无构建步骤）
├── offline-skills.js         离线预览用的 Skill 快照，由 npm run snapshot 生成
├── src/backend/
│   ├── server.js             开发模式入口
│   ├── studioServer.js       HTTP 服务与 API
│   ├── skillScanner.js       扫描并解析 SKILL.md
│   └── exeRuntime.js         数据目录 / 端口 / Skill 根目录解析
├── build/
│   ├── desktop/              Rust + WebView2 桌面外壳
│   ├── exe/                  Node SEA 单文件服务
│   ├── snapshot-offline.mjs  生成 offline-skills.js
│   └── screenshots.mjs       重新生成文档截图
├── tests/                    node:test 测试
├── docs/                     文档与截图
└── data/
    └── state.example.json    示例数据（真实数据不会提交）
```

## 同步出来的 Skill 长什么样

点击「同步到 Codex」后，会在 `~/.agents/skills/<角色 ID>/SKILL.md` 写入类似内容：

```markdown
---
name: java-backend
description: 负责 Spring Boot 接口开发、测试和代码审查。本角色编排了 2 项能力：API 接口设计、测试驱动开发。当用户任务涉及这些能力时使用本 Skill。
---

# Java 后端工程师

你是「Java 后端工程师」角色 Skill：理解用户任务，组织下面的子 Skill 完成工作，并汇总出可验证的结果。

## 何时使用

- 任务需要下列任一能力时，用本角色 Skill 统筹，并按需读取对应子 Skill 的内容后再动手。
- 任务与本角色的能力范围无关时，直接说明并正常处理，不要硬套本角色的流程。

## 可调度的 Skills

- **API 接口设计**（核心能力）：设计一致的 REST 接口……
  - 文件：`~/.agents/skills/api-design/SKILL.md`
- **测试驱动开发**（按需调用）：先写会失败的测试，再实现……

## 默认规范约束

- 接口变更先补测试，再实现功能
- 所有外部输入必须校验，禁止硬编码密钥
```

`description` 会带上角色编排的能力范围，这是 Codex 判断「该不该用这个 Skill」的依据。

## 环境变量

| 变量 | 作用 | 默认值 |
| --- | --- | --- |
| `SKILL_STUDIO_PORT` | 本地服务端口 | `4173` |
| `SKILL_STUDIO_DATA_DIR` | 角色数据目录 | 开发模式为 `data/`，exe 为同级 `data/` |
| `CODEX_SKILL_TARGET` | 同步写入的目标目录 | `~/.agents/skills` |
| `SKILL_STUDIO_NO_OPEN` | 设为 `1` 时不自动打开浏览器 | 空 |
| `SKILL_STUDIO_OUTPUT` | 打包输出目录 | 仓库同级的 `SkillStudio/` |

## 数据与隐私

- 所有数据都留在本机：角色与别名在 `data/state.json`，上传的知识文件在 `data/knowledge/<角色 ID>/`。
- 「同步到 Codex」只写 `CODEX_SKILL_TARGET` 指向的目录，不会动其它位置；删除角色时也只回收该目录下的同名子目录。
- 扫描是只读的，子 Skill 永远不会被修改。
- 仓库里只提交 `data/state.example.json` 示例文件，真实的 `data/state.json`、`data/knowledge/` 已在 `.gitignore` 中排除。

## 开发

```bash
npm test                           # 界面结构 + 服务端 + 角色模型 + 扫描器
cd build/desktop && cargo test      # 桌面外壳单元测试
npm run snapshot                    # 按本机 Skill 目录重新生成离线快照
npm run snapshot -- <dir> ...       # 指定目录生成快照
npm run screenshots                 # 重新生成 docs/images 里的界面截图
```

改代码前建议先读 [开发说明](docs/development.md)，尤其是 `index.html` 里三段脚本的作用域划分。

## 贡献

欢迎提 Issue 和 PR，流程与代码约定见 [贡献指南](CONTRIBUTING.md)。参与即表示同意 [行为准则](CODE_OF_CONDUCT.md)。

## 许可

[MIT](LICENSE) © 2026 dengqianghua

---

**English** — Skill Studio turns the Codex skills already on your machine (`~/.agents/skills`, `~/.codex/skills`) into reusable *role skills*: pick a set of skills, decide which are core, add a name and a `$invoke` command, then sync the generated `SKILL.md` back into your Codex skill directory. Everything runs locally — a single-file HTML UI, a small Node service, and an optional Rust + WebView2 desktop shell.

# 贡献指南

感谢愿意帮忙。这个项目不大，流程尽量简单。

## 先看看有没有人在做

动手前先在 [Issues](https://gitee.com/dqhm/skill-studio/issues) 里搜一下，避免重复。要做的改动比较大的话，先开个 issue 说清楚想法，比直接提一大坨 PR 更容易合。

## 环境准备

- Node.js 22 以上（用到内置 `fetch`、`WebSocket` 和 SEA）
- 只有改桌面外壳时才需要 Rust 工具链

```bash
git clone https://gitee.com/dqhm/skill-studio.git
cd skill-studio
npm install
npm test
```

想看界面直接浏览器打开 `index.html`（离线预览）；要能同步就得 `npm run client`。

## 改代码

建议的分工思路：

- 界面改动：只动 `index.html`，改完刷新页面就能看到。
- 服务端或扫描逻辑：动 `src/`，用 `npm run client` 调试。
- 打包或外壳：动 `build/`，跑 `npm run build:app` 验证。

几条硬性约定（详细原因见 [开发说明](docs/development.md)）：

- 服务端只用异步 `node:fs`，因为要打进 SEA 单文件 exe。
- `index.html` 里有三段独立作用域的脚本，跨段调用要走 `window.skillStudio` 或自定义事件。
- 文案和注释统一用中文，跟现有风格保持一致。
- 不引入运行时依赖。界面保持无构建步骤，服务端只用 Node 内置模块。

## 测试

提交前必须跑通：

```bash
npm test
cd build/desktop && cargo test    # 改了 Rust 外壳才需要
```

改了行为就补测试。测试怎么写的说明在 [开发说明](docs/development.md#测试)。

## 提交信息

用 [Conventional Commits](https://www.conventionalcommits.org/)：

```text
<type>: <描述>
```

| type | 用途 |
| --- | --- |
| `feat` | 新功能 |
| `fix` | 修 bug |
| `refactor` | 重构，不改变行为 |
| `docs` | 只改文档 |
| `test` | 只改测试 |
| `chore` | 构建、依赖、杂项 |
| `perf` | 性能优化 |

示例：

```text
feat: 支持给角色挂知识库目录
fix: 目录就绪前选中 Skill 导致右侧面板空白
docs: 补充跨机器迁移的说明
```

描述用中文，一句话说清改了什么，不要写 "update code" 这种。

## 提 PR

1. 从 `main` 切一个分支，名字可以是 `feat/知识库`、`fix/面板空白` 这种。
2. 一个 PR 只做一件事，别把无关改动混进来。
3. PR 描述里写清：改了什么、为什么这么改、怎么验证的（贴命令或截图）。
4. 界面的改动建议带一张改动后的截图。

提交时会被 pre-push 钩子跑一遍校验，本地测试没过的话钩子会拦下来。

## 不要提交这些

`.gitignore` 已经排除，但别用 `-f` 强推：

| 路径 | 原因 |
| --- | --- |
| `data/state.json` | 真实角色数据，属于个人环境 |
| `data/knowledge/` | 上传的知识文件，可能含私有内容 |
| `SkillStudio/` | 打包产物，一百多 MB |
| `build/.work/`、`build/desktop/target/` | 中间产物 |
| `node_modules/` | 依赖 |

同时注意别把本机路径、公司内部项目名、密钥写进代码或截图。

## 报告问题

用 [Issue 模板](.gitee/ISSUE_TEMPLATE.zh-CN.md) 提，尽量带上：

- 系统版本、Node 版本、是桌面版还是 `npm run client`
- 复现步骤，越具体越好
- 期望结果和实际结果
- 报错信息或截图（截图前注意打码私有内容）

## 行为准则

参与本项目即表示同意遵守 [行为准则](CODE_OF_CONDUCT.md)。

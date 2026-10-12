# 开发说明

面向要改代码的人。使用层面的内容见 [使用指南](usage.md)。

## 技术栈

刻意选得很保守，几乎没有工具链负担：

| 层 | 技术 | 说明 |
| --- | --- | --- |
| 界面 | 单个 `index.html`（原生 HTML/CSS/JS） | 没有构建步骤，改完刷新即可 |
| 本地服务 | Node.js（ESM，无运行时依赖） | 只用 `node:http` / `node:fs` |
| 桌面外壳 | Rust（tao + wry / WebView2） | 负责开窗口、拉起服务、退出时收尾 |
| 打包 | esbuild + Node SEA + postject | 服务端打成一个 exe，用户不需要装 Node |

运行环境要求 Node.js 22 以上（用到内置 `fetch`、`WebSocket` 和 SEA）。

## 目录与职责

```text
.
├── index.html                 界面全部内容：样式、结构、三段脚本
├── offline-skills.js          离线预览用的 Skill 快照（生成物）
├── src/backend/
│   ├── server.js              开发模式入口：拼参数、起服务
│   ├── studioServer.js        HTTP 服务：路由、状态存储、同步写入
│   ├── skillScanner.js        扫描目录、解析 SKILL.md 的 frontmatter
│   └── exeRuntime.js          数据目录候选、端口顺延、可写探测
├── build/
│   ├── desktop/               Rust 桌面外壳 + 打包脚本
│   ├── exe/                   Node SEA 单文件服务打包
│   ├── snapshot-offline.mjs   生成 offline-skills.js
│   └── screenshots.mjs        用示例数据重新生成文档截图
└── tests/                     node:test 测试
```

## 请求与数据流

```text
启动
  ├─ 解析数据目录（exe 同级 data/ → %APPDATA% → ~/.skill-studio）
  ├─ 解析 Skill 根目录（~/.agents/skills、~/.codex/skills、启动目录旁 .agents/skills）
  └─ 监听端口（被占用就顺延）

界面加载
  └─ GET /api/bootstrap
       ├─ skills       扫描结果（id / name / description / path / body）
       ├─ roles        角色与已赋予的 Skill
       ├─ skillAliases 别名
       └─ syncHistory  同步记录

同步
  └─ POST /api/roles/<角色 ID>/sync  { markdown }
       ├─ 写 <目标目录>/<角色 ID>/SKILL.md
       └─ 复制 data/knowledge/<角色 ID>/ → <目标目录>/<角色 ID>/knowledge/
```

### Skill ID 与跨机器迁移

Skill 的 ID 是 `名字-哈希`，哈希由 `SKILL.md` 的绝对路径算出（FNV-1a，见 `skillScanner.js`）。换台电脑后路径变了，ID 就会变。

为了不丢配置，`setCatalog` 会建一张 `id → id` 和 `name → id` 的对照表，把角色里存的旧 ID 重新映射成新 ID；认不出来的 ID 会原样保留，不会静默删除。

## 界面代码的三个脚本块

`index.html` 里有三段独立脚本，改代码前先看清作用域，否则很容易踩坑：

| 脚本块 | 作用域 | 主要职责 |
| --- | --- | --- |
| 第一段 | 顶层 | 详情面板的默认占位 `selectSkill` |
| 第二段 | IIFE，导出 `window.skillStudio` | 角色状态、目录、关系图、导出与同步 |
| 第三段 | IIFE，无导出 | 本地 Skill 列表、别名、导出预览、服务端交互 |

第二段和第三段**不共享作用域**，`getSkillDisplayName` 这类工具只在第三段里。跨段调用要走 `window.skillStudio` 或自定义事件（`skill-studio-skill-selected`、`skill-studio-role-rendered` 等）。

同样地，`selectSkill` 和 `syncRole` 这类名字在两段里各有一个，改动时确认打到了哪一处。

别名要显示成中文，就必须在传给 `setCatalog` 之前算好：第二段拿不到别名表，所以第三段的 `applySkills` 会补上 `displayName` / `displayDesc` 再传进去。

## 改代码时的几条约定

- **服务端只用异步 `node:fs`**。因为要打进 SEA 单文件 exe，同步 API 会有兼容问题。
- **不要给 `build/exe/launcher.js` 加 `import.meta`**，它会被编译成 CommonJS。
- **界面文案统一中文**，注释也用中文，和现有风格保持一致。
- **`build/desktop/tools/prepare-logo.ps1` 必须保持纯 ASCII**，否则 Windows PowerShell 5.1 会按 ANSI 读，中文会乱码。
- **不要提交** `data/state.json`、`data/knowledge/`、`SkillStudio/`、`build/.work/`、`build/desktop/target/`，`.gitignore` 已经排除。

## 测试

```bash
npm test                        # 界面结构 + 服务端 + 角色模型 + 扫描器
cd build/desktop && cargo test   # 桌面外壳
```

界面测试的做法是直接读 `index.html` 做静态断言（正则匹配关键结构），好处是零依赖、跑得快，代价是改动结构时要同步改断言。服务端和扫描器测试用真实的临时目录 + 真实的 HTTP 请求。

加新功能时优先补两种测试：

1. 纯逻辑（角色操作、frontmatter 解析）→ 直接测函数。
2. 界面行为 → 在 `tests/unlimited-skills-ui.test.js` 里加静态断言，锁住关键 DOM 结构与事件绑定。

## 打包

```bash
npm run build:app     # 服务端 exe + Rust 外壳
npm run build:exe     # 只重打服务端 exe
```

`build:app` 做三件事：

1. esbuild 把 `launcher.js` 打成一个 CommonJS 文件，`index.html` 和 `offline-skills.js` 以内联文本塞进去；
2. 用 Node 的 SEA 生成 blob，再用 postject 注入 Node 运行时，产出 `service/SkillStudio.exe`；
3. 编译 Rust 外壳、写入多尺寸图标，产出 `SkillStudio.exe`。

产物目录：

```text
SkillStudio/
├── SkillStudio.exe            外壳，双击启动
├── service/SkillStudio.exe    本地服务，外壳自动拉起
├── data/state.json            角色数据
└── 使用说明.txt
```

外壳只认同级的 `service/SkillStudio.exe`，所以这两个文件不能拆开。

## 文档截图

`docs/images/` 里的截图由脚本生成，不要手工截图替换：

```bash
npm run screenshots
```

它的做法是：在临时目录里造一份假 Skill（`api-design` / `tdd-workflow` / `security-review`）、种一份示例角色，起一个只服务这份数据的本地服务，然后用 DevTools 协议驱动无头浏览器逐场景截屏。

两个细节值得注意：

- API 响应里的 Skill 路径会被替换成 `~/.agents/skills/...`，所以截图里不会出现本机的临时目录；
- 需要本机有 Chromium 内核的浏览器，脚本按 `CHROME_PATH` → Playwright 缓存 → 系统 Chrome/Edge 的顺序查找，选缓存里最新的版本。

改了界面之后重跑一次，`docs/` 和 README 里的图会自动更新。

## 图标

图标集中在 `build/desktop/assets/`。换图后执行：

```bash
powershell -ExecutionPolicy Bypass -File build/desktop/tools/prepare-logo.ps1
```

脚本会恢复透明通道、导出 16/24/32/48/64/128/200 七个尺寸，并把 96px 版本以内联 base64 写回 `index.html`（即界面左上角的标识）。

## 环境变量

| 变量 | 作用 | 默认值 |
| --- | --- | --- |
| `SKILL_STUDIO_PORT` | 本地服务端口 | `4173` |
| `SKILL_STUDIO_DATA_DIR` | 数据目录 | 开发模式为 `data/`，exe 为同级 `data/` |
| `CODEX_SKILL_TARGET` | 同步写入的目标目录 | `~/.agents/skills` |
| `SKILL_STUDIO_NO_OPEN` | 设为 `1` 时不自动打开浏览器 | 空 |
| `SKILL_STUDIO_OUTPUT` | 打包输出目录 | 仓库同级的 `SkillStudio/` |
| `SKILL_STUDIO_SHELL_NAME` | 外壳 exe 名称 | `SkillStudio.exe` |
| `SKILL_STUDIO_EXE_NAME` | 服务 exe 名称 | `SkillStudio.exe` |

## 发版流程

1. 改 `package.json` 和 `build/desktop/Cargo.toml` 里的版本号。
2. 在 [CHANGELOG.md](../CHANGELOG.md) 顶部补一节。
3. 跑 `npm test`、`cargo test`、`npm run build:app`，确认打包通过并且应用能起来。
4. 提交、打 tag、推送。

# 常见问题

## 离线预览和本地服务有什么区别？

| | 离线预览（直接打开 index.html） | 本地服务 |
| --- | --- | --- |
| 看界面 | 可以 | 可以 |
| Skill 列表 | 读 `offline-skills.js` 里的快照 | 实时扫描本机目录 |
| 读 `SKILL.md` 全文 | 不行（快照只有元数据） | 可以 |
| 上传知识文件 | 不行 | 可以 |
| 同步到 Codex | 不行 | 可以 |

离线预览只用来看界面和截图，改完页面刷新即可。真正要用请启动本地服务或桌面应用。

## 本地 Skill 库是空的或数量不对

按顺序检查：

1. 是在离线预览里吗？离线模式只认 `offline-skills.js`，先启动本地服务。
2. 你的 Skill 放在 `~/.agents/skills` 或 `~/.codex/skills` 吗？放在别处不会被扫到（可以用 `npm run snapshot -- <目录>` 手动生成快照看效果）。
3. Skill 目录里有没有 `SKILL.md`？扫描只看名为 `SKILL.md` 的文件，且要求文件头是 YAML frontmatter 并且包含 `name` 和 `description`。缺少这两项的文件会被跳过，不会让整个库失败。
4. 改完文件后刷新页面即可，本地服务是按请求实时读取的。

## 同步到 Codex 之后，怎么在 Codex 里用起来？

同步完成后，Skill 会出现在 Codex 的 Skill 目录里。回到 Codex 输入调用指令即可，例如顶部配置的 `$java-backend`。

调用指令和同步出来的 `SKILL.md` 里的 `name` 是同一个值，所以两处永远一致。

## 同步会改我原来的 SKILL.md 吗？

不会。子 Skill 只被读取，不会被复制或改写。同步只做两件事：

1. 在目标目录下新建（或覆盖）`<角色 ID>/SKILL.md`；
2. 如果知识库里有上传的文件，复制到同目录的 `knowledge/`。

## 我把角色改名了，再同步会在 Codex 里留下重复的吗？

不会。同步目录用的是角色 ID，而不是显示名称，改名不改变 ID，所以始终是同一个目录。同理，重复点「同步到 Codex」也是覆盖同一个文件。

## 删除角色会删掉什么？

分两种：

- 勾选「同时删除已同步到 Codex 的 Skill 文件」（默认）：删掉本地角色配置，并回收 `~/.agents/skills/<角色 ID>/` 整个目录。
- 取消勾选：只删本地角色配置，同步出去的文件留在原处。

删除不可撤销。

本地数据目录里这个角色上传过的知识文件（`data/knowledge/<角色 ID>/`）会一并清理，不用手动收拾。已经同步出去的那份 `knowledge/` 副本，则跟随上面那个勾选项。

## 换电脑之后，角色里的 Skill 分配还在吗？

在。Skill 的 ID 里带有按文件路径算出的哈希，换机器后路径变了 ID 也会变，但界面会按 Skill 名字把旧 ID 重新映射到新 ID，所以分配关系保留。

如果某个 Skill 在新机器上确实不存在，配置会原样保留（不会悄悄删掉），只是显示不出来。

## 数据存在哪？怎么备份或迁移？

都在本地数据目录：

| 路径 | 内容 |
| --- | --- |
| `data/state.json` | 角色、别名、同步记录、调用指令 |
| `data/knowledge/<角色 ID>/` | 知识库上传的文件 |

桌面版的 `data/` 在 `SkillStudio.exe` 同级的 `data` 目录。整个目录复制走即可迁移；也可以用 `SKILL_STUDIO_DATA_DIR` 指定到别处（比如放进网盘同步目录）。

## 端口 4173 被占用了怎么办？

本地服务会自动往后顺延端口（最多试 12 个）。想固定端口，启动前设置 `SKILL_STUDIO_PORT`：

```bash
SKILL_STUDIO_PORT=5000 npm run client
```

Windows PowerShell 里用 `$env:SKILL_STUDIO_PORT = '5000'`。

## 桌面版双击没反应 / 提示找不到服务文件

`SkillStudio.exe` 需要和同级的 `service/SkillStudio.exe` 放在一起。只把主程序拷走会启动失败。重新执行 `npm run build:app` 可以生成完整目录。

## 支持 macOS / Linux 吗？

界面和本地服务是纯 Node + 标准 Web 技术，本身跨平台；离线预览和 `npm run client` 在任何系统上都能跑。

桌面外壳（`SkillStudio.exe`）目前只有 Windows 实现，用的是 Rust + WebView2。要在别的系统上做同样的事，需要补一个对应的外壳。

## 同一个 Skill 能给多个角色用吗？

可以。Skill 只被引用，不会被复制，所以一个 Skill 可以同时出现在多个角色的编排里，互不影响。

别名是全局的：给某个 Skill 起了中文名，所有引用它的地方都显示同一个别名。

## 怎么给一批 Skill 预先起好中文名？

在数据目录建一个 `alias-presets.json`，按 Skill 名字写中文名：

```json
{
  "my-internal-tool": "内部工具",
  "my-release-bot": "发版机器人"
}
```

界面加载时会把它当默认别名，你在界面上设过的别名优先。因为按名字匹配，换台电脑后 Skill 的 id 变了也照样生效。

这个文件只在你的数据目录里，不会进版本库，也不会被同步到 Codex——适合给不想公开的 Skill 起名字。

## Skill Studio 会改动我本机的其它 Skill 吗？

不会。扫描是只读的，子 Skill 的内容和位置都不会被修改。

唯一的写操作是同步：在目标目录下新建或覆盖与角色 ID 同名的子目录。要恢复也很简单，把那个目录删掉即可。

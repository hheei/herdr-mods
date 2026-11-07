# CC Switch × Herdr：可行性与边界

状态：`mods/agent-manager/` 已实现双向 Skills 文件同步、来源分类/冲突选择、缺失 Linux 命令的 MCP 定义仅入库，以及四 Agent 的 Global/MCP 部署，以及 Project Claude/Codex/Pi/通用 Skills 部署。隔离 HOME/假 `hc` 本地测试通过；早前版本已在 macOS Herdr GUI 实机显示且 `herdr-app status` 无错误，Judy→Mac 私有临时目录的实际 Herdr 文件传输通过。真实项目的 Agent 加载、MCP 入库及 live 配置部署仍待实机验收。调查基线：Herdr App `207dbdcc59e941fc127a6280dbd646421e67b539`，CC Switch v4.0.26 `f621d4216189ef06bcc6acd3588c84937b9794e1`。

## 已实现范围

1. **主机/路由**：Mac 运行 Herdr App，Linux 运行目标 Agent。`focused().space` 对应的 `spaces().machine` 是唯一目标别名；没有远端 Workspace 时禁止写入。不额外发明 SSH alias 或直接用 SSH 替代 Herdr。`hc exec --on` 执行命令，`hc file write --on` 传私有临时文件。
2. **Skills 原库**：枚举 Mac 与所选远端各自 `~/.cc-switch/skills/`，按内容哈希匹配；双端都有显示同步 SVG，远端独有项显示下载；Mac 独有与远端 Agent 独有 Skills 从 **Import** 弹窗逐项复制到资源库，主列表不再按远端状态分组；此操作只复制 Skills 文件，不登记 CC Switch 数据库。同名异内容先弹窗让用户选择来源，转移前二次比对哈希并备份旧版；**资源库内容**拒绝软链。即使 CC Switch 配置 `~/.agents/skills/` 作为统一目录，本 Mod 仍**不读写用户全局该目录的内容**。资源库同步与 Agent 技能部署分开；Project Skills 分别写入 `.claude/skills/`、`.codex/skills/`、`.pi/skills/`、`.agents/skills/`，Global 才按 Agent 各自的 `skills/` 目录部署，停用保留备份。现有 Global Skill 分 CC Switch 原生管理与外部目录；外部 Skill 只能通过显式接管（先备份）转为本 Mod 受管。外部 Agent 软链接管只备份/恢复该链接，不复制或删除链接目标。
3. **MCP**：读取本机 `~/.cc-switch/cc-switch.db` 的 MCP 名称与选中条目的 `server_config`，不复制整个数据库；`node_repl` 仅从 Manager 排除，本机 CC Switch 条目不删。按表格单元格启用/停用，目标分别是 Claude `~/.claude.json`、Codex `~/.codex/config.toml`、Pi `~/.pi/agent/mcp.json`、Antigravity `~/.gemini/config/mcp_config.json`。Mac 绝对命令或 `cwd` 在 Linux 不存在时，只将 MCP 定义插入远端**现有** CC Switch 数据库，启用标志默认为零，不写 Agent live 配置；同 id 异内容拒绝覆盖。现有同名非受管服务器与外部修改均拒绝覆盖；原文件事先备份；受管状态只存 ID/哈希。源里允许自己机器间传凭据，但私有文件权限为 0600，密钥不进入 CLI 参数或 UI 状态。
4. **Workspace Project / Global 分离**：Workspace `space.folder`（为空时使用同一 Workspace 内聚焦终端的绝对 `cwd`）是远端项目目录，`machine` 是 Host；默认 Project，点击文字按钮切回 Global。缺失的项目配置与 Skill 目录首次启用时才创建。Agent Manager 是顶部 Files／Changes 旁的可收合面板，不再是布局根级常驻侧栏；个人布局通过 `scripts/agent-manager-panel.cjs` 备份并迁移，内置 Tabs Mod 不修改。项目配置与全局配置、其他项目互不覆盖；Provider、Prompt 仍未实现。本版不调用上游云同步或 rsync，不修改用户全局 `~/.agents/skills/`；远端 `cc-switch.db` 只在 MCP 命令不适配 Linux 时插入未启用的定义。

Skill 状态框为空框/`~`/`✓`，分别表示未部署、软链、复制；默认软链，右键状态框在软链与复制间切换。左键 Skill 名称只读预览远端 `SKILL.md`，右键名称可确认移除远端资源库副本，保留私有备份且不更改 Mac 副本。远端 CC Switch 数据库登记或已知 Agent 在用时拒绝删除；尚未被 Manager 记录的其他 Project 目录无法自动探测。

## Project 落点与凭据

- Project Skills 四列独立：Claude `<workspace>/.claude/skills/`，Codex `<workspace>/.codex/skills/`，Pi `<workspace>/.pi/skills/`，通用 `<workspace>/.agents/skills/`。Project Antigravity Skills 不可单独部署，Global 不显示通用；旧 Shared 受管记录保留在通用列。Codex 官方默认只列项目 `.agents/skills/`，Pi 也支持它；独立 `.codex/skills/`、`.pi/skills/` 是否实际加载需另行验证/配置，UI 只反映文件部署状态。Project MCP 仍分 Agent：Claude `.mcp.json`、Codex `.codex/config.toml`、Pi `.pi/mcp.json`、Antigravity `.agents/mcp_config.json`。Global Skills 保持四 Agent 专属目录；项目 `.agents/skills/` **不同于用户全局** `~/.agents/skills/`。
- 选中 MCP 的 stdio `env` 值写到项目 `.env` 的受管块，项目配置仅引用无密钥的启动器；启动器明确读取 `.env` 再执行原始命令。若 `.env` 已被 Git 跟踪则拒绝部署；否则 Git 项目自动补 `.gitignore`。不假设 Agent 会自行加载 `.env`。Project HTTP 的内联 headers 尚无统一可靠的安全加载方式，因此拒绝写入带 headers 的服务器；无凭据 HTTP 可部署。
- Project 配置、Skills 与 `.env` 的备份位于用户私有 `~/.config/herdr-app/agent-manager/backups/`，不写入仓库。Project Skills 与 MCP 均按 Workspace/Agent/资源 ID 保存受管哈希；同名非受管项、被外部修改的项目配置/`.env` 及配置文件软链拒绝覆盖；受管 Skill 目标软链支持备份与模式切换。

## 技术依据与验收

- Herdr `writeTextFile` 不支持 `on`；`hc file write --on` 可写单个文件，`hc exec --on` 可在远端运行写入指令。`mods/project-open/main.js` 的 `target()` 提供 Workspace 取别名模式。依据：`herdr-app/defaults/herdr.d.ts`、`herdr-app/docs/security.md`。
- CC Switch 默认 Skill 主副本可放 `~/.cc-switch/skills/`，也可指向 `~/.agents/skills/`；本 Mod 固定读取前者。Global 来源判定参考 CC Switch 的 `skills.directory`、启用标志和主副本/Agent 副本的哈希或指向链接；没有足够证据的不冒充原生受管。MCP 仅入库需要远端已有 SQLite 数据库，Agent live 部署仍由本 Mod 自行管理。依据：`cc-switch/src-tauri/src/services/skill.rs`、`src-tauri/src/services/mcp/`、`src-tauri/src/database/schema.rs`。
- Claude Desktop 的 `Claude-3p/configLibrary/_meta.json` 和上游云同步生成的 `manifest.json` 均不属于本 Mod 的 Skills 来源，不参与同步。依据：`cc-switch/src-tauri/src/claude_desktop_config.rs`、`src-tauri/src/services/sync_protocol.rs`。
- 本地测试：`node tests/agent-manager.test.cjs` 验证来源排序、冲突弹窗和 Workspace 路由；`node tests/agent-manager-remote.test.cjs` 验证四 Agent 的 MCP/Skills 生命周期、CC Switch 原生/外部来源、仅入库状态、凭据不进命令参数与 `.agents` 隔离；未跟踪的 `scripts/.agent-manager-sync-test.sh` 验证双向 tar/hc 传输、冲突选择、备份与软链拒绝。后续需在 Mac→Linux Herdr GUI 验证单条 MCP/Skill 的实际加载、重跑和断线恢复。

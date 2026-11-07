# agent-manager

在 Mac 的 Herdr App 中，从当前 Herdr Workspace 的 `machine` 选择 Linux Host，项目目录优先取 `space.folder`，为空时取同一 Workspace 内聚焦终端的 `cwd`。Project Skills 按 Claude Code / Codex / Pi / **通用** 显示四列，Antigravity 不显示；Global Skills 及两种范围的 MCP 仍按 Claude Code / Codex / Pi / Antigravity 展示。Skill 状态使用空框（未部署）、`~`（软链）或 `✓`（复制）；默认点击部署为软链，右键状态框可改用复制或切回软链。默认 **Project**，点击 **Project** 按钮切换 **Global**；两种范围的状态、受管记录和目标路径相互独立。图标来源及许可见 `icons/LICENSE`。

## 安装与使用

```sh
sh scripts/install.sh agent-manager tabs-agent-manager --no-layout
node scripts/agent-manager-panel.cjs "$HOME/.config/herdr-app/layouts/herdr-agent-manager.json"
```

安装脚本只复制 Mod 文件；布局脚本会先备份指定的**个人布局**，再把旧的根级常驻侧栏移入 `panel-body`，并将 `tabs` 替换为保持 Herdr 原有行为的 `tabs-agent-manager`。顶部 Files／Changes 旁会出现 **Manager** 按钮；点击显示或收起共用的右侧面板，并像原有面板一样按 Workspace 记住状态。已有其他布局组件保持不变；重复执行不产生额外改动。不修改 Herdr 内置的只读 `tabs` Mod；Herdr 内置 Tabs 更新时需同步审查这份派生版本。建议基于 `herdr-mods.json` 另存 `herdr-agent-manager.json`，保留原布局。切至该布局，选一个指向 Linux 的 Workspace，点击 **Refresh**。Project 优先使用 Workspace 的 `folder`；若为空，使用同一 Workspace 内当前聚焦终端的绝对 `cwd`。目标目录须在远端存在且不能是 home 或软链；缺少 Skill 目录或 MCP 文件时，首次启用对应资源才创建。Skills 与 MCP 列表独立滚动。Skills 主列表只显示远端资源库已有项；Mac 独有与远端 Agent 独有项进入底部 **Import** 弹窗。主列表的 Skill 左侧双端都有时显示同步图标，仅远端有时显示下载图标；点击可逐项同步。双端内容不同会打开冲突弹窗，必须明确选择 **Mac → 远端** 或 **远端 → Mac**，覆盖前保留旧版备份。Import 将 Mac 独有项上传至远端；远端 Agent 独有项先复制进远端 `~/.cc-switch/skills/` 再下载至 Mac；遇到同名已有项会拒绝覆盖，不改动 Agent 原文件，也不在 CC Switch 数据库登记 Skill。双向资源库同步仅改变两端的 `~/.cc-switch/skills/` 文件，**不启用任何 Agent**。Project Skills 四列分别部署到下表目录；Global Skills 和 MCP 保持各 Agent 独立。已运行的 Agent 通常需新会话或重新加载项目。

| Agent | Project Skill | Project MCP | Global Skill | Global MCP |
| --- | --- | --- | --- | --- |
| Claude | `<workspace>/.claude/skills/` | `<workspace>/.mcp.json` | `~/.claude/skills/` | `~/.claude.json` |
| Codex | `<workspace>/.codex/skills/` | `<workspace>/.codex/config.toml` | `~/.codex/skills/` | `~/.codex/config.toml` |
| Pi | `<workspace>/.pi/skills/` | `<workspace>/.pi/mcp.json` | `~/.pi/agent/skills/` | `~/.pi/agent/mcp.json` |
| 通用 | `<workspace>/.agents/skills/` | — | — | — |
| Antigravity | — | `<workspace>/.agents/mcp_config.json` | `~/.gemini/config/skills/` | `~/.gemini/config/mcp_config.json` |

Project 四列各自记录状态、复制及停用；**通用**仅在 Project 显示，使用 `<workspace>/.agents/skills/`，不读写用户全局 `~/.agents/skills/`。旧版 Project Shared 状态保留在通用列，旧版 Antigravity 项目受管条目也归入通用列；不会迁移或删除原有文件。Project 与 Global 的取消操作只处理本 Mod 受管条目，不删除资源库或其他项目配置。**独立目录不等于 Agent 已加载**：Claude 默认发现 `.claude/skills/`；Codex 官方默认扫描项目 `.agents/skills/`，未确认会自动读取独立的 `.codex/skills/`；Pi 已确认支持 `.agents/skills/`，独立 `.pi/skills/` 是否自动读取需验证或配置。Codex/Pi 列表示文件部署状态，不能代替 Agent 加载验证。

Project stdio MCP 的 `env` 值从 CC Switch 的选中 `server_config` 移至 `<workspace>/.env` 的受管块（0600），项目 MCP 配置仅含不带密钥的 Python 启动器参数；启动器加载该块再执行原服务器命令。Git 项目会自动将 `.env` 加入项目 `.gitignore`；若 `.env` 已被 Git 跟踪则拒绝部署。**带 `headers` 的 Project HTTP MCP 不部署**：现有四 Agent 并无统一且已验证的 `.env` 动态 HTTP header 加载方式；URL 中的账号、敏感查询参数及疑似密钥的 stdio 参数也拒绝写入。无凭据 HTTP 仍可部署。Global 仍使用原有配置逻辑；不自动修改已有全局 MCP 凭据。

非受管配置、被外部修改的配置/`.env`、软链配置路径一律拒绝直接覆盖。Global Skills 的原生 CC Switch 受管副本根据远端 SQLite `skills` 记录及主副本哈希/指向链接辨认，仍由 CC Switch 管理；指向 CC Switch 主副本但数据库没有对应记录的 Agent 链接单独显示为 **library link**，可选择显式接管。其他 Agent 专属目录里的现有 Skill 显示加号，**主动点击接管**后才记录当前哈希（先备份原件），之后可以由 Manager 启停。外部 Skill 如果是指向用户全局 `~/.agents/skills/` 的软链，接管与停用只备份／移动 Agent 目录中的软链，启用时恢复原链接，**不读写或删除目标内容**；项目现有 Skill 不自动接管。远端 CC Switch 资源库、Agent 专属目录和本 Mod 自己的受管记录分别显示，避免把来源混为一谈。Project 配置、Skill 与 `.env` 在用户私有 `~/.config/herdr-app/agent-manager/backups/` 备份；Global Skill 接管备份在 Agent 目录的 `.agent-manager-backups/`，状态记录在 `state.json`（0600）。重新同步资源库后，软链实时使用新内容；复制模式右键重选复制即可刷新。 `node_repl` 只从 Manager MCP 列表排除，本机 CC Switch/本机 Codex 均不改；绝对 Mac MCP 命令若 Linux 不存在，只把服务器定义写入远端已有 `~/.cc-switch/cc-switch.db`（原 id 冲突则拒绝），启用标志保持关闭，**不写入 live Agent 配置**。不复制整个数据库，也不碰用户全局 `~/.agents/skills/` 的内容。

**依赖**：Mac 上 `hc`、`sqlite3`（MCP）、Python 3.11+（Skills）；远端 Linux 上 Python 3.11+、目标 Agent 配置目录。仅入库的 MCP 还需远端已存在的 `~/.cc-switch/cc-switch.db`。Project stdio 密钥需 `git` 做防误提交检查；Codex/Pi 需先信任项目配置。受管 MCP 的裸命令须能从远端 PATH 找到。Provider、Prompt 未实现；Project 是所选 Workspace 的配置文件，不会自动迁移到其他 Host。Mac Herdr 布局切换后 UI 已实机加载、无渲染错误，远端 Skill 至 Mac 私有临时目录的实际 Herdr 文件传输已验证；**Agent 实际加载与真实工作目录的部署尚未实机验收**。

左键点击 Skill 名称可只读预览远端资源库的 `SKILL.md`；右键名称可删除远端资源库副本。删除先确认并保留私有备份，不删除 Mac 副本；远端 CC Switch 数据库登记的 Skill、Global Agent 已部署项和已知 Project Agent 在用项会拒绝删除。未记录在 Manager 中且位于其他位置的手工 Project 目录无法自动发现，删除前应先登记或移除它们。外部接管的软链不允许改为资源库复制。

## 测试

```sh
node tests/agent-manager.test.cjs
node tests/agent-manager-panel.test.cjs
node tests/agent-manager-remote.test.cjs
sh scripts/.agent-manager-sync-test.sh  # 本机未跟踪夹具
```

隔离 HOME 测试覆盖双向 Skills、冲突选择和备份、Project 四列独立 Skills、Global 原生/外部/受管来源、四 Agent MCP、缺少 Linux 命令的远端数据库仅入库、项目间隔离、凭据 `.env`、Git 防提交、外部修改和软链拒绝，并确认全局 `~/.agents/skills/` 不变。Mac 控制器现可通过 SSH 访问；修改 Mod 后要先切换至其他布局、再切回 `herdr-agent-manager`，才能重新加载运行中的视图。

# CC Switch × Herdr：可行性调查与边界契约（草案）

状态：仅静态源码调查；**未实现 Mod，未在 Herdr GUI、远端 Host 或真实 CC Switch 数据上验证**。调查基线：Herdr App `207dbdcc59e941fc127a6280dbd646421e67b539`；CC Switch **v4.0.26** `f621d4216189ef06bcc6acd3588c84937b9794e1`。下面的路径均相对于各自上游仓库；升级时必须重审。

## 结论

**分层方向可行，但“完整移植 CC Switch UI／逻辑、仅由 Workspace Context 换目标”在 v4.0.26 并非现成接口拼接。** Herdr Mod 是原生 GPUI JavaScript，不是 WebView；CC Switch 是 React + Tauri/Rust + SQLite，前端的 `invoke` 只能调用其 Tauri 进程内注册的命令。Herdr 能读取 Workspace／Host，并经 Herdr Core 在指定 Host 执行程序；不能直接在 Mod 内导入 CC Switch 的 React 组件、Rust Service 或 Tauri 命令。**写配置必须有新增、明确部署在目标 Host 的 CC Switch 兼容适配器**（或上游提供受支持的外部 API），不能通过读取 `.cc-switch` 后自行改 SQLite 伪装兼容。

更关键：CC Switch v4.0.26 的 WebDAV/S3 同步**不是纯资源下载**：同步快照含 `db.sql` + `skills.zip`；WebDAV 下载后运行 `run_post_import_sync`，通过 Provider／MCP／Skills／Prompts 投影实际 Agent 文件。因而“先同步资源，再由 Panel 决定部署”**不满足现有行为**，需要上游改造“仅入库、不投影”入口并验证其与现有同步行为隔离，或禁止在集成模式下自动下载。UI 文案不能把现有同步描述成只更新资源库。

## 已核查证据（静态，非公开稳定 API 的保证）

| 判断 | 上游证据 | 影响 |
| --- | --- | --- |
| Herdr 自有 Workspace 位置 | `herdr-app/defaults/herdr.d.ts`：`focused()`（`space`、`cwd`）、`spaces()`（`id`、`folder`、`machine`）、`machines()`（ready/unavailable）；本仓库 `mods/project-open/main.js` 的 `target()` 已用 `focused()` + `spaces()` | Panel 不自行发现 SSH；**但选中 Mod 面板时焦点可能不再是终端**，需定义目录回退，不可凭模糊标签猜目标。 |
| Herdr 的 Host 执行 | `herdr-app/defaults/herdr.d.ts`：`exec(command,args,{on,cwd,timeout})`，`readTextFile(path,{on})`；`herdr-app/src/mods.rs`：`run_remote_with_limit` 通过 `hc exec --on` | 无需另写 SSH 客户端；远端权限、网络、进程及路径仍须适配器在该 Host 本地处理。 |
| Herdr 文件写入边界 | 同一 `.d.ts` 与 `src/mods.rs`：`writeTextFile(path,text,expected)` **没有 `on`**，只走本机 `mod_files::write_text`；`home()` 是 App 所在主机的 home | 不得把本机写入误当远端写入，也不能用本机 home 拼远端路径。远端修改走 `{on}` 的目标 Host 执行入口。 |
| CC Switch 调用模型 | `cc-switch/package.json`（React/Vite + Tauri）；`src/lib/api/{providers,mcp,skills,workspace}.ts` 调 Tauri `invoke`；`src-tauri/src/lib.rs` 注册 `generate_handler!`；`src-tauri/src/commands/{provider,mcp,skill}.rs` 调服务 | Rust Service 可评估提取／改造成 Host 侧服务；**Tauri 命令不是 Herdr Mod 可直接调用的跨进程 RPC**。CC Switch 的 `workspace.ts` 管的是 OpenClaw 文件，不是 Herdr Workspace API。 |
| SSOT 与同步不等价 | `src-tauri/src/services/skill.rs`：Skills SSOT 默认为 `.cc-switch/skills`，但可设置为 `.agents/skills`；`src-tauri/src/services/sync_protocol.rs`：SQL 导出 + Skills ZIP、下载时替换技能并导入 SQL；`src-tauri/src/database/backup.rs`：仅跳过指定本地表 | `.cc-switch` 是数据库／技能等资源的一部分，不是统一“只读资源目录”；复制目录不等价于 CC Switch 同步。同步数据库可能含 provider/MCP 敏感字段及 Host 特定值，不能假定已经脱敏。 |
| 下载会写 live | `src-tauri/src/commands/webdav_sync.rs`：`webdav_sync_download` → `run_post_import_sync`；`src-tauri/src/commands/sync_support.rs` → `ProviderService::sync_current_to_live`、`PromptService::sync_all_to_live`；`src-tauri/src/services/provider/live.rs` → MCP、Skills 的 live 投影 | **资源同步 / 配置部署必须先拆开才符合要求**；即便后置投影失败，DB 导入也可能成功（返回 warning），要单独处理部分成功。 |
| 现有应用写法偏 Host 全局 | `src-tauri/src/mcp/claude.rs` 写 `~/.claude.json`；`src-tauri/src/mcp/codex.rs` 写 `~/.codex/config.toml`；`src-tauri/src/mcp/pi.rs` 明言不管项目级 `.pi/mcp.json`；`src-tauri/src/services/skill.rs` 以 Agent 全局目录同步 | v4.0.26 未发现统一 Project/Global 目标参数；要逐 Agent 增加项目投影，不能重用全局关闭／删除函数处理项目卸载。 |

## 目标契约（提案，待原型验证）

1. **WorkspaceContext** = `{spaceId, hostId, directory}`。`hostId` 来自 `spaces()[id].machine`（`null` 表本机），不是显示名或 SSH 目标；只有 `machines()` 中该 Host 为 ready 且目录明确时允许写入。目录优先取属于选中 Space 的活动终端 `focused().cwd`，否则用该 Space 的 `folder`；若两者无法证明属于同一 Space，或目录为空，则 Project 操作禁用并提示选择 Workspace。Project 默认就是该**精确绝对目录**，不暗中向上寻找 Git 根。`hostId + directory` 才是 Project 身份；相同路径在不同 Host 不相同。
2. **Scope** = `project | global`，与 Workspace 正交。Global = 当前 Host 的 Agent 用户级配置，而非 Herdr 跨 Host 配置；Project = 当前 Host + directory 的 Agent 项目级配置。切 Scope 不切 Host；切 Workspace 时重新读取 Host 状态和目录，不保留跨 Host 的隐式写入目标。
3. **Catalog ≠ Deployment**。资源记录来自目标 Host 的 CC Switch 资源库；部署记录必须包含 `{hostId, directory?, scope, agent, resourceId, revision}`。读列表、安装入库、部署到 Agent 是三种显式操作。取消 Project 仅删除**该 Project 中本集成管理的条目**，不删除 Catalog、不触碰 Global、其他项目或用户未托管的条目；Global 亦然。读取 Agent 有效配置时区分“本 Scope 显式”“继承自 Global”“被 Project 覆盖”，并以 Agent 实际优先级为准，不能把 UI 叠加等价于运行时叠加。
4. **Host Adapter 边界**。Panel 只传结构化参数、读取结果；可执行操作必须在已确认的目标 Host 上运行，使用 Herdr `exec(...,{on:hostId})`，不自行建立 SSH。适配器应复用 CC Switch 的服务／验证／写入逻辑，暴露有版本的查询、仅入库同步（需新增）、按 Scope 部署、撤销、预览差异、恢复等命令；**不能直接编辑 `.cc-switch/cc-switch.db`**，不能让 Panel 用零散 JSON/TOML 重做全局投影。现有 Tauri Service 的生命周期、状态锁及文件路径依赖需要审计；不能声称“抽取 Rust crate”已完成。
5. **异步操作锁定上下文**。点击时快照 `{hostId,directory,scope,agent,resourceId,revision}`；执行前和提交前检查 Host ready、项目目录可访问、目标身份未变及文件版本，发现 Workspace／Scope 切换、离线或冲突就中止／要求显式重试，绝不退回本机。跨进程修改须预览差异、只写托管键、留备份、失败回滚；不要把 secret 写入命令行参数、日志或回显。
6. **同步的可移植边界**。跨 Host 只共享经审计的可移植定义；环境变量名可共享但值、绝对路径、API token、OAuth、可执行命令、主机密钥由各 Host 的本地覆盖／凭据存储决定。缺失覆盖则阻止部署并显示缺项，不把本机值落到 Remote。既有 CC Switch 快照不保证执行此隔离；在落实隔离前禁用自动资源下载／部署联动，亦不能把其 WebDAV/S3 当安全“目录同步”。

## 功能适配矩阵（不把所有模块硬套 Project）

| 功能 | Global 目标 | Project 目标 / v4.0.26 差距 |
| --- | --- | --- |
| Provider／多账号 | 现有服务可操作该 Host 的用户配置 | Agent 不一定支持项目级 Provider／账号；逐 Agent 确认原生支持及优先级。无支持者只提供 Global，**不模拟** Project。账号凭据不做跨 Host 复制。 |
| MCP | v4.0.26 有各 Agent 用户级写入 | 按 Agent 的真实项目文件格式另做增量投影；Pi `.pi/mcp.json` 明确不在现有管理范围。 |
| Skills／仓库 | SSOT + per-Agent 同步 | Project 安装目录、软链／复制及所有权需要新逻辑；先区分技能本体与“启用部署”。 |
| Prompts／Commands／Hooks | 先核各 Agent 的当前 Global 投影能力 | Project 文件语法与支持程度逐 Agent 验证；未验证的格子禁用，不把 Provider 或 Prompt 当通用命令／Hook。 |
| Sessions／Usage | 目标 Host 本地读取、可标记所用 Agent／范围 | 大多是观测／聚合而非配置部署；先验证源数据能否按项目过滤，不显示虚构的 Project 统计。 |
| Backup／Restore、Import／Export | 可借用 CC Switch 命令但只作用于该 Host | 快照与恢复不是部署范围操作；执行前明确展示哪些全局文件、数据库和技能受影响，禁止项目卸载触发整库恢复。 |
| Settings／Marketplace | 可复用部分逻辑与数据模型 | 设置分 Host，仓库发现≠安装≠部署；React 页面必须原生 GPUI 重做或另开 CC Switch，不能嵌入 Mod。 |

## 决策门槛与最小验证路径

1. **阻断项 A：同步隔离**：在 v4.0.26 测试环境验证 WebDAV/S3 下载、自动同步、导入恢复的全部后置投影路径；若没有“仅入库”受支持入口，不启用集成模式的资源同步。
2. **阻断项 B：复用方式**：先做无真实凭据的 Host Adapter 原型；确认在 Local 与 Remote 均能调用 CC Switch 服务，兼容数据库锁／版本／路径，失败不污染真实 CC Switch。决定是上游新增 headless API／共享 crate，还是明确维护 fork；拒绝 Herdr Mod 直写 SQLite 的捷径。
3. **阻断项 C：逐 Agent scope**：先用一个 MCP + 一个 Skill 在 Claude、Codex、Pi 的 Project／Global 路径上验证实际 Agent 优先级及卸载独立性；不支持则界面明确 disabled。Provider／账号另外验证是否存在项目层，不能套用 MCP 结论。
4. **最小闭环验收**：选择本地 Project 安装入库 → 仅部署 Project → Global 保持原样 → 切 Remote 仅操作 Remote → 切回本地原配置不变；同步后目标配置未被悄然改写；Remote 离线／目录失效／缺 Host 覆盖／版本冲突均 fail closed；备份恢复及重试幂等。至少各验第一／中／尾三个资源及切换竞态。
5. **完成条件**：上述门槛通过，才展开完整 CC Switch UI 覆盖；每个功能列出调用适配器、Host/Scope 支持矩阵和自动化测试。否则保持文档／原型阶段，不发布“完整移植”声明。

## 待确认的问题（需原型回答，非已有能力）

- 目标 Host 是否能安装、运行一个与 CC Switch v4.0.26 同版本且可安全并行的无界面适配器？Linux/macOS/Windows 的可用性与分发如何处理？
- 现有 CC Switch WebDAV/S3 自动同步的触发条件和所有下载／恢复路径是否能关闭自动投影，而不破坏普通 CC Switch 使用？
- 如何实现每 Host 凭据保管及同步字段过滤（包括 SQLite 的 provider/MCP 字段），并保证不影响 CC Switch 原有快照兼容性？
- 当前用户常用的 Agent／OS 组合各有哪些**真实**项目级配置及优先级？未支持的模块到底展示只读还是禁用？

本文件只记调查结论和待验证契约，不在仓库中附带 CC Switch 源码、数据库、凭据或推断出的配置文件样本。

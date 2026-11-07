---
name: herdr-source-index
description: vendor/herdr-core 与 vendor/herdr-app 源码索引。要确认某个 mod host API 是否存在、app 动作叫什么/收什么参数、layout 与 overlay 怎么渲染、core 怎么把字节写进 PTY、attach 协议长什么样时，用这里定位文件和符号，别猜、别只翻文档。
---

# herdr 源码索引

仓库里有两份本地参考源码（`vendor/` 被 gitignore，不进 history）：

```sh
ls vendor            # herdr-core  herdr-app
# 缺了就补：
git clone --recurse-submodules https://github.com/herdrdev/herdr-core.git vendor/herdr-core
git clone --recurse-submodules https://github.com/herdrdev/herdr-app.git vendor/herdr-app
```

**索引只认「文件 + 符号名」，不写行号**——`git -C vendor/<name> pull` 之后行号会漂，符号名基本不漂：

```sh
rg -n 'pub async fn terminal_send' vendor/herdr-core
rg -n '\.function\("openOverlay"' vendor/herdr-app
```

## 先决定翻哪个库

| 问题 | 库 |
|---|---|
| 能不能往终端输入？PTY、帧协议、attach、远程机器、事件流 | `vendor/herdr-core` |
| Mod 能调什么、动作名字与参数、键位、菜单、layout 树、overlay、主题 | `vendor/herdr-app` |

一句话分工：**app 决定「你看到什么」，core 决定「跑什么」**。Mod 活在 app 里，所以 mod 能做的事 = `vendor/herdr-app/src/mods.rs` 里注册的那些 JS 函数；app 没有的能力，只能 `exec("hc", …)` 绕到 core。

## herdr-core（`hc`）

`crates/herdr-core/src/`，20500 行，按文件读：

| 想知道 | 文件 | 符号 |
|---|---|---|
| 命令行有哪些子命令、参数长什么样 | `cli.rs` | `enum Cmd`、`command_names`、`main` |
| JSON-RPC 每个方法的实现 | `api.rs` | `terminal_send`、`terminal_keys`、`terminal_interrupt`、`terminal_attach`、`terminal_read`、`terminal_put`、`machine_exec`、`events_subscribe` |
| 参数/返回结构体的字段与注释 | `api/types.rs` | `SendParams`、`KeysParams`、`AttachParams`、`AttachResult`、`ReadParams`、`WaitParams`、`ListResult` |
| **往终端写字到底怎么走**（等 pause、`--force`、`--if idle`） | `input.rs` | `impl Core` 里的 `async fn send`、`send_message`、`Gate`、`enum Step` |
| 终端注册表、`t7` 这类地址怎么来的 | `terminals.rs` | `Terminal`、`Registry`、`address`、`parse_id`、`id_shaped` |
| 进程持有 + 把字节交给 PTY | `runtime.rs` | `Core`、`Link`、`Link::input`、`Link::send` |
| 帧协议（HEADER/kind/INPUT） | `wire.rs` | `encode`、`decode_header`、`read_frame`、`Conn` |
| 交互式客户端（`hc attach`：按键、resize、detach） | `attach.rs` | `run`、`find_detach`、`take_replies` |
| 常驻 holder 进程、重连 | `holder.rs` | `run`、`Holder` |
| 终端保活/恢复（`--keep`） | `kept.rs` | `impl Terminal`、`impl Core` |
| 别的机器（ssh、`machine/t7`） | `machines.rs`、`remote.rs` | `Machine`、`Reach`、`MachineView`、`Line` |
| `hc exec`（跑一次、拿输出） | `exec.rs` | `run`、`timeout`、`Slot` |
| 事件流 `hc events` | `events.rs` | `Events`、`Filter`、`Sink`、`notification` |
| 配置（detach 键等） | `config.rs` | `Config`、`DetachKey` |
| 屏幕/历史读取 | `viewers.rs`、`stitch.rs`、`attach.rs` | `Display`、`Viewer` |
| 机器可读的 API 契约 | `schema/hc.openrpc.json` | — |

## herdr-app（`herdr-gpui`）

`src/`，28000 行。两个巨文件先记住：`window.rs`（5790 行，渲染 + 动作执行）和 `terminal.rs`（3706 行，终端视图）。找东西优先靠符号，不要顺序读。

| 想知道 | 文件 | 符号 |
|---|---|---|
| **所有动作的清单与参数**（键位、菜单、`herdr-app do`、`run()` 共用这一份） | `commands.rs` | `COMMANDS`、`find`、`validate_args`、`cmd()` |
| **Mod 能调哪些 JS 函数** | `mods.rs` | `.function("…")` 注册表（`run`、`openOverlay`、`closeOverlay`、`notify`、`props`、`shared`、`setShared`、`layout`、`layouts`、`openOverlay`、`terminals`、`panes`、`spaces`、`agents`、`machines`、`theme`、`settings`、`playSound`、`appHome`、`commands`、`keys` …） |
| `run("…")` 怎么被接住并校验参数 | `mods.rs` | `.function("run")` → `crate::commands::find` / `validate_args` |
| 内置 Mod 覆盖机制（改过的被挪成 `-edited`） | `mods.rs` | `sync_defaults`、`edited_name`、`untouched`、`as_shipped`、`clone_mod` |
| Mod 目录扫描 / 哪些文件算 Mod | `mods.rs` | `scan`、`scan_dir`、`kinds`、`valid_name` |
| Layout 树与外观字段 | `layout.rs` | `Node`、`Content`、`Kind`、`Look`、`Size`、`Float`、`Header`、`PaneFrame`、`ThemeChoice` |
| overlay 窗口怎么渲染、怎么只盖住一个 pane | `window.rs`、`window/floats.rs` | `overlay_layout`、`overlay_terminal_block`、`mod_overlay`、`floats::Reveal`、`Floating` |
| 动作真正执行的地方（`terminal.show`、`terminal.peek`、`terminal.kill` …） | `window.rs` | `impl AppWindow` 里的动作 match（搜 `"terminal.show"`） |
| 终端视图的粘贴/输入（剪贴板进 PTY 的唯一 app 路径） | `terminal.rs` | `paste`、`paste_image`、`vt.paste_bytes` |
| 与 core 的客户端（RPC、事件流、版本校验） | `hc.rs` | `Core`、`Stream`、`EventLines`、`check`、`core_min` |
| 设置 / 主题 / 按键 | `settings.rs`、`keys.rs`、`programs.rs` | `Settings`、`Sounds`、`Appearance`、`OptionAsAlt` |
| 现成 mod 的写法（最好的参考） | `defaults/mods/` | `tabs`、`workspace-status`、`files`、`changes`、`picker`、`prompt`、`toast`、`menu`、`peek`、`worktree` … |
| 宿主类型声明（`types/herdr.d.ts` 的来源） | `defaults/herdr.d.ts` | 419 行，**Mod 真正的接口面** |
| 给 agent 的应用文档（动作、设置、mod 契约） | `defaults/AGENTS.md` | 1036 行，比 README 细 |

## 高频问题直达

| 问题 | 去哪 |
|---|---|
| Mod 能不能往终端发消息？ | `vendor/herdr-app/src/mods.rs` 的函数表 → 没有；`run()` 的 `terminal.*` 里也没有写入。写只能 `exec("hc", ["send", …])`，实现在 `vendor/herdr-core/src/input.rs` 的 `async fn send` |
| `terminal.paste` 为什么不能代发文本？ | `vendor/herdr-app/src/terminal.rs` 的 `paste`：读系统剪贴板 → `vt.paste_bytes`；Mod 没有写剪贴板的 API |
| 某个动作的参数叫什么、必填吗？ | `vendor/herdr-app/src/commands.rs` 的 `COMMANDS`（`about` 字段就是文档原文） |
| `openOverlay` 收什么？overlay 长什么样？ | `mods.rs` 的 `.function("openOverlay")` + `window.rs` 的 `overlay_layout` |
| Layout 里一个节点能写哪些字段？ | `vendor/herdr-app/src/layout.rs` 的 `Node` / `Look` / `Content` |
| 终端地址 `t7` 怎么产生、怎么解析？ | `vendor/herdr-core/src/terminals.rs` 的 `address` / `parse_id` |
| `hc send` 为什么默认“等一会儿才输入”？ | `vendor/herdr-core/src/input.rs` 的 `Gate` / `Step`（`quiet()`、`working()`） |
| attach 的数据通道协议？ | `vendor/herdr-core/src/wire.rs` + `attach.rs` + `schema/hc.openrpc.json` |

## 读之前的两个优先动作

1. `vendor/herdr-core/skills/herdr-core/SKILL.md`、`vendor/herdr-app/defaults/AGENTS.md` —— 上游自己写的用法与契约，比二手总结准。
2. 再看源码。源码里 `about` / 注释就是文档，`commands.rs` 的一条 `cmd(...)` 常常直接把语义写全了。

## 维护

`vendor` 更新后，索引只需要校验符号还在：

```sh
cd vendor/herdr-core  && rg -c 'async fn send' crates/herdr-core/src/input.rs
cd vendor/herdr-app   && rg -c 'COMMANDS' src/commands.rs
```

哪个符号搜不到，就重新定位并在本文件里改那一行——**不要补行号**。

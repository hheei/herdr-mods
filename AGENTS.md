# AGENTS.md

herdr-mods：Herdr App 的 Mod 合集（hheei-status、hheei-tabs、agent-ui、agent-manager）。

## 三个命令，两套东西，别搞混

| 命令 / 程序 | 是什么 | 仓库 |
|---|---|---|
| `herdr` | **旧的**终端多路复用器 CLI（本机 0.9.5）。TUI，一套独立产品，**和下面两个没有任何关系**，本仓库不针对它开发 | <https://github.com/herdrdev/herdr> |
| `hc`（`herdr-core`） | **服务端**（本机 0.1.18）。真正跑每个终端和 agent 的那个进程，`hc` 是它的 CLI | <https://github.com/herdrdev/herdr-core> |
| `herdr-app`（`herdr-gpui`） | **新的桌面程序**（GPUI）。core 的前端，通过 socket 控制 core；本仓库的 Mod 跑在它里面 | <https://github.com/herdrdev/herdr-app> |

`herdr-core` + `herdr-app` 是**同一套**：app 负责“你看到什么”（layout、mod、窗口），core 负责“跑什么”（终端、PTY、agent）。老的 `herdr` CLI 是前一代产品，跟这套没有任何代码或协议关系 —— 文档里看到 `herdr` 和 `herdr-app` 混着写，先问一句是哪个。

由此带来的分工，直接影响能做什么：

- **改界面**走 app 侧：Mod + `layout.json` + host API（`props`、`layout()`、`run("layout.select")`、`openOverlay` …）。
- **往终端里写字**只能走 core 侧：app 的 host API 里没有任何写入接口（`run()` 的 `terminal.*` 只有 `open/kill/keep/park/peek/show/copy/paste/right_click/scroll`，而 `terminal.paste` 粘的是系统剪贴板，Mod 没有写剪贴板的 API）。要发就得 `exec("hc", ["send", "<addr>", text])` / `["keys", "<addr>", "enter"]`。
- 终端地址是精确的：hc 启动的每个终端带 `HC_TERMINAL_ID`，进程里读 `process.env.HC_TERMINAL_ID` 就是自己的地址（本机 `pi` 进程实测有此变量）；`hc get <addr> --json` 还能反向拿 `foreground.pid`。
- 文档里的命令名也别混：`herdr-app do <action>` 是 app 侧动作（要求 app 在运行），`hc ...` 是 core，`herdr ...` 是旧那套。

两边的源码就放在 `vendor/herdr-core/`、`vendor/herdr-app/`（`git clone --recurse-submodules`，**不进仓库**，只在本地参考）。想确认某个 API 是否存在、某个字段到底什么意思，先读这两个目录，别猜；更新用 `git -C vendor/<name> pull`。

## 现在是什么阶段

开发中，实际上只有作者一人在用。**不写兼容代码。**

- 不写迁移分支：旧 Mod 名、旧 Layout 结构、旧状态文件，一律不管。要换就直接换掉，重装或删了重来。
- 不留 `legacy` / `old` / `backward compat` 这类分支和注释；该删的代码直接删。
- 等真有第二个人装着旧版要升级时，再照真实数据写兼容 —— 不按猜想写。

## Herdr 的硬规矩

Herdr 自带的 Layout 和 Mod 是只读的：每次启动原样覆盖，改过的会被挪成 `<name>-edited`。
所以改内置东西的唯一办法是**克隆成自己的名字**，再让 Layout 的 `content.mod` 指过去：

```sh
herdr-app do mod.clone '{"name":"tabs","as":"hheei-tabs"}'
```

`hheei-tabs` 就是这么来的：内置 `tabs` + 一个 panel 按钮。上游更新时 diff 手动合。

## 仓库约定

- `mod.json` 只放 Herdr 自己的契约（`place`、`size`、`title`、`overlay`）。installer 私有的声明放同目录的 `layout.json`，例如 `{ "status": "workspace-status" }`、`{ "tabs": "tabs" }`、`{ "panel": true }`、`{ "sidebar": true }`。
- installer 对 Layout 只做两件事：**追加节点、改名**。幂等到字节级；找不到对应节点就原样吐出并说明原因，绝不重排或重写别人的布局。
- 一个 Mod 只干自己的事：`agent-manager` 不知道 tab 栏长什么样。`hheei-tabs`、`hheei-status` 是整套 mods 的**总 tab 栏 / 总状态栏**（克隆官方 + 自己的按钮），自己的新 Mod 要位置就往这两个文件里加一行，不要另起一个去抢同一条。

## 类型

Mod 是 JavaScript，`main.js` 是 Herdr 写死的入口，运行时没有 bundler/transpiler。类型靠 `// @ts-check` + 仓库根的 `jsconfig.json`，宿主声明是 App 生成物：`types/herdr.d.ts`（22 KB，进仓库——这是 Mod 真正会踩的接口面，版本变化在 diff 里看得见）和 `types/gpui-kit.d.ts`（800 KB 组件注册表，**不进仓库**，装了 App 的机器用 `sh scripts/sync-host-types.sh` 同步，CI 用 `sh scripts/host-types-stub.sh` 生成宽松替身）。CI 跑 `tsc -p jsconfig.json`。别改 `mods/agent-ui/bridge/` 下的 Pi extension 来凑这个检查：那是 Node 侧代码，被 jsconfig 排除在外。

## 测试

`tests/*.test.cjs` 是单文件 assert 脚本，没有框架；`tests/*.test.sh` 跑端到端安装。
改了 installer 或 `scripts/*.awk`，就同时跑：

```sh
node tests/agent-manager-panel.test.cjs
sh tests/install-smoke.sh
```

"ok 但没断言" 不算测试。新逻辑至少留一条能跑的检查。

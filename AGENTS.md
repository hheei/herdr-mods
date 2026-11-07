# AGENTS.md

herdr-mods：Herdr App 的 Mod 合集（hheei-status、hheei-tabs、agent-ui、agent-manager）。

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

Mod 是 JavaScript，`main.js` 是 Herdr 写死的入口，运行时没有 bundler/transpiler。类型靠 `// @ts-check` + 仓库根的 `jsconfig.json`，宿主声明放在 `types/`（App 只在装了 Herdr 的机器上生成，`sh scripts/sync-host-types.sh` 从 `~/.config/herdr-app` 同步）。CI 跑 `tsc -p jsconfig.json`。别改 `mods/agent-ui/bridge/` 下的 Pi extension 来凑这个检查：那是 Node 侧代码，被 jsconfig 排除在外。

## 测试

`tests/*.test.cjs` 是单文件 assert 脚本，没有框架；`tests/*.test.sh` 跑端到端安装。
改了 installer 或 `scripts/*.awk`，就同时跑：

```sh
node tests/agent-manager-panel.test.cjs
sh tests/install-smoke.sh
```

"ok 但没断言" 不算测试。新逻辑至少留一条能跑的检查。

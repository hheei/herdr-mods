# hheei-status

整套 mods 的状态栏：Herdr 内置 `workspace-status` 的克隆，多两个图标。

- 左键：用上次的选择打开项目（VS Code，或 Finder / 文件管理器）；右键：换默认
- 紧挨着它的第二个小图标：聚焦的是被识别的 Agent 时出现，点开 `agent-ui` 的浮层，再点关闭

机器名、分支、agent 数、「Commands」提示全部沿用官方渲染 —— 那是 `workspace-status` 的 31 行，原样保留，只加了图标。

## 为什么要克隆

Herdr 自带的 Mod 只读，每次启动原样覆盖；改过的会被挪成 `<名字>-edited`。而官方的渲染根是 `h_flex().size_full()`，占满整条，布局里在它旁边再放一个 block 会被挤成 0 宽。所以想在状态栏里加图标，只有克隆这一条路：

```sh
herdr-app do mod.clone '{"name":"workspace-status","as":"hheei-status"}'
```

内置版更新时手动 diff 合过来。

## 安装

```sh
sh scripts/install.sh hheei-status
```

`layout.json` 是 `{ "status": "workspace-status" }`：安装器把布局里状态栏那个 block 的 `content.mod` 从 `workspace-status` 改成 `hheei-status`。其它节点不动，重复执行不产生改动。

不指定 `--layout` 时改的是 `herdr-mods.json`（本仓库的出厂布局）。

## 状态

- 上次的选择存在 Herdr shared state 的 `hheei-status.last-action`
- 打开的浮层记在 `hheei-status.agent-ui-overlay`
- 远程 Workspace 上「在文件管理器打开」会提示改用 VS Code Remote SSH（远程路径不是本地目录）

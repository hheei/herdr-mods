# Herdr Mods

Small independent mods for [Herdr App](https://github.com/herdrdev/herdr-app). Community project; not an official Herdr release.

## Mods

| Mod | Function |
| --- | --- |
| [Hheei Status](mods/hheei-status/README.md) | The collection's Status Bar: Herdr's own `workspace-status` cloned, plus one launcher icon (left click opens the selected tool, right click changes it) and one Agent UI switch. |
| [Hheei Tabs](mods/hheei-tabs/README.md) | The collection's tab bar: Herdr's own `tabs` cloned, plus the **Manager** panel button. |
| [Agent Manager](mods/agent-manager/README.md) | Toggleable Files/Changes panel: bidirectional macOS↔Linux CC Switch Skills library sync with conflict dialog, plus Project Skills deployment (Claude, Codex, Pi, Common), four-agent Global Skills, and four-agent MCP deployment. Missing Linux MCP commands are stored disabled in the remote CC Switch database when available. |
| [Agent UI](mods/agent-ui/README.md) | Native GPUI fixture conversation with **Markdown, collapsed tool activity, minimal Message Rail and one SVG mode switch**. Not yet connected to live Pi or a single split Pane. |

### Agent UI demo (local checkout)

Run on the computer hosting the Herdr App GUI:

```sh
sh scripts/install.sh agent-ui hheei-status
```

Select **`agent-ui-demo`** in the Layout picker. The **single SVG icon** in the existing Status Bar switches between your Terminal Tab display and the synthetic Agent UI. The conversation is a **60-turn synthetic history** (7 scripted turns plus 53 generated follow-ups), with grouped tool details, native Markdown and **a Message Rail that itself functions as the scrollbar**. An 18px strip holds one column of dots—right-aligned 3px from the edge, 3px apart, 4px to 9px wide at 70% opacity, never taller than 40% of the view—and **no track or thumb**. Dot size follows a Gaussian packet around the reading position, so the focus reads as a single spot; hover shows a short question, tapping a dot jumps to its turn, dragging vertically scrubs, and ↑/↓/Home/End/Enter/Esc do the same from the keyboard. Narrow panes swap the strip for a **Turns** list, and `▶ stream` replays a turn in chunks to show how the rail and the reading anchor behave mid-stream, the header chip cycles the demo through **offline** and **empty** states — a turn arriving while you read above shows a `↓ N new` counter instead of yanking the transcript. Dense histories merge turns into one dot each (`+N` on hover) instead of shrinking or overflowing.

This is an **opt-in Tab-display chrome-stack preview**, not a live Pi client or per-model split-Pane switch. It does not start, stop or send commands to Pi. [Installation and limitations](mods/agent-ui/README.md) · [implementation status](docs/agent-ui/11-agent-ui-demo-implementation.md).

## Quick install

Install [Herdr App](https://github.com/herdrdev/herdr-app#install) first. Run **on the computer hosting the Herdr App GUI** (not just a remote herdr-core server). **No clone or Python required.**

**macOS / Linux — one line:**

~~~sh
curl -fsSL https://raw.githubusercontent.com/hheei/herdr-mods/main/scripts/install.sh | sh -s -- --yes
~~~

`--yes` is there because a pipe has no terminal to answer the confirmation prompt: without it the installer prints what it would change and stops. Run it from a checkout (`sh scripts/install.sh`) and it asks.

One command, one verb: bring what belongs in your Herdr up to date. Nothing installed yet means the whole checkout is the starting set; after that it refreshes exactly what is there. `--all` widens it to every mod under `mods/`, and naming mods (`| sh -s -- hheei-status`) narrows it — that is how a mod we shipped later gets added, since it never appears on its own. The same installer runs two ways: from a checkout it installs the local files, and when piped it downloads a temporary source archive, installs, and deletes the archive. It is [scripts/install.sh](scripts/install.sh); review any downloaded script before execution. Requires `sh`, curl and tar.

**Windows:** there is no PowerShell installer. Run the same commands from **Git Bash** or **WSL** — the Mod files go to the same `~/.config/herdr-app` folder.

**If you already downloaded the repository**, run `sh scripts/install.sh`.

To install the Mod files without touching any layout, add `--no-layout` and wire it into your own layout by hand; see the [Hheei Status notes](mods/hheei-status/README.md#installation) for the exact JSON.

No Python, Node, jq, sudo, or additional dependency required for installation. The installer copies the mods and **patches a shared personal layout** named `herdr-mods`; a mod that declares a derived layout (the Agent UI preview) also writes that extra file. **The bottom Status Bar is a row of Mods.** The installer turns the stock single-Mod status block into a plain `row` and fills it from each Mod's own `layout.json`, naming what it adds `status-bar-<mod>`; nothing else in that row is moved or removed, so a bar you edited by hand keeps your blocks and only gains the missing Mod. Project Open renders the whole row, so machine, branch, agent count and the Commands hint stay as they were. On first install, the installer copies the official `main` layout (or the bundled template) to a personal copy; each subsequent Mod is added to the **same layout**, with a single fixed backup per changed asset (the previous one is replaced on each update): a Layout keeps a `*.bak` beside itself, and a replaced Mod goes to `~/.config/herdr-app/backups/<mod>/`, outside `mods/` where Herdr would read a backup as a Mod of its own. Shipped layouts are never modified. In a terminal the installer asks `? patch layout herdr-mods [Y/n]` before writing and leaves the layout (even a copy it just created) alone if you answer `n`; non-interactive runs take the default.

**Next:** in Herdr App switch to layout **herdr-mods** (from the layout picker or command palette); alternatively:

~~~sh
herdr-app do layout.switch '{"name":"herdr-mods"}'
~~~

The source is available at **https://github.com/hheei/herdr-mods**. Direct-install commands always use the repository's `main` branch; inspect the script first or use a pinned release archive when you need a reproducible build.

### How a Mod joins the Layout

Each Mod says what it needs in its own `layout.json`; the Mod itself knows nothing about layouts.

| Declaration | Meaning |
| --- | --- |
| `{ "status": "workspace-status" }` | Replace that shipped Mod with mine, in every Layout the installer patches |
| `{ "tabs": "tabs" }` | Same, for the tab bar |
| `{ "panel": true }` | Append me to `panel-body`, beside Files and Changes |
| `{ "sidebar": true }` | Append me to the Sidebar |
| `{ "derive": "<layout>" }`, `{ "pi": "<file>" }` | Copy a demo Layout, install a Pi extension |

A shipped Herdr Mod is read-only — replaced whole on every start, an edit moves aside to `<name>-edited` — so replacing one is a value change in the Layout, and the renderer it replaces is cloned under our own name. `hheei-status` and `hheei-tabs` are exactly that.

**There is one Status Bar and one tab bar.** Both render `size_full()`, so a second block beside either is squeezed to nothing; a Mod that wants its own icon there clones the bar and adds it, the way `hheei-status` adds its launcher. A Sidebar entry is the alternative, and nobody else's business.

The installer keeps the `layout.json` already installed rather than overwriting it with the checkout's default, so taking a Mod out of the bar sticks across reinstalls.

### Update

The same command, no flags. A Mod whose files already match is reported as `unchanged` and left alone; only what actually differs is replaced from `main`, with the previous copy going to `~/.config/herdr-app/backups/<mod>/`. Before anything is written it asks once — `? apply N change(s) [Y/n]` — and `--yes` answers that up front. With no terminal to ask (piped, CI) it changes nothing, prints how many changes are pending and tells you to re-run with `--yes`, so nothing is ever installed on a guess. `--no-layout` takes the Mods without the Layout wiring.

A Mod you removed stays removed, and one we added later does not appear on its own — say `--all` or name it.

~~~sh
curl -fsSL https://raw.githubusercontent.com/hheei/herdr-mods/main/scripts/install.sh | sh
~~~

Backups are fixed paths, so each install or update replaces the previous one instead of piling up archives. Layout patching is idempotent and never overwrites an existing layout: a Mod is only added when its id is absent, and a Layout pointing somewhere else is left byte-identical (the Mod files are still installed, for manual wiring). Nothing is reordered and nothing is migrated: a node is pointed at our Mod, or a block is appended. Everything else in the Layout stays byte-identical.

The official Herdr App home is **~/.config/herdr-app**, even on Windows. XDG_CONFIG_HOME changes its config root; HERDR_APP_HOME overrides directly.

## Repository layout

~~~text
mods/<name>/        each mod is self-contained (main.js, mod.json, layout.json, assets, README)
layouts/herdr-mods.json fallback base for the shared personal layout
scripts/            sh installer (local or piped), layout patchers, shared tui.sh
tests/              developer checks
.github/workflows/  CI
~~~

Future mods follow the same structure and can be installed by name. Every install patches the same `herdr-mods` layout with backup, so no manual JSON merging is needed. Installers do not change shipped Herdr App layouts or herdr-core. The layout name is fixed at `herdr-mods` so installs stay predictable; to use a different personal layout, install with `--no-layout` and add the Mod to it by hand.

## Development checks

~~~sh
tsc -p jsconfig.json      # types; runs without Herdr, thanks to the stub in scripts/
node tests/hheei-status.test.cjs
node tests/agent-manager.test.cjs
node tests/agent-manager-panel.test.cjs
node tests/agent-manager-remote.test.cjs
sh scripts/.agent-manager-sync-test.sh # local-only, ignored by Git
node tests/agent-ui.test.cjs
node --check mods/hheei-status/main.js
node --check mods/agent-ui/main.js
node --check mods/agent-ui/model.js
sh -n scripts/install.sh
sh tests/install-smoke.sh
sh tests/agent-ui-demo-install.test.sh
~~~

Node is for **developer tests only**. If Herdr App is installed, additionally validate with its official command:

~~~sh
herdr-app check "$HOME/.config/herdr-app/mods/hheei-status"
~~~

These `herdr-app` commands talk to the **running App** (`herdr-app commands` lists every one with its arguments); there is no separate CLI package to install, and `do` takes a JSON object rather than flags: `herdr-app do layout.switch '{"name":"herdr-mods"}'`.

This does not replace visual GUI testing.

## References

Install and configuration behavior follows the upstream [Herdr App installer](https://github.com/herdrdev/herdr-app#install), [Layouts and mods](https://github.com/herdrdev/herdr-app/blob/master/docs/mods.md), [Mod API guide](https://github.com/herdrdev/herdr-app/blob/master/defaults/AGENTS.md), [Security and App Home](https://github.com/herdrdev/herdr-app/blob/master/docs/security.md), and [CLI commands](https://github.com/herdrdev/herdr-app/blob/master/docs/commands.md).

Mods can run programs, read files, and access networks. **Review source code before installing**.

[Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [License](LICENSE) · [Attribution](NOTICE)

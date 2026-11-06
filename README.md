# Herdr Mods

Small independent mods for [Herdr App](https://github.com/herdrdev/herdr-app). Community project; not an official Herdr release.

## Mods

| Mod | Function |
| --- | --- |
| [Project Open](mods/project-open/README.md) | Single status icon, left click opens the selected tool, right click changes preference. |
| [Agent UI](mods/agent-ui/README.md) | Native GPUI fixture conversation with **Markdown, collapsed tool activity, minimal Message Rail and one SVG mode switch**. Not yet connected to live Pi or a single split Pane. |

### Agent UI demo (local checkout)

Run on the computer hosting the Herdr App GUI:

```sh
sh scripts/install.sh agent-ui project-open
```

Select **`agent-ui-demo`** in the Layout picker. The **single SVG icon** in the existing Status Bar switches between your Terminal Tab display and the synthetic Agent UI. The conversation includes seven test turns, grouped tool details, native Markdown and **a Message Rail that itself functions as the scrollbar**. Only 4px/8px navigation dots are drawn in an 18px interaction strip—**no track or thumb**. Hover shows a short question; tapping a dot jumps to its turn, while dragging vertically scrubs the continuous transcript. All viewport-visible dots enlarge together, and the hover stays within the frame.

This is an **opt-in Tab-display chrome-stack preview**, not a live Pi client or per-model split-Pane switch. It does not start, stop or send commands to Pi. [Installation and limitations](mods/agent-ui/README.md) · [implementation status](docs/agent-ui/11-agent-ui-demo-implementation.md).

## Quick install

Install [Herdr App](https://github.com/herdrdev/herdr-app#install) first. Run **on the computer hosting the Herdr App GUI** (not just a remote herdr-core server). **No clone or Python required.**

**macOS / Linux — one line:**

~~~sh
curl -fsSL https://raw.githubusercontent.com/hheei/herdr-mods/main/scripts/install.sh | sh
~~~

With no mod name it installs **every** mod under `mods/` and applies the layout wiring each `mod.json` declares; name mods to install a subset. The same installer runs two ways: from a checkout it installs the local files, and when piped it downloads a temporary source archive, installs, and deletes the archive. It is [scripts/install.sh](scripts/install.sh); review any downloaded script before execution. Requires `sh`, curl and tar.

**Windows:** there is no PowerShell installer. Run the same commands from **Git Bash** or **WSL** — the Mod files go to the same `~/.config/herdr-app` folder.

**If you already downloaded the repository**, run `sh scripts/install.sh`.

To install the Mod files without touching any layout, add `--no-layout` and wire it into your own layout by hand; see the [Project Open notes](mods/project-open/README.md#install-without-touching-any-layout) for the exact JSON.

No Python, Node, jq, sudo, or additional dependency required for installation. The installer copies the mods and **patches a shared personal layout** named `herdr-mods`; a mod that declares a derived layout (the Agent UI preview) also writes that extra file. **Project Open is embedded inside the bottom Status Bar renderer**, immediately after the Commands hint, with the same background and border (not a separate 32px layout block). It preserves machine, agent count, and Commands information. On first install, the installer copies the official `main` layout (or the bundled template) to a personal copy; each subsequent Mod is added to the **same layout**, with a single fixed **`.bak`** backup per changed file/directory (the previous `.bak` is replaced on each update). Shipped layouts are never modified. In a terminal the installer asks `? patch layout herdr-mods [Y/n]` before writing and leaves the layout (even a copy it just created) alone if you answer `n`; non-interactive runs take the default.

**Next:** in Herdr App switch to layout **herdr-mods** (from the layout picker or command palette); alternatively:

~~~sh
herdr-app do layout.switch --name herdr-mods
~~~

The source is available at **https://github.com/hheei/herdr-mods**. Direct-install commands always use the repository's `main` branch; inspect the script first or use a pinned release archive when you need a reproducible build.

### Update

Run the same command again: an existing Mod is moved to `<mod>.bak` and replaced, and a layout is only touched when it actually changes.

~~~sh
curl -fsSL https://raw.githubusercontent.com/hheei/herdr-mods/main/scripts/install.sh | sh
~~~

Backups are fixed `.bak` names, so each install or update replaces the previous one instead of piling up archives. Layout patching is idempotent and never overwrites an existing layout: a Mod is only added when its id is absent, and a customized status bar is left byte-identical (the Mod files are still installed, for manual wiring). The installer migrates earlier Sidebar and split-row Status Bar versions into a seamless single Status Bar renderer. Right-click changes only the default tool and icon; left-click performs the actual open.

The official Herdr App home is **~/.config/herdr-app**, even on Windows. XDG_CONFIG_HOME changes its config root; HERDR_APP_HOME overrides directly.

## Repository layout

~~~text
mods/<name>/        each mod is self-contained (main.js, mod.json, assets, README)
layouts/herdr-mods.json fallback base for the shared personal layout
scripts/            sh installer (local or piped), layout patchers, shared tui.sh
tests/              developer checks
.github/workflows/  CI
~~~

Future mods follow the same structure and can be installed by name. Every install patches the same `herdr-mods` layout with backup, so no manual JSON merging is needed. Installers do not change shipped Herdr App layouts or herdr-core. The layout name is fixed at `herdr-mods` so installs stay predictable; to use a different personal layout, install with `--no-layout` and add the Mod to it by hand.

## Development checks

~~~sh
node tests/project-open.test.cjs
node tests/layout-status.test.cjs
node tests/agent-ui.test.cjs
node --check mods/project-open/main.js
node --check mods/agent-ui/main.js
node --check mods/agent-ui/model.js
sh -n scripts/install.sh
sh tests/install-smoke.sh
sh tests/agent-ui-demo-install.test.sh
~~~

Node is for **developer tests only**. If Herdr App is installed, additionally validate with its official command:

~~~sh
herdr-app check "$HOME/.config/herdr-app/mods/project-open"
~~~

This does not replace visual GUI testing.

## References

Install and configuration behavior follows the upstream [Herdr App installer](https://github.com/herdrdev/herdr-app#install), [Layouts and mods](https://github.com/herdrdev/herdr-app/blob/master/docs/mods.md), [Mod API guide](https://github.com/herdrdev/herdr-app/blob/master/defaults/AGENTS.md), [Security and App Home](https://github.com/herdrdev/herdr-app/blob/master/docs/security.md), and [CLI commands](https://github.com/herdrdev/herdr-app/blob/master/docs/commands.md).

Mods can run programs, read files, and access networks. **Review source code before installing**.

[Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [License](LICENSE) · [Attribution](NOTICE)

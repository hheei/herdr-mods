# Herdr Mods

Small independent mods for [Herdr App](https://github.com/herdrdev/herdr-app). Community project; not an official Herdr release.

## Mods

| Mod | Function |
| --- | --- |
| [Project Open](mods/project-open/README.md) | One sidebar icon; left-click launches the last selected app; right-click chooses VS Code or Finder/file manager. Remote SSH supported for VS Code. |

## Quick install

Install [Herdr App](https://github.com/herdrdev/herdr-app#install) first. Run **on the computer hosting the Herdr App GUI** (not just a remote herdr-core server). **No clone or Python required.**

**macOS / Linux — one line:**

~~~sh
curl -fsSL https://raw.githubusercontent.com/hheei/herdr-mods/main/scripts/bootstrap.sh | sh
~~~

**Windows PowerShell — one line:**

~~~powershell
irm https://raw.githubusercontent.com/hheei/herdr-mods/main/scripts/bootstrap.ps1 | iex
~~~

These commands download a temporary source archive, install the files, and delete the temporary archive. The scripts are [readable here](scripts/bootstrap.sh) and [here](scripts/bootstrap.ps1); review any downloaded script before execution. Requires curl and tar (macOS/Linux) or built-in PowerShell download/ZIP commands (Windows).

**If you already downloaded the repository**, run `sh scripts/install.sh` on macOS/Linux or `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1` on Windows.

No Python, Node, jq, sudo, or additional dependency required for installation. Both scripts install the Mod and a ready-made **personal layout**, leaving all existing Herdr layouts untouched.

**Next:** in Herdr App switch to layout **project-open** (from the layout picker or command palette); alternatively:

~~~sh
herdr-app do layout.switch --name project-open
~~~

The source is available at **https://github.com/hheei/herdr-mods**. Direct-install commands always use the repository's `main` branch; inspect the script first or use a pinned release archive when you need a reproducible build.

### Update

~~~sh
sh scripts/install.sh project-open --update
~~~

~~~powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -Mod project-open -Update
~~~

Updates back up existing mod files and preserve any customized personal layout.

The official Herdr App home is **~/.config/herdr-app**, even on Windows. XDG_CONFIG_HOME changes its config root; HERDR_APP_HOME overrides directly.

## Repository layout

~~~text
mods/<name>/        each mod is self-contained (main.js, mod.json, assets, README)
layouts/<name>.json optional ready-made personal layouts
scripts/            portable sh and PowerShell installers
examples/           manual integration snippets
tests/              developer checks
.github/workflows/  CI
~~~

Future mods follow the same structure and can be installed by name. Installers do not change shipped Herdr App layouts or herdr-core.

## Development checks

~~~sh
node tests/project-open.test.cjs
node --check mods/project-open/main.js
sh -n scripts/install.sh
sh tests/install-smoke.sh
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

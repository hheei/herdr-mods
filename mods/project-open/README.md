# Project Open

Minimal one-icon launcher for Herdr App.

| Gesture | Action |
| --- | --- |
| Left-click | Open the focused Terminal directory with the last chosen tool |
| Right-click | Select Open in VS Code or Open in Finder (File Manager on Linux/Windows) |
| Choose tool | Launch immediately, remember globally, update icon and preserve across app restarts |

Initial choice is **VS Code**. Icon size is 30×30 pixels with no permanent label or arrow. Long-press is not included because Herdr's documented GPUI API does not guarantee a long-press recognizer.

## Install

Run from the project root on the desktop computer running Herdr App.

**macOS/Linux**

~~~sh
sh scripts/install.sh
~~~

**Windows PowerShell**

~~~powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1
~~~

This installs the Mod under **~/.config/herdr-app/mods/project-open/** and creates/patches the shared personal layout **~/.config/herdr-app/layouts/herdr-mods.json**. It backs up existing layouts before changes, does not duplicate the button, and never modifies the shipped main layout. Select **herdr-mods** in the layout picker once; future Mods are added to the same layout.

To patch an existing custom sidebar layout instead, run `sh scripts/install.sh --layout=my-layout` or PowerShell `-Layout my-layout`; the installer will back it up and insert the button. You can still manually use [the example block](../../examples/sidebar-project-open.json). Clone a shipped layout first if needed:

~~~sh
herdr-app do layout.clone '{"name":"main","as":"my-project-layout"}'
~~~

Then insert this block above sidebar-footer:

~~~json
{"id":"project-open","type":"block","size":{"px":38},"content":{"mod":"project-open"}}
~~~

Do **not** edit Herdr's shipped layouts. Shipped files are rewritten on app startup and update.

## Path and machine behavior

The target is the focused Terminal's **cwd**, falling back to the Space folder. This is not necessarily the Git root.

| Space | VS Code | Finder / file manager |
| --- | --- | --- |
| Local | code command, or VS Code URL scheme on macOS/Linux | macOS open, Linux xdg-open, Windows explorer.exe |
| Remote SSH | Local VS Code Remote SSH, using Herdr machine name and remote cwd | Warn; cannot automatically open unmounted remote paths |

For remote VS Code, install the **Remote - SSH** extension and configure an SSH Host alias matching the Herdr Machine name on the local computer. The Mod calls Herdr's official exec() without a remote on option, so it launches the GUI application **locally**.

On macOS, VS Code offers **Shell Command: Install 'code' command in PATH**. URL fallback requires the VS Code URL handler to be registered.

## Preference and troubleshooting

- Last choice is kept in Herdr shared state under project-open.last-action.
- Switching Spaces changes the target directory, not the choice or icon.
- Launcher success does not guarantee VS Code's window opened; check PATH and Remote SSH settings.
- Remote Finder requires a separately mounted folder and explicit mapping. We do not guess paths.
- If desired, run the official check and inspect the real GUI:

~~~sh
herdr-app check "$HOME/.config/herdr-app/mods/project-open"
~~~

The test suite checks simulated behavior, but actual Herdr App GUI rendering and popup interaction have not yet been verified on this development host.

## Update/uninstall

Update via **sh scripts/install.sh project-open --update** or PowerShell install.ps1 -Update. Existing Mod is backed up, and the shared layout is patched only if the button is missing. To remove, switch to a different layout then remove mods/project-open and, optionally, layouts/project-open.json from Herdr App Home. This does not affect running herdr-core sessions.

## Upstream documentation

[Herdr Mod guide](https://github.com/herdrdev/herdr-app/blob/master/defaults/AGENTS.md) · [Layout overview](https://github.com/herdrdev/herdr-app/blob/master/docs/mods.md) · [Security/App Home](https://github.com/herdrdev/herdr-app/blob/master/docs/security.md)

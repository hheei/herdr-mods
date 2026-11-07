# Project Open

Minimal one-icon launcher for Herdr App that sits in the bottom Status Bar next to whatever else lives there. It renders the whole Status Bar row — the original background, border, machine/branch details, agent count and palette hint — so the row keeps looking like the stock bar.

| Gesture | Action |
| --- | --- |
| Left-click | Open the focused Terminal directory with the last chosen tool |
| Right-click | Select Open in VS Code or Open in Finder (File Manager on Linux/Windows) |
| Choose tool | **Only** remember the default and update its icon. Click the main icon later to open. |

Initial choice is **VS Code**. The icon is 15 px inside a 22 px button integrated into the original Status Bar row, with no permanent label, arrow, tooltip, hover highlight or separated background. Long-press is not included because Herdr's documented GPUI API does not guarantee a long-press recognizer.

### Agent UI switch in the same renderer

When the **focused pane is running a recognised agent** — Pi reports itself, as do Claude Code and the others in Herdr's program table — a second 22px icon appears beside Project Open. Pressing it opens the **Agent UI as a window over that pane**; pressing it again closes the window and the icon returns to the terminal glyph. No agent in focus, no button.

It is a window and not a Layout change on purpose:

- Herdr has no command that swaps a pane's terminal for a Mod in place. `pane.split {mod}` makes *another* pane; `terminal.show` swaps one terminal for another.
- A Layout Stack would tie the button to one layout file, which is what an earlier version did — the button then existed only in `agent-ui-demo`, and only for people who had that file.

The window touches neither the Layout nor the PTY: closing it leaves the terminal exactly as it was, and no running process is ever stopped.

## Install

Run from the project root on the desktop computer running Herdr App.

~~~sh
sh scripts/install.sh project-open
~~~

Without a mod name the installer installs every mod in the repository. On Windows run the same command from **Git Bash** or **WSL**.

This installs the Mod under **~/.config/herdr-app/mods/project-open/** and creates/patches the shared personal layout **~/.config/herdr-app/layouts/herdr-mods.json**. It backs up existing layouts before changes, does not duplicate the button, and never modifies the shipped main layout. Select **herdr-mods** in the layout picker once; future Mods are added to the same layout.

The installer looks before it writes and, in a terminal, asks `? patch layout herdr-mods [Y/n]`; answering `n` leaves the layout untouched (a `--no-layout` install skips the question entirely). An already-integrated status bar is left alone, and a status bar that has been customized (any `content.mod` other than the stock `workspace-status`) is left **byte-identical**: the Mod files are still installed and you are asked to wire it in by hand. A new Mod is only added when its id is absent, so existing entries and file formatting survive.

### Install without touching any layout

Add `--no-layout` to copy the Mod files only, then wire it into your own layout by hand.

~~~sh
sh scripts/install.sh --no-layout
~~~

The Status Bar is a row, and this Mod takes a share of it. In **~/.config/herdr-app/layouts/your-layout.json**, inside the `work` column, the stock node looks like this:

~~~json
{
  "id": "status",
  "type": "block",
  "size": { "px": 28 },
  "content": { "mod": "workspace-status" }
}
~~~

Give it children and put this Mod in:

~~~json
{
  "id": "status",
  "type": "row",
  "size": { "px": 28 },
  "children": [
    { "id": "status-bar-project-open", "type": "block", "weight": 1,
      "content": { "mod": "project-open" } }
  ]
}
~~~

That `status-bar-` id prefix is the only thing the installer relies on: it recognises the row, and appends a Mod that is missing without moving or removing anything already in it. Any other Mod can join the same row the same way.

Keep a copy of the file first, switch to that layout in Herdr App, then validate with `herdr-app check "$HOME/.config/herdr-app/mods/project-open"`. These `herdr-app` commands need the App running on this machine; they are not a separate CLI. Machine, branch, agent count and the Commands hint stay because the Mod renders them itself. A sidebar entry also works, but the whole status row then renders inside the sidebar. Two Mods with `weight: 1` split the row; give one a `px` size to pin it.

The installer backs up the personal Layout to a single `*.bak` file, then **turns the `status` block into a row and adds Project Open to it**, keeping whatever else that row already held. To keep a different personal layout, install with `--no-layout` and see the manual section below. Older Sidebar entries and split-row status versions are migrated automatically. The original shipped `workspace-status` mod is not modified. Clone a shipped layout first if needed:

~~~sh
herdr-app do layout.clone '{"name":"main","as":"my-project-layout"}'
~~~

There is no need to modify JSON by hand. The installer performs the Status Bar patch and keeps just one backup per asset, overwriting the earlier one: the Layout keeps a `*.bak` beside itself, a replaced Mod goes to `~/.config/herdr-app/backups/<mod>/` — never inside `mods/`, where Herdr would read the backup as another Mod and report it as broken.

Do **not** edit Herdr's shipped layouts. Shipped files are rewritten on app startup and update.

## Path and machine behavior

The target is the focused Terminal's **cwd**, falling back to the Space folder. This is not necessarily the Git root.

| Space | VS Code | Finder / file manager |
| --- | --- | --- |
| Local | `code` on PATH (install it via VS Code: *Shell Command: Install 'code' command in PATH*) | macOS open, Linux xdg-open, Windows explorer.exe |
| Remote SSH | Local VS Code Remote SSH, using Herdr machine name and remote cwd | Warn; cannot automatically open unmounted remote paths |

For remote VS Code, install the **Remote - SSH** extension and configure an SSH Host alias matching the Herdr Machine name on the local computer. The Mod calls Herdr's official exec() without a remote on option, so it launches the GUI application **locally**.

If the `code` command is missing, the click fails with a notification; no URL-scheme fallback is attempted.

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

Update by running the same install command again. An existing Mod is moved to `~/.config/herdr-app/backups/project-open/` and replaced, and the shared layout is updated only when needed, including migrating the old Sidebar or split-row placement. To uninstall, switch to another layout and remove the Mod directory; to keep your shared personal layout while removing its button, restore a pre-install Layout backup or edit the personal Layout. This does not affect running herdr-core sessions.

## Upstream documentation

[Herdr Mod guide](https://github.com/herdrdev/herdr-app/blob/master/defaults/AGENTS.md) · [Layout overview](https://github.com/herdrdev/herdr-app/blob/master/docs/mods.md) · [Security/App Home](https://github.com/herdrdev/herdr-app/blob/master/docs/security.md)

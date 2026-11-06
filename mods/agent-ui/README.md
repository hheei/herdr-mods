# Pi Agent UI — P0 Native GPUI Prototype

A **functional, fixture-driven native Herdr App Mod**. It is a prototype of the conversation and tools interface, **not** a live Pi client.

## What works

- Native Herdr GPUI view with **Working / Completed / Needs attention** fixtures.
- Interactive tool disclosure, per-fixture status labels and in-view search.
- Multiline Composer: typing and **Try send (demo)** only add local mock bubbles.
- A **Terminal | UI · demo** control embedded in the existing Status Bar renderer (alongside Project Open) in the opt-in demo layout.
- Switching the preview does **not** start, stop, detach, kill, send keys to or restart any Core terminal or Pi program.

**Important limitation:** The demo uses a **chrome Layout Stack around the entire active Tab body**, because the public Herdr API does not expose safe replacement of one arbitrary split model Pane. If a Tab has several Panes, **all of them are hidden together** while UI demo is shown; the processes continue running. This is **not yet** the final same-Pane switching promised in the design. That requires host work described in [P0 feasibility notes](../../docs/agent-ui/03-architecture.md#2-最難的缺口真正的同一原生-pane).

## Install the demo

Run on the computer hosting the **Herdr App GUI**, from a checkout of this repository:

```sh
sh scripts/install.sh agent-ui project-open
```

What it does:

1. Copies `mods/agent-ui` and `mods/project-open` into Herdr App Home, moving any existing copy to a single `.bak`.
2. Applies each mod's declared wiring: Project Open (`mod.json` → `"install": "status"`) patches the status bar of `herdr-mods` once, asking first in a terminal; Agent UI (`"install": "derive:agent-ui-demo"`) generates `layouts/agent-ui-demo.json` **from your own layout**: it reuses `layouts/herdr-mods.json` if you have one, otherwise the repository template, and wraps only the tab renderer (`work-body` → `main`) in the demo stack. Your `herdr-mods`, `main` and every other layout stay byte-identical.
3. Changes nothing else: no layout switch, no agent start, no Pi extension, no Session JSONL, no `herdr-mods` edit.

Then pick **agent-ui-demo** in the Layout picker, or:

```sh
herdr-app do layout.switch --name agent-ui-demo
```

The Status Bar now shows **Terminal | UI · demo** next to Project Open. Click **UI · demo** for the fixture conversation, **Terminal** to return to the normal tab view.

The **Terminal | UI · demo** control is drawn by the Project Open status renderer, so the generated layout also runs the usual status patch (a personal `herdr-mods.json` keeps its existing renderer; the bundled template is patched the same way as `install.sh`). If your status bar has been customized to another Mod, the demo layout still works but the toggle will not appear until you wire `content.mod: "project-open"` by hand.

Re-running the same command refreshes the demo: each replaced Mod gets one `.bak` folder and a changed `agent-ui-demo.json` goes to `agent-ui-demo.json.bak`. If your personal layout no longer starts `work-body` with the tab renderer (for example after renaming that block by hand), the generated layout is skipped with `! layout left unchanged` and the Mods are installed anyway — wire the stack by hand in that case.

```
$ sh scripts/install.sh agent-ui project-open
  ✓ mods agent-ui + project-open → ~/.config/herdr-app/mods
  ✓ layout agent-ui-demo → ~/.config/herdr-app/layouts/agent-ui-demo.json

  → switch Herdr App to layout agent-ui-demo  ·  preview only: hides the active tab view, never stops the process
```

## Try the interactions

1. In **UI · demo**, switch between **Working**, **Completed** and **Needs attention**.
2. Click a tool row to expand/collapse details. Failures remain identifiable in the scenario.
3. Use **Search this preview…** to filter the current mock conversation.
4. Type Chinese or English in the multiline Composer and click **Try send (demo)**. A local mock response appears, but **nothing is sent**.
5. Use the Status Bar **Terminal** button to return to the same Terminal/Tab view.

This is a development prototype. Markdown rich text, perfect scroll anchoring, complete keyboard/IME handling, real runtime events and secure two-way control are **not** claimed as complete. The next milestone is [post-prototype UI/UX polish](../../docs/agent-ui/07-post-prototype-polish.md).

## Test & scope

```sh
node tests/agent-ui.test.cjs
node tests/project-open.test.cjs
sh tests/agent-ui-demo-install.test.sh
```

The environment used to build this prototype did not have the `herdr-app` desktop executable, so `herdr-app check`, a real window screenshot and direct GPUI rendering could **not** be performed here. Before treating it as visually validated, run:

```sh
herdr-app check "$HOME/.config/herdr-app/mods/agent-ui"
herdr-app check "$HOME/.config/herdr-app/mods/project-open"
herdr-app shot agent-ui-demo.png
```

Expected behavior is backed by the official [Herdr App Mod documentation](https://github.com/herdrdev/herdr-app/blob/master/defaults/AGENTS.md) and [Pi UI design decisions](../../docs/agent-ui/06-decisions.md). It must be verified in a running App.

## Uninstall / return to normal

Switch back to **herdr-mods** (or your previous Layout). Optionally delete the personal `layouts/agent-ui-demo.json` and `mods/agent-ui` under Herdr App Home. Do not delete `mods/project-open` if other layouts use it. Existing terminals keep running when the demo layout is no longer active.

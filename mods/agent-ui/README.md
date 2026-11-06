# Agent UI — Native Herdr Demo

This is a **standalone, installable native-GPUI fixture demo**. It does not use WebView, does not read Pi's Session JSONL and does not send commands to Pi. There is **one canonical Agent UI Mod** at `mods/agent-ui/`, with the updated demo design.

## Try the demo

From this repository checkout, **on the machine where the Herdr App GUI is running**:

```sh
sh scripts/install.sh agent-ui project-open
```

Select the **`agent-ui-demo`** layout in Herdr's Layout picker, or, if the CLI is installed:

```sh
herdr-app do layout.switch --name agent-ui-demo
```

The usual Status Bar (rendered by `project-open`) shows **one small icon**. On the Terminal view, it is a conversation icon to switch to the Agent UI. In the Agent UI, it becomes a terminal icon to switch back. No tooltip, no extra status-bar slot, no two-part control. The old two-button segmented control has been removed.

The installer derives `agent-ui-demo.json` from your own `herdr-mods.json` if available, otherwise the repo template. It does not replace `main` or the user's normal `herdr-mods` layout with the demo; it creates or refreshes `agent-ui-demo` with one `.bak` backup. However, installing `project-open` also patches the `herdr-mods` Status Bar if it is still the standard one (with its normal single `.bak`). Modified demo files and replaced Mods are backed up to one `.bak`. The installer may ask you to confirm a change in an interactive terminal.

## What you can interact with

1. **Seven synthetic turns** are shown in the same conversation. There is no row of Working/Completed/Needs-attention fixture buttons and no search input.
2. **Tool Activity** is a compact one-line summary, **collapsed by default**. Click it to reveal text-only tool rows; click an individual row to inspect its detail. Failed/pending states are visible in the collapsed summary.
3. **Native Markdown** is passed to the official `TextView.markdown(id, text)` interface rather than `para()`. A test turn includes headings, bold, italics, inline and fenced code, and a quote.
4. **Message Rail** on the right: one **4px circular dot** per user turn; **every visible turn becomes an 8px circle**, centered in the same 23px hit target. Clicking scrolls the **same continuous conversation**; earlier turns remain mounted. Hover shows **one short question** (a second line only for explicit user action). Tool status never affects dots. There is no separate vertical highlighted rail stripe.
5. **Composer (demo only)** echoes your input as a synthetic user turn with a local response. It never sends, queues or changes a real Pi prompt.

### Scope limits

- **Layout Stack, not an independent Pane:** The optional layout wraps the active Tab block in a **chrome Layout Stack**. Agent UI is a Stack child, not a newly created model Pane. Existing PTYs/agents keep running; sibling split Panes are hidden together while the demo is shown. This does not yet provide independent per-split presentation.
- **Working native-style Scrollbar:** The conversation has a subtle **1px track and 4px rounded thumb** at the right edge. Clicking the track jumps; dragging the thumb scrolls; wheel input, Message Rail click, viewport resize and expanding tool rows all update **the same measured transcript `scrollY`**. The bar disappears when nothing can scroll. This is a purpose-built GPUI control **styled like Herdr's Terminal scrollbar**, not `gpui-base.Scrollbar.vertical`: that component would own a separate native scroll offset. No second scroll position is introduced. Pointer movement outside the view, very long history, keyboard and screen reader accessibility still require target-App validation.
- **Markdown:** The tests verify that the original Markdown text is passed to `TextView.markdown`. Rendering fidelity, code blocks, links, selection, mathematics and import/export availability must be verified using your **actual Herdr App version**.
- **Hover:** Uses native `.on_hover` and a lightweight in-view preview. The popover is inset to leave space for the Rail **and** Scrollbar. Positioning, clipping, keyboard/screen-reader accessibility and focus restoration need target-App visual/interaction QA.
- **Tool activity:** A collapsed group has no right-aligned status badge; an inline count may indicate failed operations, but **a tool failure does not imply user attention**. Only opened tool rows/details show tool-specific outcome and the Rail never uses tool status colors.
- **Stack child appearance:** No separate Pane Frame is created. The Agent UI Stack child mimics Herdr's Main Layout with a **10px radius**, **1px theme-border**, clipped children and a **38px header with subtle divider**. The Terminal pane's frame remains Host-owned. If the Host later frames the UI itself, remove the child border to avoid a double outline.
- The fixture UI is not connected to live Pi events. No JSONL reader, historical index, shell process or agent lifecycle hook is used.

## Tests

```sh
node tests/agent-ui.test.cjs
node tests/project-open.test.cjs
sh tests/agent-ui-demo-install.test.sh
```

On a computer with Herdr App installed, additionally verify the actual runtime:

```sh
herdr-app check "$HOME/.config/herdr-app/mods/agent-ui"
herdr-app check "$HOME/.config/herdr-app/mods/project-open"
herdr-app shot agent-ui.png
```

This development environment could execute deterministic Node mocks and isolated installation tests but has not proven actual native App rendering. Keep `agent-ui-demo` opt-in until real screenshots confirm Markdown, rail hover location and status-bar blending.

Full design and acceptance constraints: [10 · Tool Activity + Live Rail](../../docs/agent-ui/10-tool-activity-live-rail.md). Implementation and remaining gaps: [11 · Agent UI Demo](../../docs/agent-ui/11-agent-ui-demo-implementation.md).

To return to your normal working environment, select your previous Layout in Herdr App. There is no need to stop Pi or delete any session.

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
4. **Message Rail** on the right: one marker per user question; click a marker to display a transcript **window starting at that turn**. Hover a marker for **one short user question**, with a second warning line only for an unresolved actionable state. No model, tool counts, assistant answer or timestamp in the hover.
5. **Composer (demo only)** echoes your input as a synthetic user turn with a local response. It never sends, queues or changes a real Pi prompt.

### Scope limits

- **Same Tab display, not same model split Pane:** The optional layout wraps the whole active Tab block in a chrome stack. Existing PTYs/agents keep running but sibling split Panes are hidden together while the demo is shown. This is **not** final per-Pane switching.
- **Rail jump is a demo-only transcript window jump:** Selecting an anchor changes the windowed list to start at the selected turn; it does *not* claim a pixel-accurate scroll-to-turn in a continuously mounted transcript. Earlier turns remain reachable from the rail or **Earlier turns** control. The host does not expose a verified scroll-to-key hook. Viewport-driven active-marker updates while free scrolling are not yet implemented.
- **Markdown:** The tests verify that the original Markdown text is passed to `TextView.markdown`. Rendering fidelity, code blocks, links, selection, mathematics and import/export availability must be verified using your **actual Herdr App version**.
- **Hover:** Uses native `.on_hover` and a lightweight in-view preview. Positioning, clipping, keyboard/screen-reader accessibility and focus restoration need target-App visual/interaction QA.
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

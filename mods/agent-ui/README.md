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

1. **A 60-turn synthetic conversation** fills one continuous transcript: 7 scripted turns (Markdown, tool groups, a failure, an in-flight one) followed by 53 generated follow-ups of varying height, so the rail's bucketing, scrubbing and the measured scroll are visible immediately. There is no row of Working/Completed/Needs-attention fixture buttons and no search input, and nothing is randomised — every launch shows the same history.
2. **Tool Activity** is a compact one-line summary, **collapsed by default**. Click it to reveal text-only tool rows; click an individual row to inspect its detail. Failed/pending states are visible in the collapsed summary.
3. **Native Markdown** is passed to the official `TextView.markdown(id, text)` interface rather than `para()`. A test turn includes headings, bold, italics, inline and fenced code, and a quote.
4. **Message Rail IS the scrollbar**: one **18px-wide interaction strip** containing only user-turn dots, **no track or thumb**. The column is fixed at the vertical centre, dots are **3px apart**, and the whole column never exceeds **40% of the view height**. A dot is **6px at the ends and grows to 11px at the reading position** (a Gaussian packet centred on the dot nearest the viewport centre), so the focus reads as one spot instead of a highlighted range. Hover shows one short user prompt; tool status never affects dot color. **Tap a dot to jump; drag vertically anywhere along the rail to scrub** (5px threshold for a dot press). Space above and below the column also scrubs proportionally.
5. **Composer (demo only)** echoes your input as a synthetic user turn with a local response. It never sends, queues or changes a real Pi prompt.

### Scope limits

- **Layout Stack, not an independent Pane:** The optional layout wraps the active Tab block in a **chrome Layout Stack**. Agent UI is a Stack child, not a newly created model Pane. Existing PTYs/agents keep running; sibling split Panes are hidden together while the demo is shown. This does not yet provide independent per-split presentation.
- **Dots-only scrolling:** The rail dots themselves indicate the reading position, so there is **no separately rendered scrollbar track, thumb, or highlight window**. Wheel, dot jump, drag-to-scrub, viewport resize and tool expansion share the same measured transcript `scrollY`. A short press on a dot jumps on release; moving 5px or more converts that gesture to scrubbing. Space above and below the column can also be clicked or dragged to scroll. In an extremely short viewport the entire rail hides instead of overflowing. **Dense histories merge turns into buckets** (`perDot = ceil(turns / maxDots)`, where `maxDots` is what the 40% column holds) rather than sampling turns away: every turn stays reachable, a dot jumps to its bucket's first turn and its hover appends `+N`. This follows the usual editor-scrollbar answer to saturated markers (proportional position plus merging), not the minimap answer of shrinking every marker. True out-of-view pointer capture, keyboard and screen-reader support still need target-App validation.
- **Markdown:** The tests verify that the original Markdown text is passed to `TextView.markdown`. Rendering fidelity, code blocks, links, selection, mathematics and import/export availability must be verified using your **actual Herdr App version**.
- **Hover:** One lightweight preview is driven by pointer movement in the **combined strip**. It is clamped inside the conversation viewport and inset from the single right-side strip. Positioning, clipping, keyboard/screen-reader accessibility and focus restoration need target-App visual/interaction QA.
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

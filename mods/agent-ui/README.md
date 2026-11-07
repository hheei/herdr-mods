# Agent UI — Native Herdr Demo

This is a **standalone, installable native-GPUI fixture demo**. It does not use WebView, does not read Pi's Session JSONL and does not send commands to Pi. There is **one canonical Agent UI Mod** at `mods/agent-ui/`, with the updated demo design.

## Try the demo

From this repository checkout, **on the machine where the Herdr App GUI is running**:

```sh
sh scripts/install.sh agent-ui project-open
```

Select the **`agent-ui-demo`** layout in Herdr's Layout picker, or, if the CLI is installed:

```sh
herdr-app do layout.switch '{"name":"agent-ui-demo"}'
```

The usual Status Bar (rendered by `project-open`) shows **one small icon**. On the Terminal view, it is a conversation icon to switch to the Agent UI. In the Agent UI, it becomes a terminal icon to switch back. No tooltip, no extra status-bar slot, no two-part control. The old two-button segmented control has been removed.

The installer derives `agent-ui-demo.json` from your own `herdr-mods.json` if available, otherwise the repo template. It does not replace `main` or the user's normal `herdr-mods` layout with the demo; it creates or refreshes `agent-ui-demo` with one `.bak` backup. However, installing `project-open` also patches the `herdr-mods` Status Bar if it is still the standard one (with its normal single `.bak`). Modified demo files and replaced Mods are backed up to one `.bak`. The installer may ask you to confirm a change in an interactive terminal.

## What you can interact with

1. **A 60-turn synthetic conversation** fills one continuous transcript: 7 scripted turns (Markdown, tool groups, a failure, an in-flight one) followed by 53 generated follow-ups of varying height, so the rail's bucketing, scrubbing and the measured scroll are visible immediately. There is no row of Working/Completed/Needs-attention fixture buttons and no search input, and nothing is randomised — every launch shows the same history.
2. **Tool Activity** is a compact one-line summary, **collapsed by default**. Click it to reveal text-only tool rows; click an individual row to inspect its detail. Failed/pending states are visible in the collapsed summary.
3. **Native Markdown** is passed to the official `TextView.markdown(id, text)` interface rather than `para()`. A test turn includes headings, bold, italics, inline and fenced code, and a quote.
4. **Message Rail IS the scrollbar**: one **18px-wide interaction strip** containing only user-turn dots, **no track or thumb**. The column is fixed at the vertical centre, **right-aligned 3px from the strip edge**, dots are **3px apart** and drawn at **70% opacity**, and the whole column never exceeds **40% of the view height**. A dot is **4px at the ends and grows to 9px at the reading position** (a Gaussian packet centred on the dot nearest the viewport centre), so the focus reads as one spot instead of a highlighted range. Hover shows one short user prompt; tool status never affects dot color. **Tap a dot to jump; drag vertically anywhere along the rail to scrub** (5px threshold for a dot press). Space above and below the column also scrubs proportionally.
5. **Keyboard** works without a pointer: the Stack view takes focus (`track_focus` + `on_key_down`), **↑/↓ move the selected dot**, **Home/End** jump to the first/last bucket, **Enter** jumps to it, **Esc** clears focus and the preview. The focused dot is drawn solid, and it shows the same preview hover shows.
6. **States are rendered, not implied.** The chip in the header cycles **DEMO → OFFLINE → EMPTY**: offline shows a banner, keeps the last turns readable and refuses to send ("nothing was sent or queued"); empty replaces the transcript with what is actually missing instead of a spinner. **Sticky bottom:** a turn that arrives while you are reading above does **not** move the transcript — a `↓ N new` counter appears and jumping clears it. `+ turn` (wide panes) simulates such an arrival; at the bottom, growth follows.
7. **Narrow panes** (under 240px wide, or a very short view) drop the strip and show a **Turns** button that opens the same buckets as a short list, so navigation is not lost.
8. **Bridge (read-only).** `bridge/herdr-agent-ui.js` is one Pi extension file that publishes this session as three small files in `~/.config/herdr-app/agent-ui/bridge/<pid>/`: `done.json` (settled turns), `live.json` (the turn in flight, rewritten at most every 200 ms) and `meta.json` (epoch, session id, cwd, pid, closed). Nothing is appended, so nothing needs pruning. Pi auto-discovers a single `*.js` in its extension folder, and `sh scripts/install.sh` does that copy for you (honouring `PI_CODING_AGENT_DIR`, keeping one `.bak`). By hand it is the same one file:

   ```sh
   cp mods/agent-ui/bridge/herdr-agent-ui.js ~/.pi/agent/extensions/
   ```

   Reading it back needs the bridge source: `main.js` switches to it when a Mod sets `shared("agent-ui-source", "bridge")` (the hook P2's pane binding will use; today it is opt-in and off by default). `bridge-source.js` then watches the newest producer folder, seeds from `done.json`, and replaces one turn per `live.json` revision — no polling, no delta log.

   The first read after a restart is the whole session: the extension rebuilds every turn from Pi's own branch (`getBranch()`, which keeps pre-compaction messages and skips abandoned branches), so closing and reopening Pi does not lose the transcript. A folder left by a Pi that exited is removed by the next one that starts.

   It is read-only and guarded: a failed write never stops the agent, and nothing is sent to Pi. Remove it by deleting that one file. The whole extension is covered by `node tests/agent-ui-bridge.test.cjs`, and `node --check` runs it in CI.
9. **Usage, compaction, questions.** Each turn shows the tokens and cost its messages report (`1.2k tok · $0.0042`); a compaction boundary appears as a divider instead of a gap; and when `@hheei/pi-ask-user` is waiting on an answer, `live.json` carries `asking` — the heading, the questions and their options, from the plugin's `pi-ask-user:question` event. The question takes over the composer's slot rather than floating above the transcript — answering is a reply, so it belongs where replies are typed, in the same shell, with nothing moving when it opens. Rows follow pi-ask-user's own list rhythm: the question, its context, one row per option (number, title, description), a `Type your own answer` row when freeform is allowed, then the keys. One single-choice question answers on click or `1`-`9`, `escape` declines; multi-select and batches collect ticks and wait for **Send answer**, because those have more than one step. The Mod writes `answer.json` beside the state files, the bridge hands it to the plugin's `pi-ask-user:answer` channel, and the plugin resolves its own prompt with it. Last one wins: the file is deleted when it is read and again when the next prompt opens, so a click that lost the race to the Terminal cannot answer the following question. Multi-select, freeform and batch questions still say `answer in the Terminal`, because those need a text field or several steps. Pi has no "the agent is waiting for you" event of its own, so this whole path is an adaptation to that plugin; without it `asking` stays null and nothing claims to be waiting.

10. **Bounded history.** The reducer keeps the newest 200 turns and reports what fell off; the view forgets those heights and puts the turn that was on top back on top. Rendering, not geometry, is what grows: 200 turns build in ~2ms a frame, 2000 in ~27ms. The rail lays out the turn *order*, never heights, so an unmeasured turn cannot wrong-foot it.
11. **Layering.** `model.js` is geometry, `state.js` is the event reducer (`applyEvent` returns a new transcript), `fixtures.js` is one source (`snapshot/take/step`), and `main.js` only pumps and renders. A bridge is a second source emitting the same events — not a rewrite of the view.
12. **Streaming replay.** `▶ stream` appends a working turn, then pushes it in 14 chunks on `cx.timer.every(140, …)` — the same `appendTurn()` path a real bridge event will use, so bucket recalc, sticky bottom and the `↓ live` counter are not special cases. Read above and nothing moves; sit at the bottom and it follows; `⏭ finish` completes it. Completing is honest: the turn ends `done` with the full text, and further ticks are ignored.
13. **Composer (demo only)** echoes your input as a synthetic user turn with a local response. It never sends, queues or changes a real Pi prompt.

### Scope limits

- **Layout Stack, not an independent Pane:** The optional layout wraps the active Tab block in a **chrome Layout Stack**. Agent UI is a Stack child, not a newly created model Pane. Existing PTYs/agents keep running; sibling split Panes are hidden together while the demo is shown. This does not yet provide independent per-split presentation.
- **Dots-only scrolling:** The rail dots themselves indicate the reading position, so there is **no separately rendered scrollbar track, thumb, or highlight window**. Wheel, dot jump, drag-to-scrub, viewport resize and tool expansion share the same measured transcript `scrollY`. A short press on a dot jumps on release; moving 5px or more converts that gesture to scrubbing. Space above and below the column can also be clicked or dragged to scroll. In an extremely short viewport the entire rail hides instead of overflowing. **Dense histories merge turns into buckets** (`perDot = ceil(turns / maxDots)`, where `maxDots` is what the 40% column holds) rather than sampling turns away: every turn stays reachable, a dot jumps to its bucket's first turn and its hover appends `+N`. This follows the usual editor-scrollbar answer to saturated markers (proportional position plus merging), not the minimap answer of shrinking every marker. True out-of-view pointer capture, keyboard and screen-reader support still need target-App validation.
- **Markdown:** The tests verify that the original Markdown text is passed to `TextView.markdown`. Rendering fidelity, code blocks, links, selection, mathematics and import/export availability must be verified using your **actual Herdr App version**.
- **Hover:** One lightweight preview is driven by pointer movement in the **combined strip**. It is clamped inside the conversation viewport and inset from the single right-side strip. Positioning, clipping, keyboard/screen-reader accessibility and focus restoration need target-App visual/interaction QA.
- **Tool activity:** A collapsed group has no right-aligned status badge; an inline count may indicate failed operations, but **a tool failure does not imply user attention**. Only opened tool rows/details show tool-specific outcome and the Rail never uses tool status colors. A detail shows at most **18 lines / 4000 characters** and then says how many lines it dropped and that the full output stays in the Terminal; an `edit` detail without a hunk header is marked **partial** instead of looking complete; an unknown tool kind is printed as it is rather than relabelled Read/Run/Edit.
- **Keyboard, not accessibility:** Herdr exposes no accessibility tree, labels or screen-reader hooks (see [01 §4](../docs/agent-ui/01-evidence.md)), so this demo claims **keyboard reachability only**. Screen-reader support is a host gap, not something this Mod can add. No global shortcuts ship either: keys work while the Stack view has focus, and binding `keys.json` is left to the person.
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

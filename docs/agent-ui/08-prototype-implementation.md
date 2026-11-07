# 08 · 早期 P0 原型記錄（已退役）

**歷史文件。這一版的 P0 原型程式已由後續的 Agent UI 實作覆蓋，並沒有保留舊版程式。** 本文下方的場景按鈕、搜尋欄與逐工具卡片描述，僅記錄當時的設計問題，**不能當成目前 `mods/agent-ui` 的功能清單**。目前唯一的 Demo 及測試結果請看 [11 · Agent UI Demo](11-agent-ui-demo-implementation.md)。

The goal of P0 is to obtain a **working native GPUI interaction prototype** while respecting the non-interruption rule. The project now contains a safe demo path, with a **known host API gap** that prevents claiming production-grade per-model-Pane switching.

## What is implemented

| Requirement | Current state | Evidence |
| --- | --- | --- |
| Native GPUI conversation view | **Implemented (fixtures)** | `mods/agent-ui/main.js`; `mods/agent-ui/fixtures.js` |
| Working / Completed / Needs attention | **Implemented** | Scenario controls and visible status |
| Tool disclosure | **Implemented** | Individual expandable/collapsible tool rows |
| In-view search | **Implemented for fixture content** | Native `InputState + Input`; no disk index |
| Multiline Composer | **Implemented as local mock** | Native `TextareaState + Textarea`; mock echo only |
| Status Bar Terminal/UI control | **Implemented for isolated demo layout** | `project-open` renderer, visible only while `layout === agent-ui-demo` |
| UI and Terminal share same screen rectangle | **Implemented only for a chrome Tab-body stack** | `scripts/demo-layout.awk` output |
| Truly same *model split Pane* switching | **Blocked on host capability** | No verified public per-pane alternate body presenter |
| Real Pi session events / secure commands | **Not started, explicitly outside P0** | P2/P3 in [05](05-delivery-and-tests.md) |
| Real macOS GPUI rendering | **Not verified in this host environment** | `herdr-app` executable absent on development Linux host |

**Original post-test findings (historical):** the three large Working／Completed／Needs attention buttons selected fixtures, not agent states; the Status Bar had a two-part text switch; the search field stayed visible; each tool was a bordered box; `para()` did not parse Markdown. These have been replaced in the **single current demo** by a single SVG, grouped tools and a native Markdown API call. See [09 · P0 feedback](09-p0-feedback-round1.md) and [11 · current implementation](11-agent-ui-demo-implementation.md). Actual GPUI rendering still needs verification.

**Second-round design:** typed Tool Activity details and a minimal right-edge navigation rail inspired by HW1 and pi-harness. See [10](10-tool-activity-live-rail.md). The current demo provides an initial compact rail with a **windowed** jump, not a verified pixel-accurate scroll-to-turn.

**Current structure:** only `mods/agent-ui/` and the derived `agent-ui-demo` layout are supported. The original version has been **replaced rather than retained**; see [11](11-agent-ui-demo-implementation.md).

### Structure

```text
mods/
  agent-ui/
    main.js                   Native GPUI fixture view
    fixtures.js               Scripted 7 turns + 53 generated = 60-turn demo
    model.js                  Tool activity and rail projections (current)
    mod.json                  place:none; focusable:true
    README.md                 Install, use, safety, known limitations
    layout.json               derive: "agent-ui-demo"
  project-open/
    main.js                   Existing status renderer + demo-only toggle
    layout.json               status-bar: { order: 10 }

scripts/
  install.sh                  Copies mods, then applies their declared wiring
  patch-status.awk            Status bar patch (idempotent, fail-closed)
  tui.sh                      Shared colours, prompts and layout commit helper
  demo-layout.awk             Generates the demo chrome stack from a personal layout
  patch-sidebar.awk           Optional sidebar entry, used by a mod's own hook

tests/
  agent-ui.test.cjs           Fixture interaction and layout contract
  agent-ui-demo-install.test.sh  Isolated install, update, backup and layout noninterference
  project-open.test.cjs       Project-open and demo status-button actions
```

The `agent-ui-demo` stack contains an original `content: {tab: 'active', pane: ...}` terminal presenter and a `content: {mod: 'agent-ui'}` fixture presenter. The Status Bar calls `run('layout.select', {stack:'agent-ui-demo-surface',child:'...'})`, so **Core/Pi is neither restarted nor sent any input by the demo**. Because the chrome stack wraps the active Tab renderer, any sibling model Panes disappear from the **view** when the fixture UI is selected; their processes continue running. This is a temporary preview technique and **must not be described as per-Pane toggle**.

## Safe installation

From the checkout, on the machine actually running the Herdr App GUI:

```sh
sh scripts/install.sh agent-ui project-open
```

Switch explicitly to layout **agent-ui-demo** from the Layout picker. The installer does not activate it, change `herdr-mods`, kill terminals or install a Pi extension. Re-running it refreshes the demo and backs up a changed layout to `agent-ui-demo.json.bak`.

To return to your normal workflow, switch to your previous Layout. Full instructions: [Agent UI Mod README](../../mods/agent-ui/README.md).

## What P0 deliberately does not prove

1. **Strict per-Pane replacement:** A real Herdr model Pane must keep its PaneId/TerminalView/PTY, hold its own mode state, and change only its own body. `layout.select` is chrome scoped, not that API.
2. **Rendering quality:** Static Node mocks and JSON validation do not prove GPUI's actual geometry, scroll interactions, IME behavior or layout of native `Textarea`; screenshots and `herdr-app check` are still required on a host with the App.
3. **Live semantics:** Fixture event/status text is explicitly synthetic. Even if the UI looks like Pi, it never reads a Session JSONL or sends prompts to Pi.
4. **Native Markdown completeness:** The retired version's `para()` did not parse Markdown; the canonical Demo now calls `TextView.markdown(id, text)`. Rendering and target-version compatibility still need live validation; see [FB-05](09-p0-feedback-round1.md).
5. **Production multi-Pane routing:** No Pi identification or runtime binding is used in the chrome demo. The final status toggle must target captured focused-Pane identity and epoch, not the active Tab or a guessed cwd.

## Host feasibility next step (blocking for the final product)

Use the actual installed Herdr App version and a safe test Pi to verify a proposal such as:

```ts
interface AlternatePaneSurface {
  attach(paneId: string, terminalAddress: string, mod: string): void;
  setVisible(paneId: string, surface: "terminal" | "mod", epoch: string): void;
  mode(paneId: string): "terminal" | "mod";
}
```

This is a **proposed** App presenter extension, not an existing command. It must retain the native terminal view, its scrollback/Kitty images, focus restoration and PTY dimensions without detach or restart. Only after this gate can the Status Bar control become a true focused-Pane toggle. See [03](03-architecture.md) and [07](07-post-prototype-polish.md).

## Validation executed locally

- Node fixture UI interaction and mock-send tests.
- Status renderer menu, launcher and demo-only toggle command tests.
- Chrome layout structure assertions.
- Isolated POSIX installer test with a fake `HERDR_APP_HOME`; one `.bak` target and no overwrite of `herdr-mods.json`.
- Existing project-open and layout tests.

**No actual App or Pi process was altered.** The next action is real Herdr App visual QA on the user's GUI machine, followed by P1 polish based on screenshots and usage.

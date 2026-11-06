// Synthetic P0 fixture only. Never reads or writes a live Pi session.
export const CASES = [
  {
    id: "working",
    label: "Working",
    status: "working",
    subtitle: "Implementing the native pane UI",
    rows: [
      { id: "w-user", role: "user", text: "請幫我檢查這個 Agent UI 的實作。Terminal 不能被重新建立，工具也不能重跑。" },
      { id: "w-note", role: "assistant", text: "我會先確認 Pane 與 PTY 的生命週期，然後實作不影響執行的呈現層。\n\n首先處理兩個問題：切換的對象必須是當前 Pane，以及 UI 不能擁有 Agent 程序。" },
      { id: "w-tools", role: "tools", label: "Activity", items: [
        { id: "w-read", kind: "read", title: "Read 8 files", subtitle: "src/window.rs · src/layout.rs · 6 more", status: "done",
          detail: "Read src/window.rs\nRead src/layout.rs\nRead src/terminal.rs\nRead src/model.rs\nRead docs/mods.md\nRead defaults/AGENTS.md\nRead defaults/herdr.d.ts\nRead defaults/layouts/main.json" },
        { id: "w-search", kind: "search", title: "Search 12 matches", subtitle: "layout.select · TerminalView · surface", status: "done",
          detail: "12 matches across 4 files.\nSee source evidence for the precise set of layout commands." },
        { id: "w-compile", kind: "exec", title: "Run prototype tests", subtitle: "node tests/agent-ui.test.cjs", status: "running",
          detail: "Validating fixture interactions and split-pane routing.\nAwaiting test completion (fixture; not a real shell process)." },
      ] },
      { id: "w-tail", role: "assistant", text: "目前已確認：原有 PTY 應繼續執行。下一步是確認真正的 **per-Pane surface** 接口；在此之前，GUI 僅展示模擬資料。" },
    ],
  },
  {
    id: "done",
    label: "Completed",
    status: "done",
    subtitle: "Analysis complete",
    rows: [
      { id: "d-user", role: "user", text: "比較兩種方式：讀取 Session JSONL，或透過 Pi Extension 取得記憶體事件。" },
      { id: "d-tools", role: "tools", label: "Research activity", items: [
        { id: "d-research", kind: "read", title: "Reviewed the Pi API", subtitle: "Memory snapshot · extension hooks", status: "done",
          detail: "Verified: session manager provides a current-branch memory view.\nThis mock does not contact Pi." },
        { id: "d-compare", kind: "exec", title: "Compared approaches", subtitle: "No file watchers or indexes required", status: "done",
          detail: "UI-first choice: bounded memory snapshot + live events.\nAvoid building a file-based historical reader." },
      ] },
      { id: "d-answer", role: "assistant", text: "## 建議\n\n選擇 **Pi Extension + 即時事件**，而非檔案解析器。\n\n這樣 Terminal 和 GUI 能共享同一執行中的 Pi runtime，並且不需要額外建立 Session Reader。\n\n**注意：** Herdr 仍需要驗證真正的原生逐 Pane 切換能力。" },
    ],
  },
  {
    id: "error",
    label: "Needs attention",
    status: "blocked",
    subtitle: "One check requires attention",
    rows: [
      { id: "e-user", role: "user", text: "測試多個分割 Pane 的切換行為，列出任何不安全的假設。" },
      { id: "e-tools", role: "tools", label: "Validation activity", items: [
        { id: "e-ok", kind: "read", title: "Inspect layout schema", subtitle: "Stack and terminal blocks", status: "done",
          detail: "Layout stack can toggle chrome children; terminal remains hosted in Core." },
        { id: "e-fail", kind: "exec", title: "Per-pane surface check", subtitle: "No verified public per-pane replacement API", status: "failed",
          detail: "Blocked: layout.select targets the chrome stack, not a model split Pane.\nDo not substitute tab-wide switching for the final feature." },
      ] },
      { id: "e-note", role: "assistant", text: "**需要處理：** 正式版本的同 Pane 切換仍缺少已驗證的宿主接口。\n\n目前原型只在獨立的 demo layout 裡切換整個 Tab 顯示區，不會中止原本的 Agent。" },
    ],
  },
];

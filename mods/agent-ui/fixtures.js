// Native Agent UI fixtures. Synthetic only: no Pi session files or commands.
export const DEMO_TURNS = [
  {
    id: "t-intro",
    prompt: "先幫我分析 Herdr Agent UI 的問題，Terminal 和 UI 要能無中斷切換。",
    status: "done",
    messages: [
      { id: "a-intro", role: "assistant", text:
        "## 設計原則\n\n**同一個 Pi runtime**，只切換呈現層；不能重啟 Agent、重新執行工具或把背景工作打斷。\n\n- Terminal 必須保留 PTY 與 scrollback。\n- UI 不擁有 Agent 程序。\n- Status Bar 只保留一個簡潔 SVG。" },
    ],
    tools: [],
  },
  {
    id: "t-inspect",
    prompt: "查一下 GPUI 和 Layout API 能做到甚麼程度？",
    status: "done",
    messages: [
      { id: "a-inspect", role: "assistant", text:
        "官方介面支援 **native GPUI View**、`TextView.markdown` 和 Layout Stack。\n\n真正逐 split Pane 的替換仍需要宿主配合，不能把整個 Tab 的切換說成逐 Pane。" },
    ],
    tools: [
      { id: "i-read", kind: "read", title: "Read defaults/AGENTS.md", status: "done", target: "defaults/AGENTS.md",
        detail: "Native controls · on_hover · TextView.markdown · layout.select" },
      { id: "i-search", kind: "search", title: "Search pane presenter API", status: "done", target: "layout / Pane",
        detail: "Layout Stack is chrome-scoped. No verified public arbitrary model-Pane replacement API." },
      { id: "i-layout", kind: "read", title: "Read layout schema", status: "done", target: "layouts/main.json",
        detail: "work-body contains active tab renderer and side panels." },
    ],
  },
  {
    id: "t-ux",
    prompt: "工具不要每個都一張卡，最好預設全部折疊。",
    status: "done",
    messages: [
      { id: "a-ux", role: "assistant", text:
        "工具以 **一條 Activity Summary** 呈現。點擊後顯示緊湊列表，再點選個別工具才展開詳細內容。\n\n這樣長對話仍然以**回答本身**為主，而不是操作日誌。" },
    ],
    tools: [
      { id: "u-doc", kind: "read", title: "Read interaction study", status: "done", target: "docs/agent-ui/10-tool-activity-live-rail.md",
        detail: "Group Summary → Compact Tool Rows → Typed Details" },
      { id: "u-diff", kind: "edit", title: "Edit tool presentation", status: "done", target: "tool-activity.js",
        detail: "@@ -1,3 +1,3 @@\n- each tool in a bordered card\n+ one collapsed activity group\n+ typed details on demand" },
    ],
  },
  {
    id: "t-markdown",
    prompt: "Markdown 還沒渲染好，可以修正粗體、標題和程式碼嗎？",
    status: "done",
    messages: [
      { id: "a-markdown", role: "assistant", text:
        "## Markdown Preview\n\n這裡應正確顯示 **粗體**、*斜體*、`inline code` 與清單。\n\n```js\nfunction demo() {\n  return 'native GPUI';\n}\n```\n\n> 未確認的數學排版不能當成已支援 KaTeX。" },
    ],
    tools: [
      { id: "m-check", kind: "exec", title: "Validate Markdown fixture", status: "done", target: "native TextView",
        detail: "Fixture includes ##, **bold**, *italic*, inline code, fenced code and quote." },
    ],
  },
  {
    id: "t-rail",
    prompt: "右側 Message Rail 請做得極簡，Hover 只顯示這一輪的重點。",
    status: "done",
    messages: [
      { id: "a-rail", role: "assistant", text:
        "導覽軌採用 **每個使用者提問一個節點**，只有一個 active turn。\n\nHover 只顯示截短的使用者問題。點擊才跳轉，不額外生成摘要、增加 Search 或顯示工具數量。" },
    ],
    tools: [
      { id: "r-read", kind: "read", title: "Inspect pi-harness rail", status: "done", target: "ChatMinimap.tsx",
        detail: "Stable IDs · user prompt preview · shared viewport geometry." },
      { id: "r-read2", kind: "read", title: "Inspect HW1 message rail", status: "done", target: "HW1 app.js",
        detail: "One node per user question, active marker, click to target." },
    ],
  },
  {
    id: "t-failure",
    prompt: "測試一下失敗工具會不會被折疊完全藏起來。",
    status: "needs-input",
    messages: [
      { id: "a-failure", role: "assistant", text:
        "測試顯示一項需要處理的結果。**失敗必須在工具群組摘要中可見**，但不應讓所有工具細節自動展開。\n\n你仍可切回 Terminal 繼續工作。" },
    ],
    tools: [
      { id: "f-read", kind: "read", title: "Read prototype files", status: "done", target: "mods/agent-ui",
        detail: "Read UI and event fixture." },
      { id: "f-test", kind: "exec", title: "Run integration tests", status: "failed", target: "node tests/demo-v2",
        detail: "$ node tests/demo-v2\nFAIL: host per-Pane presentation API is not yet verified.\nThis is a synthetic error fixture, not an actual command." },
      { id: "f-custom", kind: "custom", title: "Await host capability", status: "pending", target: "Pi runtime binding",
        detail: "Return to Terminal for unsupported operations. No fake Approve button." },
    ],
  },
  {
    id: "t-live",
    prompt: "再測一下正在執行、訊息持續更新時的介面。",
    status: "working",
    messages: [
      { id: "a-live", role: "assistant", text:
        "目前正在整理測試結果。\n\n此處是**模擬工作狀態**；v2 沒有連接真正的 Pi，所有工具與訊息都來自 fixtures。" },
    ],
    tools: [
      { id: "l-read", kind: "read", title: "Read UI test cases", status: "done", target: "tests",
        detail: "Reviewing mock-only interaction tests." },
      { id: "l-run", kind: "exec", title: "Run visual checks", status: "running", target: "Herdr screenshot",
        detail: "Waiting for real target-app verification; no subprocess started." },
    ],
  },
];

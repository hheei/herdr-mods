// Native Agent UI fixtures. Synthetic only: no Pi session files or commands.
// The scripted turns are also the contract the tests drive; the shipped demo
// appends generated turns so a long history (bucketed rail, real scrolling)
// can be judged by hand.
export const FIXTURE_TURNS = [
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
    // A failed tool does not mean that the user must take action.
    status: "done",
    messages: [
      { id: "a-failure", role: "assistant", text:
        "測試包含一項**工具失敗**。這只是執行結果，**不等於需要使用者處理**。工具群組仍預設折疊；展開後可以查看失敗原因。\n\n你仍可切回 Terminal 繼續工作。" },
    ],
    tools: [
      { id: "f-read", kind: "read", title: "Read prototype files", status: "done", target: "mods/agent-ui",
        detail: "Read UI and event fixture." },
      { id: "f-test", kind: "exec", title: "Run integration tests", status: "failed", target: "node tests/demo-v2",
        detail: "$ node tests/demo-v2\nFAIL: host per-Pane presentation API is not yet verified.\nThis is a synthetic error fixture, not an actual command." },
      { id: "f-custom", kind: "custom", title: "Check host capability", status: "pending", target: "Pi runtime binding",
        detail: "Capability not verified. This pending check is not a user approval request." },
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

const LONG_PROMPTS = [
  "把剛才的結論整理成三點，不要重複推導過程。",
  "這段排版在窄視窗會擠在一起，幫我檢查一下。",
  "把測試指令整理成一份可以貼給同事的清單。",
  "先解釋你為什麼選 Layout Stack，而不是另開一個 Pane。",
  "失敗的那個工具，錯誤訊息在哪一行？",
  "把這輪的改動寫成 commit message 草稿。",
  "如果我中途切回 Terminal，背景工作會斷嗎？",
  "幫我把 Rail 的行為寫成驗收條件。",
  "確認一下我的個人 Layout 沒有被安裝器改壞。",
  "這份 fixture 的資料是亂數產生的嗎？",
  "把 Hover 的第二行條件再說一次。",
  "最後檢查一次有沒有說成已支援逐 Pane 切換。",
];

const LONG_ANSWERS = [
  "1. 呈現層與 runtime 分離\n2. 設定與內容各自獨立\n3. 失敗只影響該次執行",
  "窄視窗下 Rail 會保留圓點，只有 **極短的 viewport** 才整條隱藏，避免溢出。\n\n主要內容區仍以文字寬度為先，不為了塞控件犧牲閱讀空間。",
  "```sh\nsh scripts/install.sh agent-ui project-open\nnode tests/agent-ui.test.cjs\n```",
  "因為 **Layout Stack** 只換 chrome，不動 model Pane；另開 Pane 會讓同一份 Agent 出現兩個呈現者。",
  "在展開後的工具列點開該項，錯誤字串在 `detail` 的第一行，不會出現在折疊摘要裡。",
  "```\nrail: anchor dots in one centred column\n```\n\n只描述行為，不寫入未驗證的宿主能力。",
  "不會。切換只改呈現層，PTY 與背景程序繼續跑；這也是不在切換時重啟 Agent 的原因。",
  "1. 圓點固定中線、間距 3px\n2. 整列不高於 40% 高度\n3. 過密按桶合併並顯示 `+N`",
  "安裝器只 patch `herdr-mods` 一次，並且先備份；`main` 與其他 Layout 完全不動。",
  "不是。全部是固定內容，**沒有亂數**，所以每次開啟都看到同一份對話。",
  "只有 `requiresUserAction === true` 這種明確需要你回應的事件才加第二行；工具失敗不算。",
  "沒有。目前仍**不是**逐 split Pane 切換，相關宿主 API 尚未驗證。",
];

const LONG_TOOLS = [
  [],
  [{ id: "l-read", kind: "read", title: "Read layout contract", status: "done", target: "layouts/herdr-mods.json", detail: "work-body children: tab renderer and panel." }],
  [
    { id: "l-search", kind: "search", title: "Search rail tests", status: "done", target: "tests", detail: "railLayout · dotSize · railHit" },
    { id: "l-edit", kind: "edit", title: "Tighten rail column", status: "done", target: "mods/agent-ui/model.js", detail: "@@ railLayout\n- const pitch = 16\n+ const pitch = 14" },
  ],
  [{ id: "l-exec", kind: "exec", title: "Run demo checks", status: "done", target: "node tests/agent-ui.test.cjs", detail: "PASS: dots-only scroll rail, scrubbing, dot jump." }],
  [
    { id: "l-read2", kind: "read", title: "Read docs 09", status: "done", target: "docs/agent-ui/09-p0-feedback-round1.md", detail: "Single SVG mode switch only in the Status Bar." },
    { id: "l-exec2", kind: "exec", title: "Screenshot the demo", status: "failed", target: "herdr-app shot", detail: "$ herdr-app shot\nSynthetic failure fixture: no GUI on this machine." },
  ],
];

function longTurn(id, index) {
  const tools = LONG_TOOLS[index % LONG_TOOLS.length].map((tool) => ({ ...tool, id: `${tool.id}-${id}` }));
  return {
    id,
    prompt: LONG_PROMPTS[index % LONG_PROMPTS.length],
    status: "done",
    messages: [{ id: `${id}-answer`, role: "assistant", text: LONG_ANSWERS[index % LONG_ANSWERS.length] }],
    tools,
  };
}

const LONG_TURNS = Array.from({ length: 53 }, (_, i) => {
  const id = `t-long-${String(i + 1).padStart(2, "0")}`;
  const turn = longTurn(id, i);
  if (i === 13 || i === 37) turn.requiresUserAction = true;
  return turn;
});
LONG_TURNS[LONG_TURNS.length - 1].status = "working";

export const DEMO_TURNS = [...FIXTURE_TURNS, ...LONG_TURNS];

// The scripted stream: chunks arrive one per source.step(), which is what the
// view's timer calls. A bridge source will step from socket events instead.
const STREAM_CHUNKS = [
  "Retries are **exponential with jitter**: ", "1s, then 2s, then 4s, ",
  "capped at 30s. ", "\n\n", "The cap matters more than the curve — ",
  "a long outage should look slow, not hung. ", "\n\n", "- 429 and 5xx retry; ",
  "- 4xx except 429 fail at once; ", "- timeouts retry only while the budget lasts.\n\n",
  "Give up after **5 attempts**, then surface the last error instead of ",
  "another spinner. ", "The user can always retry by hand; ", "the ceiling is a promise, not a guess.",
];

export function fixtureSource(turns = DEMO_TURNS) {
  const queue = [];
  let script = null;
  let counter = 0;

  const endScript = () => {
    queue.push({ type: "tool.update", turnId: script.turnId, toolId: script.toolId,
      patch: { status: "done" } });
    queue.push({ type: "turn.end", turnId: script.turnId });
    script = null;
  };

  return {
    kind: "fixture",
    // A bridge returns the last snapshot it rebuilt from its socket.
    snapshot() {
      return turns;
    },
    take() {
      return queue.shift() ?? null;
    },
    streaming() {
      return script !== null;
    },
    // A bridge has no clock: its step() is a no-op and events are pushed.
    step() {
      if (!script) return false;
      const chunk = script.chunks.shift();
      if (chunk === undefined) {
        endScript();
        return true;
      }
      queue.push({ type: "message.delta", turnId: script.turnId,
        messageId: script.messageId, text: chunk });
      return true;
    },
    replay() {
      if (script) return null;
      counter += 1;
      const turnId = `t-stream-${counter}`;
      script = { turnId, messageId: `a-${turnId}`, toolId: `tool-${turnId}`,
        chunks: [...STREAM_CHUNKS] };
      queue.push({ type: "turn.start", turn: { id: turnId,
        prompt: "How should the client retry a failed request?" } });
      queue.push({ type: "message.start", turnId, message: { id: script.messageId } });
      queue.push({ type: "tool.start", turnId, tool: { id: script.toolId, kind: "read",
        title: "Read", target: "src/retry.ts",
        detail: "Reading the retry policy so the answer can cite it." } });
      return turnId;
    },
    finish() {
      if (!script) return false;
      while (script.chunks.length > 0) {
        queue.push({ type: "message.delta", turnId: script.turnId,
          messageId: script.messageId, text: script.chunks.shift() });
      }
      endScript();
      return true;
    },
    arrive() {
      counter += 1;
      const turnId = `t-more-${counter}`;
      const messageId = `a-more-${counter}`;
      queue.push({ type: "turn.start", turn: { id: turnId,
        prompt: `Arrives while you are reading (${counter})` } });
      queue.push({ type: "message.start", turnId, message: { id: messageId } });
      queue.push({ type: "message.end", turnId, messageId,
        text: "A new turn landed. If you were reading above, the transcript did not move: only the counter at the bottom changed." });
      queue.push({ type: "turn.end", turnId });
      return turnId;
    },
  };
}

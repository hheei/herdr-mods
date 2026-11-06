# 04 · Pi GUI 的最小 Event／Control 契約

**這是本專案提出的 v0 訊息協定，不是 Pi、Herdr 或 Moshi 已有的協定。** Pi 1.5.0 API 證據見 [P1–P5](01-evidence.md#p1)；元件與運輸層責任見 [03](03-architecture.md)。

## 1. 目的與非目標

Pi Extension 的目的只有三件：**給目前 GUI 顯示所需的狀態**、**持續送 live event**、**安全控制同一個 Pi TUI**。UI 的主要工作是呈現、導航、輸入與穩定互動。

明確**不做**：JSONL 磁碟 Reader、目錄掃描、byte offset／file rotation、history DB、全機 Session search、Pi 的檔案持久化替代層。若沒有 bridge，原生 Terminal 繼續正常工作；不是啟動另一種 Reader。

## 2. 讓 GUI 綁定到正確的 Pi

```ts
// 提案型別，非官方欄位
interface RuntimeBinding {
  hostKey: string;                // 已驗證的主機／Core endpoint scope
  terminalAddress: string;        // Herdr Core 地址，不單靠它做執行身份
  terminalIncarnation: string;    // 這次 Pi 程序的驗證 nonce／start token
  paneId: string;                 // 切換目標 Pane（由 Status Bar 點擊時捕捉）
  piSessionId: string;            // Pi runtime 的 session ID
  activeLeafId: string | null;
  bindingEpoch: string;           // runtime/session 更換即更新
  mode: "terminal" | "ui";    // 本地 Pane presentation，不屬於 Pi runtime 狀態
}
type ViewKey = string;            // client + pane + bindingEpoch
```

不能只靠 `cwd`、window title、session file mtime 或 terminal address 綁定；同一專案可能有多個 Agent。第一次啟用，由**Status Bar 控制在點擊當下選中的原生 Pane** 捕捉 paneId／address／host／epoch（即使 click 之後焦點改變仍綁定舊 target），再由**同一 Pi extension**上報 `getSessionId()`／`getLeafId()`／process nonce，核對與 Core 的執行實例。若不能確定，UI 顯示「尚未連接此 Pi」並停用 Send，永遠不猜最近的 Session。

`/new`、`/resume`、`/fork`、`/reload`、Pi 退出重啟、host reconnect 應重置／驗證 binding。所有 async response 帶 epoch；錯誤 epoch 在**更新 UI 前**丟棄。草稿、模式、scroll 和手動 disclosure 依 ViewKey 區分，Session 替換時封存前者，不自動複製進新 Session。

## 3. 只需這幾個能力位

| Capability（提案） | 第一版用途 | 缺少時 |
| --- | --- | --- |
| `surface.native-pane.v1` | 只切指定原生 Pane（宿主側） | 原生同 Pane 的產品驗收不通過；可做非正式獨立 UI prototype |
| `statusbar.focused-pane-toggle.v1` | 在原本 Status Bar 中顯示當前 focused Pane 的 mode、只切該 Pane | 控制不可用；不能以 Pane Header 或新增 Layout 格替代 |
| `ui.runtime-state.v1` | Pi 是否工作、所屬 Session、model 等 | 不假裝知道完整狀態 |
| `ui.snapshot.v1` | 當前分支有界內容視窗，從 Pi memory API 取得 | 顯示整合未啟用／回 Terminal |
| `ui.events.v1` | message/tool 的 start/update/end／settled | 停止流式、標 stale，不把 pending 畫成完成 |
| `ui.request-older.v1` | 向 Pi runtime 要較早的有界 view window | 僅可看已收到的部分，不開檔補資料 |
| `ui.control.prompt.v1` | 同一 runtime 發送訊息 | 禁用 Composer 的 Send |
| `ui.control.steer.v1`／`followup.v1` | 工作中引導或排隊 | 顯示不支援，不偷用按鍵 |
| `ui.control.abort.v1` | 明確 Stop | 只提供回 Terminal |
| `transport.private-control.v1` | 安全傳遞大型 prompt／控制 | 禁用 Send，不能把 prompt 或 token 塞在 argv |

不支援的 Pi extension 問答／permission／plan 只做可讀狀態＋「回 Terminal 處理」，不畫假的 Approve button。Capabilites 必須可撤銷；bridge 版本不匹配時明確顯示原因。

## 4. Snapshot：從同一 Pi 程序取得 GUI 內容

`ctx.sessionManager.getBranch()`、`getEntries()`、`getSessionId()`、`getLeafId()` 是 Pi Extension API。[P2](01-evidence.md#p2)

首次顯示 UI 時：

1. 先以 Pane 的 bindingEpoch 發 `hello`，確認 extension 身分和 capability。
2. Extension 在同一 Pi runtime 取得最近的**當前分支** bounded window（例：最近 50 turns／最多 200 rows 的初始預算），一次性回 `snapshot`。
3. GUI 建立 `ConversationProjection`，由 `ViewState` 提供 stable key、手動折疊和 scroll anchor。
4. 請求較舊項目時透過同 runtime API 做 bounded window；沒有資料就明確結尾，不尋找 JSONL。
5. 接續 live event；如果 snapshot 並發期間有 event，根據 `producerEpoch + sequence` 串行／重放，以免漏資料或重複。

此處的 **snapshot 是 Pi 的記憶體 Session 視窗，不是檔案快照或另一個 archive authority**。同一 runtime 可以向多個 UI 讀者發送；extension 的資料生成需有界，不在高頻 hook 中重建整個 Session。

### Event 類型與來源

| Pi API／事件 | UI model | 顯示規則 |
| --- | --- | --- |
| `session_start/shutdown`、session manager | runtime identity | 新 epoch、失效保護、title／model |
| `message_start/update/end` | user/assistant/content blocks | 同一個 live message 以 stable key 更新，不每個 chunk 新增一列 |
| `tool_execution_start/update/end` | tool card + parentToolCallId | 並行工具可交錯；沒有 end 不報成功 |
| `agent_start/end/settled` 等可用 hooks | execution status | 底層 `agent_end` 可能還有 retry；以 settled 判定可用閒置狀態 |
| `ctx.sessionManager.getBranch()` | current-window snapshot | branch／compaction 僅按 Pi 提供的記憶體投影顯示 |
| model/usage（有提供時） | compact usage details | 缺少時顯示未知，不能當成零 |
| custom events | unknown/safe fallback | 不因一個未知事件讓整個 GUI 白屏 |

`message_end` 的 Extension handlers 在最終 append 路徑之前觸發，且其他 extension 可能改寫訊息。[P4](01-evidence.md#p4) 因此 UI 不承諾精確的 `event → durable entryId` 映射。用 bridge 的 source eventId 顯示 live，snapshot 回來按同 producer／明確映射重建；無法唯一對應就標未知，不按「相同文字＋15s」靜默去重。

## 5. 提案事件 Envelope

```json
{
  "protocol": "herdr-agent-ui/0",
  "kind": "event",
  "bindingEpoch": "example-binding",
  "producerEpoch": "example-producer",
  "sequence": 42,
  "eventId": "example-event-42",
  "eventType": "tool-update",
  "payload": {"toolCallId":"example-call","status":"running"}
}
```

`hello` 回身份與能力；`snapshot` 回當前 view window＋revision；`event` 回增量；`older` 回另一段 Pi memory window；`state` 回執行／傳輸狀態；`receipt` 回 command disposition；`gap` 要求相同 runtime 的 snapshot resync。這些是新協定，**不是**沿用 Moshi 的 `/v2/transcripts` wire protocol。

- 事件必須有界、可丟棄並回補；bridge 過載時不能反向阻塞 Pi。
- `sequence` 不能因 client 重新連線任意重用，需與 producerEpoch 搭配；舊 session/revision 不可蓋掉新的畫面。
- 每一個 visible row 有 stable `renderKey`，每個工具 call 有 source ID；折疊及 selection 不以 array index 儲存。
- 主模型保留完整**已收到的內容**，畫面只顯示有界 pagination；Copy/Search 不依賴動畫文字。
- 若 extension 提供圖片、大型工具輸出，應設 payload size 與按需 request 的上限；這仍是 runtime event transport，不是磁碟搜尋或 archive system。

## 6. 讓 UI 更好用的 Projection

```ts
interface ConversationRow {
  renderKey: string;
  turnId: string;
  kind: "user" | "assistant" | "activity-group" | "error" | "unknown";
  summary?: string;
  blocks?: { kind: "text" | "provided-thinking" | "tool" | "image" | "unknown"; contentRef: string }[];
  status?: "running" | "completed" | "failed" | "interrupted" | "unknown";
  revision: number;
}
interface LocalViewState {
  mode: "terminal" | "ui";
  draft: { text: string; revision: number };
  disclosure: Record<string, "auto" | "user-open" | "user-closed">;
  scroll: { anchorRowKey?: string; intraRowOffset: number; followTail: boolean };
  search?: { query: string; selectionKey?: string };
}
```

把連續同類型工具整理成摘要，歷史完成 turn 默認收起過程；無答案／失敗／仍需輸入時保留必要過程。Thinking 只顯示 Pi 實際提供的文字，不補寫內部推理。大型內容分頁，科研公式優先展示可複製的原始 LaTeX，原生 renderer 支援另外驗證。更詳細的 UI 規格見 [02](02-ux-spec.md)。

## 7. Composer：只操作同一個正在執行的 Pi

```json
{
  "protocol": "herdr-agent-ui/0",
  "kind": "prompt",
  "requestId": "example-req-17",
  "bindingEpoch": "example-binding",
  "expectedSessionId": "example-pi-session",
  "expectedInputRevision": 6,
  "delivery": "followUp",
  "text": "這是合成測試內容"
}
```

以上是協定示例，實作時必須保護敏感 prompt；不要在 argv、shell history 或 debug log 中傳輸它。

- Idle：`sendUserMessage(text)` 啟動同一 Pi runtime 的下一輪。
- Working：預設 `followUp`（工作結束後送出）；顯式 steer 採 Pi `deliverAs:"steer"` 的真實語義，不宣稱立刻打斷正在執行的工具。
- Stop：獨立、有明確文案的 `abort`，**模式切換與 GUI 關閉不能觸發**。
- `sendUserMessage()` 的返回不等於模型已完成；命令有 `accepted / queued / rejected / uncertain` 等狀態。
- API 失聯或 dispatch 結果不確定時**不自動重送**；兩條同樣文字可以都是合法訊息。
- UI／TUI 草稿分開；送出只清掉該 draft revision，不覆寫使用者此後打的文字。
- 中文／日文 IME composing 時 Enter 不送出，切模式不迫使組字提交。
- 用 lease／expected input revision 對抗同一 Pi 被其他 UI／TUI 同時操作；無法核對時先禁用控制。

### 安全運輸缺口

Herdr Mod 端的 `exec` **不能被假設**可帶任意私有 stdin stream。需要經目標版驗證的 request-body／stdio／owner-only IPC 通道；無法建置時可以先發佈 UI reading / live 展示但停用 Send，不改用 `hc send`／`hc keys` 盲打現有 Terminal。

### P2 實際採用：三檔案狀態信箱（讀取方向）

以 `defaults/herdr.d.ts`（目標版）核對過的 Mod 能力：

| 原語 | 能不能當事件流 |
| --- | --- |
| `exec` / `hc` | 一次性、緩衝到結束（8 MiB），無法讀中途輸出 |
| socket／http／WebSocket | **沒有**這類 API |
| `readTextFile` / `writeTextFile(expected)` | 整檔讀取（1 MiB）；寫入是 CAS |
| `watchFolder(dir)` | 資料夾變更會**推送**路徑批次 |
| `cx.timer.every` | 可行，但每次 `notify` 重繪整個視窗 |

第一版寫過「一事件一檔＋序號＋剪枝」，但那是在硬碟上追加一串 delta：每次 token 都寫檔，還要維護序號、缺號偵測與剪枝。**改成狀態而不是事件**之後那些全部消失：

寫者與讀者都在 `mods/agent-ui/`：`bridge/herdr-agent-ui.js` 是**一個** Pi extension 檔（Pi 的發現規則本來就吃 `extensions/*.js` 單檔，jiti 直接載入，多檔只有多檔才需要），`bridge-source.js` 是 Mod 端的讀者。

```
<HERDR_APP_HOME>/agent-ui/bridge/<pid>/
  meta.json   {version, epoch, revision, pid, sessionId, cwd, updatedAt, closed?}
  done.json   {version, epoch, revision, turns}   // 已結束的輪（上限 200）
  live.json   {version, epoch, revision, turn}    // 進行中的那一輪，或 null
```

- **兩個檔原地覆寫**，不新增、不追加、不需剪枝；整個 bridge 就是三個小檔。
- 寫：`<name>.tmp` + `rename`，讀者不會看到半個檔。
- 讀：`watchFolder` 收到批次 → 讀 `live.json`（一律）與變更過的 `done.json` → 交給 reducer 當一次 `snapshot`。**因為是完整狀態，「最後讀到的就是真的」**，沒有順序、缺號或重播問題。
- 節流：`live.json` 串流時最多每 200 ms 寫一次（`LIVE_MS`），輪結束、工具開始／結束則立刻 flush。一次 60 秒的回答約 300 次小檔覆寫，而不是數千個 delta 檔。
- 界：`done` 上限 200 輪＝view 的上限；單欄位截斷（文字 20k、工具輸出 2k），確保 `readTextFile` 的 1 MiB 不會把 JSON 截斷成非法內容。
- 身分：`meta.json` 帶 `sessionId`／`cwd`／`pid`。P2 只讀，挑錯也只看到別的 session，UI header 顯示 sessionId 與 cwd。

**為什麼不是讀 Pi 的 session JSONL**：它是公開、有版本的文件格式（`docs/session-format.md`，v3，含遷移），但那是**耐久紀錄**，不是即時流——`message_update` 不落盤、`message_end` 才 append，工具在執行中也沒有條目；而且路徑由 cwd 推導，同一個 cwd 的兩個 Pi 只能猜。檔案格式公開不代表它適合當 live 通道。

**為什麼不是 unix socket**：Mod 端沒有 socket／串流 API。用 `exec` 長輪詢等於每批事件換一次程序啟動與逾時／孤兒管理，比三個小檔貴。

**為什麼不是 SQLite**：SQLite 解決的是「多寫者、需耐久、要查詢」；這裡是**單寫者、可丟、問題固定**（「給我目前的完整狀態」每秒 5 次）。而且成本方向相反：Mod 端沒有 sqlite 綁定，只能 `exec sqlite3 -json`，每次讀換一次程序啟動（~10 ms）且無法 watch（WAL／shm 檔案變動會變成假 wakeup），反而得輪詢；5 Hz 覆寫單列狀態在 WAL 下也是持續的 frame 累積。**真正適合 SQLite 的是它後面的歷史層**（跨 session 檢索、多 Pane 查詢），那時是一張 DB 配 `sessions/turns/messages/tools`，而 live 路徑仍是狀態檔。

**讀者側**（`mods/agent-ui/bridge-source.js`）：`refresh()` 取三個檔案 → `readBridge()` 只做差分，輸出給 reducer 的兩種事件：

| 情況 | 事件 |
| --- | --- |
| `epoch` 變（Pi 重啟／`/new`／resume） | `snapshot`（舊 transcript 不屬於這個 process）＋（若有）`turn.replace` |
| `done.revision` 變（一輪結束） | `snapshot`（已完成的輪都在裡面） |
| `live.revision` 變（200 ms 一次） | `turn.replace`（只換進行中那一輪，不重畫整份） |
| revision 都沒變 | 什麼都沒有（不重繪） |

`turn.replace` 與 `snapshot` 的 `grew` 由內容長度決定，所以「↓ N new」氣泡只對真正長出來的內容計數，不會每 200 ms 被節流覆寫吵到。目錄消失（`meta` 讀不到）→ 重新 `ls -1t` 找新的 pid，不猜。

發現 producer 只有一次 `exec("ls", ["-1t", "<appHome>/agent-ui/bridge"])`：Mod 沒有 `readdir`，也不給 `env`，所以用 `appHome()` 這個 host 函式，取 mtime 最新的那個目錄，等的是 `watchFolder`，不是 timer 輪詢。

**目前沒有 UI 開關**：reader 由 `shared("agent-ui-source") === "bridge"` 觸發，那條線是留給 P2 pane 綁定（哪個 Pane 綁哪個 pid）用的接點；在綁定定案前，它由測試與手動 `setShared` 觸發。

**尚未解決**：寫入方向（P3 `prompt`／`steer`／`abort`）需要回執與不確定語義，`writeTextFile` 的 CAS 只能當 command 檔的載體，不能證明 Pi 收到；那仍待安全通道，或先停用 Send。

## 8. Bridge／傳輸失效時

| 情況 | GUI 行為 |
| --- | --- |
| 未安裝 extension | 只顯示 Herdr 可確知的元資訊＋「未啟用 Pi GUI 整合」，可回 Terminal |
| extension 剛安裝但 Pi 忙碌 | 不自動 `/reload`；等 idle 經確認啟用，或下一次啟動 |
| transport 失聯 | 已顯示的內容標為 stale，停止送訊息；原 Terminal 繼續 |
| Pi runtime 更換／退出 | 換 binding epoch；舊事件丟棄；舊草稿留本機但不送錯 runtime |
| 圖片／工具 payload 過大 | 摘要與有界 viewer；不能讓渲染卡死整個 Herdr |
| 控制 request 未確定 | 顯示 unknown delivery，不用 timer 重送 |
| GUI render 失敗 | 宿主可回 Terminal，不呼叫 kill／park／close |

## 9. 必測契約

- 一個 project 兩個 Pi：每個 Pane 始終綁定正確執行實例。
- 100 次 Terminal/UI 往返仍是同一 Pi process、terminal address、active run。
- event 雜亂與 parallel tool：start/update/end 可能交錯，但卡片狀態正確。
- 相同 prompt 兩次、控制中途斷線、bridge restart：不丟合法資料，不擅自重送。
- snapshot 與 live 同時到達，`/new`／resume：舊 session 不閃現於新畫面。
- 1000 個工具、數 MB 文字、多位 client：bounded rendering 和 event buffer。
- IME、草稿、anchor、手動 disclosure、Native GPUI focus。

完整交付條件見 [05](05-delivery-and-tests.md)。

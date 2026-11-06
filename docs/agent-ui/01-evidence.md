# 01 · 來源綜合、證據等級與可行性

日期：2026-11-06。本文是研究底稿；UI 規格與系統契約另見 [02](02-ux-spec.md)、[03](03-architecture.md)、[04](04-pi-contracts.md)。**範圍修訂（0.2）：使用者已明確取消 Session JSONL Reader／歷史索引；以下檔案解析相關內容只保留為上游事實與排除方案的研究證據，不是待實作清單。正式方案只用 Pi runtime extension 的 memory snapshot／events 支援 GUI。**

## 1. 如何採信

| 標記 | 定義 | 能推出甚麼 |
| --- | --- | --- |
| E | 本次讀到的官方文件／原始碼或已安裝版本 | 固定版本的行為與 API，不自動代表使用者 Mac 的版本 |
| N | 使用者提供的研究筆記 | 設計靈感與待驗證觀察；其「已核」標記不是本次重新實測 |
| I | 根據 E／N 得到的工程推論 | 需要原型驗證，不能寫成現成 API |
| D | 本專案提出的設計決定 | 可以改變，但需記錄理由與驗收影響 |

優先順序：**目標機器型別／執行結果 → 固定版本官方原始碼 → 後續修正筆記 → 首輪概覽 → 符號名稱推論**。UI 是否真的呈現正確，必須實機驗證，不能由 CI 或函式名稱代替。

## 2. 指定資料的綜合結論

| 來源 | 採用 | 不直接移植 | 本設計落點 |
| --- | --- | --- | --- |
| pi-web（R1／R2） | 指標來源透明、長內容閘門、查詢命中可展開、沒有最終答案時不把過程藏光 | 四色 t/s 交通燈、所有細節平鋪、以全域布林控制所有 thinking | 02 的漸進揭露；04 的 provenance／usage 語義 |
| PI-Desktop（R1／R2） | `history` 與 `live tail` 分離、活動摘要、手動 disclosure 優先、草稿防競態 | Electron／React 元件、整個 UI framework、保留面板數字直接照抄 | 02 的可預期折疊；03 的 projection store；05 壓測 |
| Paseo（R1／R2） | reading anchor、貼底狀態、語義工具分組、搜尋資料而非只搜尋已呈現行、窄 Pane 適配 | 手機三欄手勢、自研 RN 列表與 C++ diff 引擎 | 02 滾動狀態機與窄版；03 可替換 list adapter |
| ZCode（R1／R2） | renderer registry、排印 token、diff 硬預算、reduced motion | Lexical／Radix／Streamdown／CSS 動畫、CUA 與商業模式控制 | 02 原生視覺規格；04 tool presentation；05 內容上限 |
| Moshi（M1–M5） | 一會話兩種呈現、程序不歸 View 所有、lazy retain、session identity guard、能力協商、增量重連 | 商業源碼／資產、私有 hook 協定、文字＋15 秒配對回聲、按鍵 rewind | 03 ownership／transport；04 身分與命令回執；06 ADR |

### 不能把所有優點直接相加

本產品是桌面原生 Mod，不是第五個 Web 全功能 IDE。預設只顯示「對話、目前活動、必要例外」，用量、原始 JSON、完整工具輸出、系統提示等放在明確的詳細視圖。工具很多時靠語義摘要與有界渲染，而不是新增更多常駐面板。

## 3. 必須保留的修正與矛盾

1. **R2 推翻 R1 的數項歸屬。** Paseo 沒有首輪所述的逐輪 usage capsule；PI-Desktop 的保留面板上限是 3，非 5；PI-Desktop 與 pi-web 不是虛擬化列表。這些只能當比較材料，不能作為採用某元件的理由。[R2](#r2)
2. **Compaction 不等於原始歷史消失。** R2 的「thinking 永遠消失」不能泛化至 Pi。本次 Pi 文件區分原始 session tree 與 model context projection；`context_edit` 也只改未來上下文，不改 raw history。UI 應標記「不在目前模型上下文」，不是刪除歷史或宣稱找不到。[P1](#p1)
3. **Moshi 的協定觀察有層次。** iOS 靜態筆記列 `resumed`；web reducer／現場記錄只確認另一個子集。`patch` 增量可由 client reducer 支持，但實拍未捕捉到每種 frame；rewind server confirmation 也未完全確認。只借用「revision／snapshot／patch／resume」模式，另訂本專案協定。[M1](#m1)、[M3](#m3)
4. **Moshi 的傳輸拓撲不能只按文案下結論。** M1 描述 SSH 直連，M3 同時記載了雲端 bridge。這不能推出所有 Moshi 使用情境都不經中繼。本專案自行規定無雲端、透過使用者已信任的 Herdr／SSH 路徑傳輸，不繼承其安全宣稱。
5. **不能由 `finalizeRunningToolCalls` 推出成功。** 沒有最終結果的工具應是 `unknown`／`interrupted`，不是因 websocket 斷開或 turn 結束就補成 completed。
6. **不能沿用 15 秒文字配對作確定性回執。** 兩個相同 prompt、離線或其他客戶端同時輸入會造成誤合併。採 request ID 與明確證據；無法建立因果時保留不確定狀態，不刪除看似重複的合法訊息。
7. **既有聊天中的 `stack` 說法需要收窄。** 隱藏呈現不必停止 Agent，這點有程式碼依據；但「任意同一原生 Pane 直接用 `layout.select` 切換」並沒有得到公開 API 支持。此差異是 P0 的 blocking gate，不藏在後期風險清單。[H3](#h3)、[H4](#h4)

## 4. 固定版本的能力核查

| 問題 | 核查結果 | 工程後果 |
| --- | --- | --- |
| Mod 可否讀 host、目錄、Agent 狀態？ | E：`agents()`、`terminals()`、`panes()`、`spaces()`、`focused()` | 足夠呈現環境，但不是完整對話協定 |
| 可否維持工作程序？ | E：Herdr Core 持有執行；App `sync()` 保持 model tabs 內的 terminal views attached | 設計可保留 runtime；不能藉此保證任何重新編排都無副作用 |
| `layout.select` 可否選任意 model-pane stack？ | E：實作呼叫 `self.chrome.select` | 原生 per-pane 替換需要驗證／App 擴充；不直接寫 core document |
| 關 Pane 是否安全切模式？ | E：`pane.close` 會結束 terminal；`terminal.park` 會移除 Pane 並關掉 keep | 兩者均不得用於切模式 |
| Mod 可否直接搬 React／HTML？ | E：原生 GPUI，沒有 DOM／WebView／一般 Node runtime | 用 native Markdown、editor、list adapter；Web UI 只是參考 |
| 檔案與網路？ | E：`readTextFile` 上限 1 MiB，支援 `{on}`；`watchFolder` 本機限定；`exec` 有輸出與 timeout 限制 | 此版本 UI 不使用檔案 Session Reader；只核對傳輸與 runtime events 的可用接口 |
| Pi Session 是否 JSONL tree？ | E：v3，`id`／`parentId`，可多 roots，含 compaction/context_edit/custom 等 | 用於理解 Pi memory snapshot 的語義；本 Mod 不另寫 JSONL parser |
| 只讀檔有 live token 嗎？ | E：`message_end` 路徑才 append；`message_update` 不等於落盤 | 需要 bridge 才宣告 live streaming |
| 只讀檔能可靠得知 active leaf 嗎？ | E：`branch()`／`resetLeaf()` 可只改記憶體指標 | 正式 UI 以 Pi extension 的 runtime `getLeafId()` 為準，不以檔案猜測 |
| Bridge 能否觀察／送入同一 Pi？ | E：extensions 有 message/tool events、readonly sessionManager、`sendUserMessage`、`ctx.isIdle()`／`ctx.abort()` | 可做受限結構化控制，需自行設計安全 IPC 與回執 |
| `message_end` hook 時檔案已寫好嗎？ | E：AgentSession 先呼叫 extension handlers，再 append | bridge 不得在 hook 內假設 durable entry ID 已存在 |
| 可以把既有 TUI 切成 RPC 嗎？ | E：文件中的 RPC 是長存 subprocess 介面；未提供把任意 TUI 原地變 RPC 的保證 | 禁止為 UI 另開 `pi --mode rpc --session ...` 造成雙 writer |
| 現有工作中途裝 bridge？ | E：Pi 不可在 Agent running 時 reload | 安裝不自動 `/reload`；目前仍可使用 Terminal，待 idle 經確認啟用 GUI extension |
| Terminal identity 可由何而來？ | E：本機 `hc --skill` 文件定義 `$HC_TERMINAL_ID` | 需加 host/core/process incarnation 防地址重用；不能只用 cwd |

## 5. 尚未驗證，禁止寫成保證

- 使用者 Mac 上的實際 Herdr App 版本、產生的 `gpui-kit.d.ts`、accessibility 與 variable-height virtual list 行為。
- 任意 split Pane 的兩面切換在**現成公開 API**下是否可做到完整焦點、拖曳、zoom、Kitty 圖像保留；本次未找到現成接口。
- 原生 Markdown 的數學、表格、CJK 行距、超長 code block 選取效果。
- Pi TUI extension bridge 的輸入回執能否確定對應最終持久 entry；`sendUserMessage()` 本身不返回完整的 request-to-entry mapping。
- 同時存在多個 Pi extensions 時，事件變更順序、custom renderer／問答 UI 的可觀察範圍。
- 遠端多會話輪詢的實際 CPU、延遲與 redraw 成本。

這些分別有 [P0／驗收關卡](05-delivery-and-tests.md)，不是要求使用者自行猜設定。

## 6. 來源登錄

### R1

`/home/chlo/Documents/playground/notes/agent-ui-ux-4repos.md`，299 行。完整讀取。四倉第一輪研究，使用者筆記等級 N。未在本輪重新審核所有競品原始碼；不得把其中每一項稱為本輪獨立證實。

SHA-256：`8bdfbf7be335cca60f3a08d0720adff47858bed0baada01db60148944cb7cb63`。

### R2

`/home/chlo/Documents/playground/notes/agent-ui-ux-4repos-deep.md`，180 行。完整讀取。§1 顯示矩陣、§2 thinking、§3 大量工具、§4 可遷移原則、§5 修正。與 R1 衝突時優先採 R2。

SHA-256：`c59963c64205b63ac18380f29b9776715738f622476d5c8997a03dbacaa0ad5c`。

### M1

`/home/chlo/Documents/dev/moshi/docs/architecture.md`，316 行。完整讀取。§2–4 ownership/cache，§4.5 Pi 精確路徑上報，§5–7 控制／能力／切換，§9／11 證據限制。

SHA-256：`99654102fb516e219a50161bcdc3e1316f59272d523e91ec7d0a3f377857986d`。

### M2

`/home/chlo/Documents/dev/moshi/docs/ui-ux.md`，169 行。完整讀取。§2 lazy-retain，§3 防錯 Session 閃現，§4 scroll restore，§5 IME／focus，§9 Composer 與 Chat View 的分離，§10–11 未確認與回聲限制。

SHA-256：`f5e7a16891bfa24a50936e9bd272927d88fe17c311c4881aa5e124c141e3649b`。

### M3

`/home/chlo/Documents/dev/moshi/docs/observe-live.md`，201 行。完整讀取。gateway 能力、snapshot/older/reset、增量 reducer、未實拍項目。文件含具體環境與 Session 樣本；本設計不複製其真實 identifiers。

SHA-256：`9477b1d4c5475afc5cfa6e073189b96bf2155e3446c303cabec7cf7faf9d4efb`。

### M4

`/home/chlo/Documents/dev/moshi/docs/hook-map.md`，865 行。完整讀取。符號／字串層級 server 架構推論；不能由符號名保證 protocol 行為或工具權限。

SHA-256：`7745bece4e417a5950ec08cc7e4c75659957881ecd46739bf0eedda14cccd79d`。

### M5

`/home/chlo/Documents/dev/moshi/docs/symbols.md`，300 行。完整讀取。用於核對 `TerminalRuntime`、transcript cache、surface identity、IME 等概念來源，不採其中過時的 chatMode「語義待定」說法；M2 已修正。

SHA-256：`133815b3b121bd069c7dcb9207f387c9f5b52da927d43be82400f778dd5f736c`。

`hook-symbols.tsv` 是 20,286 行地址索引；本次未全表逐行重做 reverse engineering，亦無此必要。其用途與證據上限依 M4；不聲稱已驗證每個函式的實作。

### H1

Herdr App guide，固定 commit `cfcf836404f932817f10f88455c33e33c94fd1df`：

- [defaults/AGENTS.md](https://github.com/herdrdev/herdr-app/blob/cfcf836404f932817f10f88455c33e33c94fd1df/defaults/AGENTS.md)：L28–58 能力與驗證；L128 起 Pane model；L875–934 Mod 生命周期／native UI；L992–1000 檔案 API。
- 關鍵細節：`cx` 不可跨 callback 保存；hidden Mod 不等於 close；每次 JS redraw 影響整個視窗，因此不能用高頻 timer 驅動裝飾動畫。

### H2

[defaults/herdr.d.ts](https://github.com/herdrdev/herdr-app/blob/cfcf836404f932817f10f88455c33e33c94fd1df/defaults/herdr.d.ts)：exec/hc、讀檔限制、PaneInfo、focused、shared 與 watchFolder。GPUI runtime 的限制應以目標機器產生的 types 覆核。

### H3

[src/commands.rs](https://github.com/herdrdev/herdr-app/blob/cfcf836404f932817f10f88455c33e33c94fd1df/src/commands.rs#L42-L81)：`pane.split`、`pane.close`、`terminal.park`、`layout.select` 的公開命令。

### H4

[src/window.rs](https://github.com/herdrdev/herdr-app/blob/cfcf836404f932817f10f88455c33e33c94fd1df/src/window.rs#L1380-L1445)：已納入 model tabs 的 TerminalView 留存；移除 view 時 detach；Mod copies 的 ownership。

[layout.select implementation](https://github.com/herdrdev/herdr-app/blob/cfcf836404f932817f10f88455c33e33c94fd1df/src/window.rs#L3263-L3268) 僅操作 `self.chrome`。不能把這一行推廣成任意 model Pane presentation API。

### H5

本機 `hc --version` → `hc 0.1.18`；`hc --skill` 定義 `$HC_TERMINAL_ID`；`hc --help` 描述 `send` 是 paste＋Enter、`keys` 是按鍵注入。此項是本次 read-only CLI 文件核查，不是對正在執行的 Agent 發命令。

### P1

Pi 套件：`@earendil-works/pi-coding-agent` **1.5.0**。官方 tag `v1.5.0` 對應 commit `f9a26365568127461c47a07a37dcb42c140a3ac5`；本機 `docs/session-format.md` 與該 tag 內容 byte-identical。

[Session format](https://github.com/earendil-works/pi/blob/f9a26365568127461c47a07a37dcb42c140a3ac5/packages/coding-agent/docs/session-format.md)：tree／usage／system／compaction／context_edit／custom entry。完整讀取。

### P2

[Extensions](https://github.com/earendil-works/pi/blob/f9a26365568127461c47a07a37dcb42c140a3ac5/packages/coding-agent/docs/extensions.md)：L473 起 session lifecycle；L752–817 message/tool events；L1201 起 readonly session manager；L1253 起 runtime helpers；L1512 起 reload；L1649 起 `sendUserMessage`。

本機 extension 文件與該 tag byte-identical。只讀相關章節，不把整份 extension API 當成 UI 端可直接呼叫的 API。

### P3

[session-manager.ts](https://github.com/earendil-works/pi/blob/f9a26365568127461c47a07a37dcb42c140a3ac5/packages/coding-agent/src/core/session-manager.ts#L1160-L1191)：首次有 conversation 才落盤，後續 append。

[branch/resetLeaf](https://github.com/earendil-works/pi/blob/f9a26365568127461c47a07a37dcb42c140a3ac5/packages/coding-agent/src/core/session-manager.ts#L1580-L1605)：可僅改記憶體 leaf，不寫新的對話紀錄。

### P4

[agent-session.ts](https://github.com/earendil-works/pi/blob/f9a26365568127461c47a07a37dcb42c140a3ac5/packages/coding-agent/src/core/agent-session.ts#L1158-L1187)：extension events 先於 message persistence；`message_end` 才 append。

### P5

[RPC mode](https://github.com/earendil-works/pi/blob/f9a26365568127461c47a07a37dcb42c140a3ac5/packages/coding-agent/docs/rpc.md)：另啟 subprocess；stdout 必須持續讀取；accepted 不等於工作完成；`agent_settled` 與 `agent_end` 不同。完整讀取。

## 7. 可重現性與保密

此設計記錄來源路徑、hash 與上游 commit，不將競品解包產物、Moshi 程式碼／資產、使用者真實對話、SSH 資料或 Session ID 複製進公開專案。未來 fixtures 應自行生成並標明 synthetic。數字化效能目標見 05，全部是**待量測的設計預算**，不是本輪跑出的 benchmark。

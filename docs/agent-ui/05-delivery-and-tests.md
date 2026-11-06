# 05 · UI-first 交付計劃與驗收

**這是規劃與待驗證目標，不是已完成的功能。** 目標平台的 Herdr App GUI、Pi bridge 與效能尚未實測。上游限制見 [01](01-evidence.md)，UI 內容見 [02](02-ux-spec.md)，模組／通訊見 [03](03-architecture.md)／[04](04-pi-contracts.md)。

## 1. 調整後的優先序

```text
P0  最小可操作原型 ＋ 原生 Pane feasibility spike（先驗證核心流程）
 ↓
P1  原型後 UI／UX 打磨（實機觀察 → 改版 → 回歸；仍使用 fixtures）
 ↓
P2  最小 Pi runtime event bridge（僅供 UI，不做 Session Reader）
 ↓
P3  Composer／follow-up／steer 與安全控制
 ↓
P4  科研內容、性能、多機器、穩定與發布
```

**零個 Session JSONL Reader／檔案掃描／索引／watcher 工作項目。** 先把介面設計好，再補支援介面顯示的最小 Pi event adapter；不要以資料基礎設施取代 UI 的產品目標。

**明確的順序：先做 P0 可互動原型，收集問題後才執行 P1 的視覺與體驗精修。** 詳細工作單與通過標準見 [07 · 原型後 UI／UX 打磨](07-post-prototype-polish.md)。不要因想把第一張畫面做得完美，而延誤「真正同一 Pane、不打斷 Pi」的技術 Gate。

## 2. P0：設計原型與原生 Pane Gate

**交付**：使用合成資料的最小 native GPUI demo、基本組件與可操作 prototype，以及目標 Herdr 版本的 Pane 切換能力報告。**P0 不要求視覺定稿**。

**目前狀態（2026-11-06）**：已建立使用 fixture 的 GPUI UI、互動測試與專用 `agent-ui-demo` Layout，詳見 [08 · 原型實作現況](08-prototype-implementation.md)。但現階段以 **chrome stack 切換整個 active Tab 的畫面區**，不能把它當成真正的模型 split-Pane 切換；原生 Pane Gate 和實機 GUI 驗證仍待完成。

- 先畫出底部 **Status Bar 的 Terminal／UI 切換控制**（不放在 Pane Header）、Chat timeline、工具活動摘要、折疊卡片、Composer、回底、空態／錯誤態。控制應與現有 Machine／Agents／Commands／Project Open 排在**同一個 renderer**，不新增獨立 Layout 格。
- 由 [R1/R2](01-evidence.md#r1) 取「答案優先、工具可折疊、閱覽錨點、精緻排版」，由 [Moshi](01-evidence.md#m2) 取「同會話兩種呈現、視覺隔離、保留狀態」，但**不搬 React/HTML、Moshi 私有程式碼**。
- 在目標 Herdr App 證實 `layout.select` 的範圍與其他 native Pane API；若無原生 alternate surface，設計最小 App presenter hook／上游 PR。
- 測三個 split Pane：兩個 Pi／一個 Shell，只讓其中一個 Pi Pane 變成 UI；工作程序、PTY、geometry、其他 Pane 焦點不能受影響。
- 測 **Status Bar 的 focused-Pane routing**：聚焦 Pi-A 顯示 A 模式，聚焦 Pi-B 顯示 B 模式，Shell／無 Pane／不明身分時停用；按下當下捕捉 PaneId／epoch，故意在非同步完成前切換焦點，命令不得落在新的 focused Pane。
- 測狀態列完整性：原本 status 資訊、Project Open、背景、邊框和高度不變，不得出現之前的獨立 cut-out；即使 UI renderer crash 仍有 Return to Terminal。
- 無 bridge 時展示 synthetic fixture 是**開發模式**，不能把模擬訊息冒充真實 Pi 對話。正式 build 僅顯示「整合未就緒」與返回 Terminal。
- **這一階段只保證主要動線可測：切模式、讀答案、展開工具、草稿輸入、回 Terminal。** 細緻排版、全套工具卡、微動畫、全面的 a11y 與視覺 tokens 調整留到 P1；但不中斷與誤送等安全性不能延後。

**Gate**：如果嚴格同 Pane 做不到，後續可做 UI 原型，但不能宣稱產品已完成。不得以 `pane.close`、`terminal.park` 或重啟 Agent 冒充切換。

## 3. P1：原型後的 UI／UX 打磨（先不依賴真實 Pi）

**進入條件**：P0 原型可操作，已實際檢查主要動線，且有原型畫面／錄影與問題清單（含阻擋性 Pane Gate 結論）。

**交付**：根據原型發現進行第二輪設計的 `mods/agent-ui` 元件、theme tokens、mock event store、tool renderer registry、同場景修改前後對照與 UI 行為測試。完整逐項工作見 [07](07-post-prototype-polish.md)。

完成條件：

- `StatusBarModeToggle`：Terminal／UI 的唯一切換入口，位於原有 Status Bar 內；隨 focused Pane 呈現正確模式，非 Pi 或身分不明停用；保留鍵盤與可及性標籤，不能只靠 hover。
- `Header`：Pane 內只顯示 Agent、host、工作狀態，不再包含 Terminal／UI 切換控制。
- `Conversation`：user/assistant 視覺分層、streaming 文字、結果優先、活動摘要、錯誤有清楚視覺權重。
- `ToolCard`：read/search/bash/edit/diff/custom 的摘要／詳情，未知工具可有界降級；失敗不能被所有工具群組折疊藏掉。
- `Thinking`：僅顯示提供的內容，auto/user-open/user-closed 互動不因新資料而跳變。
- `Scroll`：follow-tail／reading／restoring；使用者上捲後不被 stream 拉回底，回底按鈕可用。
- `Composer`：auto-grow、草稿保存、送出 revision、中文／日文 IME、Shift+Enter；此階段只 mock dispatch，不真的送 Agent。
- `Code/Science`：CJK、code block、diff、表格、可複製的 LaTeX source；原生公式 renderer 需單獨驗證。
- `Empty/Error`：初次開啟、未連線、Agent 已退出、stale、bridge 版本不支援，都有可讀文案與回 Terminal。
- 多 Pane／窄寬度（360／520／900 logical px）與 keyboard-only／screen-reader baseline。

本階段先以使用者真實操作回饋排序：**錯 Pane／失去返回路徑 → 焦點／草稿／IME → 內容掃讀與錯誤可見 → 窄 Pane 與視覺一致性 → 非必要裝飾**。每項修改都應有同一情境的修改前／後對照；未驗證的動畫或視覺改善不作為完成依據。

此階段**不要**開發歷史檔案 parser／索引；需要大量資料時使用**合成事件 fixtures**，包含 1000 工具呼叫、長回覆與重複訊息。

## 4. P2：接入同一 Pi 的最小事件 Adapter

**交付**：一個可選的 Pi extension、簡單傳輸（必要時很薄的 relay）、`snapshot + event` 契約與 runtime binding。

完成條件：

- Pi TUI 仍由 Herdr Core 執行；extension 只觀察自己所在的同一程序，不新開 RPC Pi。
- 初始畫面從 Pi `ctx.sessionManager.getBranch()`／`getSessionId()` 取有界**記憶體** snapshot；後續透過 message/tool event 更新 UI。
- 支援 active leaf／session 替換、並行工具、out-of-order event、producer restart、事件 buffer gap 與 resync。
- UI 隱藏、bridge 故障或傳輸斷線不影響 Pi 的 tool／模型工作。
- 每個 Pane 有精確 runtime binding；同 cwd 的兩個 Pi 不串線；過期 event 到來不閃舊畫面。
- 無 extension 時正式 UI 顯示未啟用狀態，不讀 JSONL 補救，不裝新 Agent。
- 安裝到已經忙碌的 Pi 時不強制 `/reload`；需等 idle 及使用者同意或下一次啟動。

**P2 的成功標準是能用 UI 看正在工作的原 Pi，而不是建出完美的歷史服務。**

## 5. P3：讓 Composer 真的能用

**交付**：`prompt`、`followUp`、`steer`、顯式 `abort`；安全傳輸、request receipt、draft state。

完成條件：

- 只向驗證過的 host／terminal incarnation／Pi session／binding epoch 發送；不靠 cwd 或新舊檔案推測。
- 使用安全 request-body／stdio／owner-only IPC；prompt、圖片、token 不寫進 process argv、shell history 或 log。
- Idle 送出；Working 預設 follow-up；steer 按 Pi 的真實交付點顯示文案。
- 未知送達／連線中斷不自動重發；重複文字的兩則訊息都合法。
- 草稿在操作期間更新後不被舊 completion 清掉；UI 與 Pi TUI editor 不互相覆寫。
- Stop 是獨立操作，切 Terminal、UI 當機、關 Tab 設定不得偷偷呼叫它。
- 沒有結構化 question／approval 協定時清楚提示回 Terminal，不盲按 y／Enter。

若 P3 安全通道不可用，**保留 P2 可閱讀的完整 UI 並禁用 Send**，不犧牲既有 Terminal 的可靠性。

## 6. P4：精修、效能與發布

**交付**：原生視覺拋光、content adapter、長任務效能、多機器與相容性驗證、可回退安裝。

完成條件：

- 流式輸出與工具分組平順，但只對渲染做節流，不修改或延遲真實事件 store。
- Markdown、長 code、CJK、科學公式、表格、圖片、diff 都可在支援範圍內閱讀與複製，未知格式明確降級。
- 長 conversation、1000 tools、數 MB 內容，記憶體／重繪有界；不用高頻 JS timers 驅動裝飾動畫。
- 遠端 host 斷線／恢復可顯示 stale 與 resync，仍能一鍵回 Terminal。
- macOS／Linux／Windows **只對已實測** 的組合宣稱支援；`herdr-app check` 通過不等於 GUI 互動已驗證。
- Installer 不覆寫現有 personal layouts／project-open，不靜默修改 App binary，不自動重啟 Core／Pi，保留單一 `.bak` 及 rollback。

## 7. 可分工的 PR

| PR | 內容 | 合併 Gate |
| --- | --- | --- |
| 01 | UI tokens、synthetic conversation fixtures、state model | 無真實個人 Session；mock events 可重播 |
| 02 | Native Pane prototype＋**Status Bar 聚焦 Pane 切換**／最小 SurfaceHost 支援 | 只切指定 Pane；100 次切換無 detach／runtime restart；不破壞既有 Status Bar／Project Open |
| 03 | **原型後 UI／UX polish**：conversation／tool cards／thinking／composer mock UI | 先附原型問題清單與對照，再通過 keyboard、IME、copy、scroll、theme、a11y baseline；[07](07-post-prototype-polish.md) |
| 04 | 原型後搜尋／分頁／長內容與窄 Pane 精修 | 1000 tools、超長內容、有界 rendering，無 file index；修正前／後實機對照 |
| 05 | Pi extension runtime identity + bounded snapshot | 同一 Pi；不啟動第二 Agent；不讀磁碟 Session |
| 06 | Message/tool event transport、stale/reconnect | 非阻塞、同 Session、事件 epoch／cursor 檢查 |
| 07 | 安全 Composer + command receipts | 防錯送／雙送／不確定重試；private transport |
| 08 | Native content refinements、remote QA、install docs | 實機 GUI 驗證、回退與文件一致 |

UI 與宿主 Pane spike 可以平行；Pi bridge 不阻礙 UI mock prototype。跨程序 transport 只為服務這些 GUI 能力，不逐步演變成不相關的 Session 管理框架。

## 8. 必須通過的測試矩陣

| ID | 場景 | 成功判斷 |
| --- | --- | --- |
| INV-01 | Pi tool 執行中連續切換 UI／Terminal 100 次 | Pi process、terminal address、工具副作用不變／不重跑 |
| INV-02 | 三個 split Pane 只切一個 | 其餘 Pane 的內容、大小、focus 不變 |
| UI-SB-01 | Status Bar 顯示目前 focused Pane 的切換狀態 | Pi A/B 切焦點只更新控制顯示；Shell／無焦點時 disabled；不更動各 Pane 模式 |
| UI-SB-02 | 點擊後立刻換焦點／非同步競態 | switch 只作用於點擊時 captured PaneId/epoch，不送到新焦點 |
| UI-SB-03 | Status Bar 外觀／生命周期 | Machine、Agents、Commands、Project Open 不消失；共用背景／border；無額外 block；Agent UI crash 後仍能切回 Terminal |
| INV-03 | UI／bridge 崩潰 | 原 Terminal 可用，Pi 繼續 |
| INV-04 | 切回 Terminal | Kitty images、scrollback、terminal editor 狀態未被破壞 |
| UI-01 | 對話與工具狀態 | 答案清楚；失敗可見；unknown 不是成功 |
| UI-02 | 使用者手動 disclosure | 折疊選擇保留，搜尋 temporary reveal 不改手動偏好 |
| UI-03 | streaming 時上捲／搜尋／切模式 | 不被新資料拉回底；anchor 保持 |
| UI-04 | 長內容／窄 Pane | 360／520／900 px、1000 tools、CJK/code/math 不溢出或卡死 |
| UI-05 | IME／草稿／focus | 組字時 Enter 不誤發；切模式不清草稿；焦點可預期 |
| POL-01~07 | 原型後 UI／UX 打磨 | 完成 [07 的驗收矩陣](07-post-prototype-polish.md#h-原型後的審查與-done-gate)；記錄原型問題、修改前後對照與未解限制 |
| PI-01 | 兩個相同 cwd 的 Pi | Session、model、工具狀態不串到另一 Pane |
| PI-02 | `/new`、resume、bridge restart | 舊 events 不閃現；新 epoch 只顯示新 Session |
| PI-03 | 多工具並行與不完整 end | card ID／parent 關聯準確，不補假成功 |
| PI-04 | Pi 未載入 extension | 顯示清楚空態；Terminal 仍能用 |
| CMD-01 | 相同 prompt 送兩次 | 兩則合法命令獨立顯示；不按文字去重 |
| CMD-02 | 發送時 crash／失聯 | `uncertain`，不自動重送 |
| CMD-03 | Pi 回 shell、host 變更 | 拒絕 stale control；不把 prompt 送到 shell |
| SEC-01 | 無授權 IPC／錯誤 client | 拒絕控制；不對公網開 listener |
| SEC-02 | 大 prompt、遠端傳輸 | prompt/token 不在 argv 或普通 log |
| INSTALL-01 | 既有 Mod／Layout、自訂配置 | 不覆寫；單一 .bak；可回退 |

### 真實 GUI 驗收影片

最少錄製：

1. Pi 正在執行工具 → 開 UI → 捲動閱讀與 Copy → 切 Terminal → 同一工具仍運行 → 再進 UI，保留捲動位置。
2. 三 Pane 只切其中一個，另一個 Pi 與 Shell 繼續正常運作。
3. 中文 IME 組字、已寫草稿、送出期間繼續輸入、transport 失聯時停止 Send。

**所有 P0–P4 效能目標都是待量測預算**：warm 切換 p95 < 100ms（cache hit）、可見事件顯示 local p95 < 500ms／remote < 1000ms、GUI 預期 ≤10 次/s 合併刷新、visible tool 內容有界。不可把未執行測試寫成「通過」。

## 9. 發布判斷

- [ ] **Status Bar 原位整合** Terminal／UI 切換，沒有獨立底部區塊，仍保留 Project Open 等既有資訊；聚焦 Pane 路由與 disabled 行為已驗證。
- [ ] 真正同一原生 Pane；無需終止原本 Pi／改動其他 Pane。
- [ ] **P0 原型完成後**依 [07](07-post-prototype-polish.md) 完成 P1 UI／UX 打磨；有使用者任務觀察、修訂與回歸證據，再接入 live Pi。
- [ ] Pi adapter 完全可以選擇不安裝；沒有它時仍有可用 Terminal，不偽裝有資料。
- [ ] 安全控制已驗證，否則 Composer 只能保留草稿而不能 Send。
- [ ] 無 Session JSONL Reader／歷史索引實作或安裝步驟。
- [ ] 實機 GUI、IME、accessibility、長內容、遠端失聯皆通過。
- [ ] 不影響現有 project-open／個人 Layout、可回退；已知限制如實寫明。

**第一個真正成功的里程碑，是一個看起來和操作起來像成熟桌面 App 的 UI，並能在同一 Pi 正在工作時隨時切入與返回 Terminal。**

# 07 · 原型之後的 UI／UX 打磨清單

**狀態：待執行設計規格；不是已完成的畫面或驗收結果。**  
**執行時機：P0 可互動原型與同 Pane 可行性 spike 之後、Pi bridge 正式整合之前（P1）。**  
參考 [整體 UI 規格](02-ux-spec.md)、[原生架構](03-architecture.md)、[交付計劃](05-delivery-and-tests.md)。本文件只聚焦 GUI，不包含 JSONL Reader／歷史索引。

**已收到原型第一輪實際試用回饋，先處理 [FB-01～06](09-p0-feedback-round1.md)**：隱藏三個 fixture 情境按鈕、Status Bar 改單一 SVG、移除常駐 preview 搜尋、工具群組預設折疊成一行摘要、修復真正的 Markdown 呈現。以下原始設計值如與本輪明確回饋衝突，以 [09](09-p0-feedback-round1.md) 為準。

## A. 先做原型，再根據實際操作改，而不是一開始做滿

### P0：最小可操作原型（不要求精修）

- 既有 **Status Bar** 中可操作的模式切換占位；P0 可用文字控制驗證功能，**P1 要收斂為與 Project Open 同規格的單一 SVG**；只作用於 focused Pane，其他 Pane 不動。
- 一個典型 Pi conversation：使用者訊息、答案、一個進行中的工具、一個失敗工具、一個可展開的 details。
- 基本 Composer（fixtures／mock dispatch），能測量文字輸入與中文 IME，但不能真的送到 Pi。
- 模擬：streaming、未連線、長訊息、空白內容、UI 初始化失敗。
- 以明確標記為 **Mock／Prototype** 的資料展示，不使用真實 Session 檔，不引入 Pi bridge。
- **Gate**：模式選擇、內容閱讀、工具展開、輸入、回 Terminal 的主要動線可操作；同 Pane 的宿主能力要有書面結論（已支援／須最小 App PR／仍阻擋）。若 Gate 未通過，先修原型問題。

**P0 不做**：完整動畫、像素級排版、完整語法高亮、全部工具專屬卡片、複雜設定、多主題微調或廣泛優化。避免讓造型工作拖延切換可行性驗證。

### P1：先評估原型，再打磨

按 **觀察 → 分類 → 修訂 → 再驗證** 的循環執行：

1. 在目標 Mac 實際用原型完成 4 個代表性任務：閱讀答案、檢查失敗工具、編寫草稿、在兩個 Pi Pane 間切換。
2. 記錄截圖／短錄影、使用者意圖、預期、實際、阻礙、嚴重程度；不要只記美觀感想。
3. 先解決 **P0 blocker**（錯 Pane、UI 無法返回 Terminal、焦點失控、錯誤狀態不可信）。
4. 再依本文件 B–H 的視覺與互動細節逐項處理；對比修改前／後。
5. 每個改動都要有對應真機視覺／行為測試，並回填設計 tokens 和元件規格。

### P1.0 · 先做刪減，再做新功能

1. `Working / Completed / Needs attention` 只屬於 mock scenario；**移至 fixture/test harness**，不顯示為可修改 Agent 狀態的三顆操作按鈕。
2. **移除 `Search this preview…` 常駐輸入欄**。P1 不以搜尋為主要入口；若實際長會話需要，日後按需開啟。
3. 工具群組預設**整組一行摘要**，工具詳情延後到手動展開；不要只把每張工具卡的正文關起來。
4. 檢查原型 `para()` 對 `**bold**` 等沒有解析的事實；優先做原生 Markdown 渲染的短 spike，而非改文案去避開 Markdown。

此項是本輪回饋的**明確優先級**，不是用戶要求現在就修改程式。

### P1.1 · Tool Activity 精修與側邊導航實驗

**工具 UX 是確定要做的 P1 工作**：依 [10 §3](10-tool-activity-live-rail.md) 實作 `Group Summary → Compact Tool Rows → typed Detail`，不是單純隱藏 box。借鑑 PI-Desktop 的 typed slots、paseo 的 run-level grouping、ZCode 的專用細節 renderer；Read／Search／Bash／Edit／未知工具都有明確「收起看甚麼／展開看甚麼」和可信的錯誤狀態。

**Live Conversation Rail 已有新的 Demo 行為（超越早期 pi-harness 單一 active 提案）**：每輪一節點，**在目前可視範圍內的所有輪次都亮起**；click 在原始連續對話中捲動而不是切換列表；Hover 只有一行短使用者問題（真正要求使用者介入才第二行），不含工具失敗著色／工具統計。節點和預覽的幾何必須限制在畫面內，工作區根容器使用 Herdr pane 同款圓角。仍需測原生 Scrollbar、IME／鍵盤、resize 和大歷史性能。詳見 [11](11-agent-ui-demo-implementation.md)。

## B. Status Bar 模式切換：融入原生 Herdr，不像補丁

| 設計項 | P1 決定／驗收方向 |
| --- | --- |
| 位置 | **原有 Status Bar 同一 renderer**，和 Machine、Agents、Commands、Project Open 並列；不可增加另一列或獨立 `block` |
| 造型 | **單一 15px SVG 位於 22×22 hit target**，直接比照 `project-open-button`；共用背景、高度、baseline、邊距；不另畫分段控制框、無色塊挖空 |
| 狀態 | **一個 SVG（可依 mode 換 variant）**，反映 focused Pane 的 mode／下一個動作；換焦點不改其他 Pane，accessible name 明確描述目標 |
| 點擊 | 按下時綁定 paneId／runtime epoch；非同步後焦點已換，仍只切原目標或安全拒絕 |
| 不可用 | Shell、無 active Pane、未知 Pi 或 host mismatch 時禁用；以可見狀態和 accessibility label 解釋 |
| 鍵盤 | 可從鍵盤選中、看到 focus indicator；快捷鍵若新增需先檢查官方 bindings 衝突 |
| Hover | **沒有 tooltip、背景閃爍或位移**；不可把關鍵狀態藏在 hover |
| 響應式 | **任何寬度都只是一個 SVG icon**，不先顯示文字再縮小；不犧牲「可返回 Terminal」 |
| 恢復 | UI renderer 崩潰後，宿主仍能從 Status Bar 切回原 Terminal，不需要 Mod 正常渲染 |

**不可用漂亮的自訂 Status Bar 換掉使用者已有的 `project-open` 或既有按鈕。** 先驗證可否組合現有 status renderer；若不能，定義最小 compositor／host extension。不能用額外 32px hole 掩飾 API 缺口。

**不要誤用「無 hover」為「無無障礙標籤」**：鼠標 hover 不顯示 tooltip／突出背景，但焦點環、鍵盤操作與螢幕閱讀器描述保留。對照 [FB-02](09-p0-feedback-round1.md)。

## C. Conversation：讓內容有清楚的閱讀節奏

**視覺層級**：使用者意圖、助手主要回覆、工具活動、次要 metadata 各有穩定層級。資訊層級不靠彩色背景堆疊；主內容不應被 Agent 頭像、時間戳或徽章搶焦點。

- 內文初始設計值：14–15 logical px；中文閱讀行高以真機實際字型測試為準，目標段落與 code 區隔清楚。等寬 code 先用 12.5–13.5 logical px 測試，避免標示「已固定最終尺寸」。
- 對話內容使用相同左側閱讀軸線；user/assistant 可用緊湊 role marker 或溫和間距差異。不要左右交錯聊天氣泡把長程式碼擠窄。
- 助手的最終答案優先：正常完成時，長工具流水帳默認收成一行活動摘要；失敗／未知則保留獨立可見提示。
- Metadata（模型、耗時、用量）放在次要層，不在每個 chunk 重新計算版面寬度；缺失不顯示 `0`。
- 長回覆：**真正的 Markdown renderer** 呈現 heading、strong／emphasis、lists、links、inline/fenced code，而不是 P0 的 `split("\\n\\n")` 加 `##` 字號特判；程式碼區塊有 Copy、來源，外部連結可辨識而非裸露一長串 URL。
- 對話尾端：streaming 中不可用持續閃爍的裝飾游標推動 scroll；只有最新已收到的文本算作內容。
- 空會話：第一眼說明「這個 Pi 尚無對話」或「尚未啟用整合」，不能用一樣的空白畫面混淆。

**原型後對照**：在 360／520／900 logical px、中文＋英文混排、長 code block 及大字體設定下比對截圖；不能有水平壓縮、重疊或難以選取的內容。

## D. 工具卡與 Thinking：可掃讀、可深入、不中斷閱讀

**P1 主規則：工具群組初始只有一行摘要，且不把每一項工具渲染成獨立 box。** 必須分三層：`group summary (collapsed)` → 點擊後 `compact tool rows` → 點擊單項後 **依工具類型設計的專用** `details`。詳細示例、類型矩陣、失敗標記和有界內容策略見 [10](10-tool-activity-live-rail.md)。

| 情況 | 收合摘要 | 展開細節 |
| --- | --- | --- |
| Reading／Searching | `讀取 8 次 · 2 個路徑`（計數必須可驗證） | 檔案路徑、位置與有界內容 |
| Executing | command 名稱與 `running/success/failure/unknown` | 真實輸出與可信的 exit status |
| Editing | 修改對象／有來源證據的變更數 | 真實 diff；來源不足時退回 raw tool details |
| Multiple tools | **整個群組預設折疊**；一行統計，失敗／待處理數量仍在摘要顯示 | 先展開無框緊湊列表，再可選展開單項細節；不一次掛 1000 卡 |
| Thinking | 預設單行摘要且可手動展開 | **僅展示 Pi 實際提供的內容**；沒有內容就說不可用 |

**互動細節**：

- 群組展開箭頭、標題與可點範圍一致；展開後的工具列用文字／細分隔線而非 raised card；單項 Copy、更多動作與展開不互相誤觸。
- `auto / user-open / user-closed` 三態；使用者手動選擇跨 streaming、切 Terminal/UI 和重排仍保留。
- Failed／pending／unknown 以文字＋形狀辨別；不只靠紅綠色。
- 單項工具詳情顯示「檢視更多」時明確標示資料界線；不能讓被截斷內容像完整輸出。
- 如後續實作按需搜尋，命中已折疊群組時暫時 reveal，但退出搜尋需還原使用者手動折疊偏好；**P1 不常駐搜尋框**。
- 失敗摘要不能藏在已完成工具總數裡；如果 Agent 仍在工作，不冒充 final。

## E. Composer：最容易讓人感覺「像成熟 App」的地方

**P1 只在 Mock／fixtures 下打磨**；真正送入同一 Pi 的安全控制由 P3 驗證。

- 位置固定在內容區底部，不跟隨時間線捲動；窄 Pane 必須保留完整可編輯區域，不能被 Status Bar 擠掉。
- 單行時緊湊，輸入增長自動加高，但有最大高度；超過後變 Composer 內滾動，而非擠到 timeline 只剩一行。
- `Enter` 送出、`Shift+Enter` 換行的預設可更改，**IME 組字時 Enter 永不送出**；切模式前需保留未提交的組字狀態，不做自動提交。
- Idle 顯示「送出」；Working 預設「完成後送出」，顯式的 steer 需有區分的操作名稱；Stop 與 Send 永遠不共用一個模糊按鈕。
- 草稿依 Pane + Pi runtime identity 保存；切到 Terminal 不拷貝、清空或偷偷送出草稿；UI 回來時回到原本編輯位置。
- 按下 Send 後，若使用者又編輯 draft，舊回執不可清除新 revision；離線時保留草稿並阻止送出。
- Mock 也要顯示 `preparing/accepted/queued/uncertain/rejected` 狀態；不把「已點擊」寫成「已送達」。
- Attach、命令選單、模型／Thinking Level 設定等不搶首版入口，沒有可靠能力時用清楚的 disabled／未提供狀態。

## F. 微互動、回饋與焦點

| 操作 | 預期 |
| --- | --- |
| Terminal → UI | 當前 Pane 不跳動、不換大小；UI 暖啟動應維持 scroll、draft、disclosure |
| UI → Terminal | 原 TerminalView、scrollback、Kitty 圖像與焦點完整恢復，Pi 持續工作 |
| 使用者上捲 | 停止 follow tail；有新輸出時固定「有新內容 ↓」，不把人拉回底部 |
| Live Conversation Rail（候選） | 點擊輪次 marker 精確跳轉；hover/focus 顯示短問題／回答／狀態，不觸發捲動；P1 不新增搜尋框 |
| 複製 | 給最短必要回饋，不彈出阻斷模態框；Copy 結果是完整已收到的文字 |
| 網路掉線 | 顯示 `stale` 與最後同步資訊，禁用送出；仍能切回 Terminal |
| 焦點切 Pane | Status Bar 控制更新為新的 focused Pane，兩 Pane 的 UI 狀態互不覆寫 |
| 未知錯誤 | 顯示具體可復原動作（回 Terminal／重試同步），不永久 spinner |

動畫只用於**反映狀態**，不是裝飾：避免連續 shimmer、跳動高度、每 token 都滾動；Reduced Motion 下沒有資訊流失。從 pointer、keyboard、a11y 都能訪問同一功能。Hover 不顯示多餘提示，但 focus indicator 仍必須可見。

## G. 原型後的視覺 Token 與響應式檢查

下面是**起始設計候選**，需對照 Herdr 原生元件和目標 macOS 字體再調整，不宣稱已存在於 GPUI API。

| Token | 初始方向 | 測試重點 |
| --- | --- | --- |
| `surface.base` | 完全沿用 Herdr theme／Pane 背景 | Terminal/UI 切換無色塊或雙邊框 |
| `text.primary`／`muted` | 清楚層級、盡量不只靠色差 | Dark/Light、低對比螢幕 |
| `space` | 4／8／12／16／24 logical px 系列 | 中英混排、密度一致 |
| `corner` | 盡量沿用 Herdr 原生半徑 | 不造大量互不相干的卡片 |
| `type.body`／`mono` | 14–15／12.5–13.5 logical px | CJK、code、長路徑、放大字體 |
| `status.height` | **保持 Herdr 現有** | Project Open 與 mode control 不切出凹槽 |
| `control.minHitArea` | 保證可穩定點擊，不因 icon 極小就只剩 16px 命中區 | Mouse／trackpad／鍵盤 focus |
| `motion` | 短、少、不改變工作狀態 | Reduced Motion、streaming |

**寬度檢查**：360 px 時最多保留一行狀態與可用 Composer；520 px 時只讀主要 conversation、不強制 inspector；900 px 時內容有閱讀寬度上限。Status Bar 本身變窄時優先保留 Terminal 還原入口，而不是強塞圖示造成截斷／挖空。

## H. 原型後的審查與 Done Gate

每次 UX polish PR 必須包含：**原型截圖 → 找到的摩擦 → 修改說明 → 相同場景的修改後錄影或截圖 → 回歸測試**。

| ID | 觀察任務 | Done Gate |
| --- | --- | --- |
| POL-01 | 在 Pi-A／Pi-B／Shell 間換焦點，從 Status Bar 切模式 | 控制反映正確 Pane；無錯送、無邊框挖空；Shell disabled |
| POL-02 | 讀 10 則對話，找出最終答案與一次失敗 | 不必展開所有工具；失敗清楚可見；Copy 正確 |
| POL-03 | 展開一組工具、上捲讀歷史、同時持續 streaming | 手動展開保留、不自動跳底、返回 UI anchor 不變 |
| POL-04 | 中文 IME 編輯三段長訊息，切 Terminal 又回 UI | 無誤發、無草稿清除、游標／焦點可恢復 |
| POL-05 | 360／520／900 px、Dark／Light、鍵盤導航 | 沒有遮擋、文字溢出、focus trap、不可讀狀態 |
| POL-06 | Bridge 離線、未知工具／大型輸出、UI error | 用戶知道發生甚麼以及下一步；原 Terminal 始終可回 |
| POL-07 | 同一個場景與前一版並列比較 | 無新增未解決的操作摩擦；視覺沒有出現新「挖空」、閃爍或焦點倒退 |
| **FB-01～06** | **本輪試用回饋**：場景列、單 SVG、無常駐搜尋、group-first tools、Markdown | 按 [09 的測試矩陣](09-p0-feedback-round1.md) 逐項核對；最終畫面不再有測試場景大按鈕或每工具一張卡 |
| **TA-01～05** | Tool Activity 分組、異常、手動展開和專用 detail | [10 的測試矩陣](10-tool-activity-live-rail.md)：20 tools 一行；失敗不隱藏；長 stdout/diff 不卡死 |
| **RL-01～11** | 右側 turn rail、**可視多 Pin 高亮**、單行短 prompt hover、連續對話捲動、窄 Pane | [10 的測試矩陣](10-tool-activity-live-rail.md)：每個可視 turn 都亮起、Hover 與 Pin 不溢出、工具失敗不改 Pin 顏色；目前 Demo 的 headless checks 已通過，原生 GPUI／長歷史 cluster／a11y 仍待驗證 |

### 打磨的停止條件

- **必須解決**：模式切錯 Pane、無法返回 Terminal、IME 誤送、草稿遺失、錯誤被隱藏、不可達的鍵盤操作、Status Bar 挖空。
- **P1 應完成**：先通過 [FB-01～06](09-p0-feedback-round1.md)，包括 SVG 單圖示、工具 group-first 折疊、Markdown 原生呈現，再校準清楚內容層級、閱讀 anchor、狀態文案、響應式佈局、基本無障礙與互動一致性。
- **可延後到 P4**：額外視覺動效、少見工具精緻卡片、進階科研 renderer、特別大內容的更細緻視覺優化、跨平台像素級調校。這些不能擋住核心 UI 進度。

**重點**：P0 要回答「能不能用、會不會中斷」；**P1 才回答「好不好用、是否像成熟原生 App」**。P2/P3 接入真實事件與控制後，P4 再做一次實機差異回饋，不回頭造 Session Reader。

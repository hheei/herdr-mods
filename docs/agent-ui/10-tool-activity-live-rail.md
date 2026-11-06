# 10 · Tool Activity 與 Live Conversation Rail：P1 詳細設計

**日期：2026-11-06｜狀態：設計參考；已有部分原生 GPUI Demo 實作，其餘仍待實機驗證。** Tool Activity 已有第一版；Live Rail 的高密度歷史／可及性仍待完整驗證，測試不佳可延後，不能因加入側邊控件犧牲閱讀空間。
**最新修改**：[11](11-agent-ui-demo-implementation.md) 已把連續 transcript 的多輪可視高亮、量測式 click 捲動、限界 hover 和圓角實作成 Demo；以下早期「單一 active turn／工具狀態 Pin」描述以最新規格為準。

**Stack 與圓點設計**：Agent UI 是 **Chrome Layout Stack 內的 UI child**，不建立獨立的 model Pane。Message Rail 預設每輪一個 **4px 圓點**，所有與 viewport 相交的輪次圓點均放大到 **8px**，共用同一條中心線；Theme `dim`／`muted` 中性色，不依工具狀態染色。移除額外的縱向區間高亮條，避免與 Scrollbar 混淆。Stack 子視圖輕量使用 Herdr 同款圓角／邊線／Topbar，沒有重複建立 Pane Frame。手動 transcript `scrollY` 暫為唯一 scroll owner，不能疊加未同步的 native Scrollbar。

**Scrollbar 實作更新**：目前已用原生 GPUI builder 製作與 Herdr Terminal 相近的細型 Scrollbar（1px Track／4px Thumb，12px 點擊區），不是另一個獨立 Scrollbar scroll owner。Track click、Thumb drag、Wheel、Rail Click 都修改原有 transcript `scrollY`；Rail 可視圓點由同一幾何計算。測試已檢查 mouse-down／move／up、上下邊界、resize、無可捲內容自動隱藏。具體 [11](11-agent-ui-demo-implementation.md)；真正 Herdr App 指標捕捉和視覺仍待實機測試。

本文件回應 P0 試用後兩項新增要求：**工具卡參考其他 Agent UI 重新設計**，以及**不加 Search，改評估即時對話導航側欄：點擊跳轉、hover 預覽**。沿用 [02 UI／UX](02-ux-spec.md) 和 [07 P1 polish](07-post-prototype-polish.md)；不修改現有 Pi 程序／Session、不建立 JSONL Reader。

## 1. 設計定位：兩個不同、相輔相成的層次

- **主對話區**負責回答「Pi 做了甚麼、結論如何、哪裡失敗」，預設只顯示必要的訊息與精簡活動行；不讓工具輸出淹沒回答。
- **Tool Activity** 是按需深入的「證據層」，不是每次執行便堆出一張有背景的大卡。
- **Conversation Rail** 是**對話內容右邊緣的輕量導航軌**，不是 Herdr 左邊的 Spaces／Agents Sidebar、不是常駐搜尋框、也不是另一個大 Inspector Panel。
- **Status Bar** 只保留 [單 SVG 模式切換圖示](09-p0-feedback-round1.md)；Rail 的 hover 預覽是另一個、使用者明確要求的互動，**不等於讓 Status Bar hover 顯示 tooltip**。
- **P1 可以使用合成 event fixtures** 實測所有呈現／導航交互；到 P2 才由**同一個活著的 Pi runtime extension**提供真實 event，依然不讀 Session JSONL 檔。

## 2. 實際參考及取捨

### 2.1 使用者的 HW1 Demo：只借「導航行為」，不複製外觀

來源（唯讀研究）：

- `/home/chlo/Projects/aiphy2026/HW1/homework1/src/hw1_chat/static/app.js`，約 **175–254 行**：`buildRail`／`sampleQuestions`／`markActiveNode`。
- 同專案 `static/style.css`，約 **361–417 行**：`.msg-rail`／`.rail-node`；`templates/index.html` 第 **102 行**：`#msg-rail`。

**已觀察到的功能：**

1. 以使用者提問作導航單位，**一個問題對應包含後續回答的一輪**；不是每個 message／tool 都佔一個節點。
2. 節點超過 **16** 時等距取樣；初始少於 **2** 個問題時隱藏。
3. 捲動後標記「正在畫面中」的輪次；點擊節點捲到對應位置；側邊窄軌在滑鼠進入 chat 時才顯示。
4. Hover 在目前 Demo 主要造成**節點寬度波浪放大**；`title` 提供「跳到第 N 個問題」，**沒有提問內容／回答摘要的預覽卡**。所以「hover 可以看到大概資訊」是**本次新增功能**，不能誤寫成已存在。

**不照抄的部分：** 綠色品牌色、波浪放大、HTML `title`、`::after` 疊條和以 DOM `.row` 下標當導航 ID。Herdr 是 Native GPUI，必須用穩定輪次 key；也不要每次 scroll 都掃全部 DOM/Rows，避免長會話成本與採樣節點歧義。

### 2.2 四個 Agent UI 的可移植模式

研究筆記：

- `/home/chlo/Documents/playground/notes/agent-ui-ux-4repos.md`
- `/home/chlo/Documents/playground/notes/agent-ui-ux-4repos-deep.md`（**以第二輪修正為準**；其中列明第一輪對 paseo／PI-Desktop 部分歸因有誤）

| 參考 | 要借鑑的行為 | 本專案的決定 |
| --- | --- | --- |
| **PI-Desktop** | `TurnProcess` 把過程與答案分開；`ToolRow` + typed presentation slots；手動 disclosure 優先 | **Group → compact row → detail view**，回答不淹沒在工具中；手動展開不被 stream 重置 |
| **paseo** | 同一輪多個工具合併為 run；窄屏在次級細節視圖查看；live 與歷史分層 | 聚合頻繁操作，不塞一堆盒子；窄 Pane 的 detail 避免把閱讀區擠壞 |
| **ZCode** | 依工具類型分派 renderer；diff/執行結果有不同欄位；完整輪次可折疊 | 保留**特定工具有用的詳情**，但只在第二／第三層打開；不沿用所有高密度卡片 |
| **pi-web** | 限制輸出高度、歷史分頁、右側對話 minimap／hover 預覽、點擊跳轉 | 導航 rail、內容預算、anchor 和 preview life cycle；避免其每工具整張 bordered card |
| **HW1** | 用問題作最小導航單位、顯示可見輪次、節點點擊滾動 | 用問答 **turn** 做 rail 節點；原生較精簡、穩定 ID；新增有內容的預覽 |

以上是從已保留的研究筆記與 HW1 原碼提煉**設計參考**，不是宣稱第三方程式碼已經移植或這些功能為 Herdr API 內建。

## 3. Tool Activity：資料模型與呈現的三層結構

### 3.1 **預設只有一個 Activity Summary**

```text
Pi
  找到了模型與實驗的兩處差異，分析如下……

  ▸ 12 operations · Read 8 · Search 3 · Run 1

  以下是主要發現……
```

有異常時：

```text
  ▸ 12 operations · Read 8 · Search 3 · Run 1 · 1 failed
```

進行中：

```text
  ▸ 5 operations · Read 4 · Run 1
```

**視覺**：摘要是一行（超窄寬度可以合理換至兩行）淺字文字＋小 chevron，**右側無獨立狀態**。不使用卡片底色、外框、陰影、進度動畫。若有工具失敗，最多在**同一行摘要文字**提示 `N failed`，工具失敗不代表使用者必須介入。**預設不展示每個 tool**，這比只把每張卡的內容收起來更重要。

### 3.2 展開群組後，才看「緊湊 Tool Rows」

```text
  ▾ 12 operations · Read 8 · Search 3 · Run 1 · 1 failed
     ✓  Read    src/window.rs
     ✓  Read    src/layout.rs
     ✓  Search  "TerminalView"                 12 matches
     !  Run     node tests                       Exit 1     ›
     ⋯  More 8 operations
```

- 工具列由**狀態圖形／文字**、動作類別、主要對象、右側最有用的一個值組成；沒有逐項 raised background／rounded rectangle。
- 對 read/search 可用數個相鄰同類項目做次級群組（如 `Read ×8`），展開後才見每個精確 call；**不得刪除原始 call 或跨錯誤／權限事件錯誤合併**。
- Tool row 上按 Enter／Click 可以展開該項的細節；另設 Copy／Open in Editor 等操作時，必須有獨立的 hit area，避免誤點展開。
- 因資料未取得或未知 `toolCallId` 不建立「已完成」假狀態，顯示 `Unknown` 或 `Pending`；數字只統計確知的 call／file，**`Read 8 times` 不等於 `8 different files`**。
- 在同一輪中間插有重要 assistant 說明或真正的需要處理互動時，按**相鄰語義片段**拆組，不把不相鄰的工具硬拼成一個 summary。最終呈現順序保留 source order。

### 3.3 單項 Detail View：按工具性質呈現，而非一種萬用卡

| 工具／事件 | 收起時的摘要（避免冗長） | 展開細節（只在要求時掛載） |
| --- | --- | --- |
| **Read** | `Read solver.py · 240 lines`（只有數字可信才顯示） | 路徑、range、可選取等寬正文；折行／複製、位置／來源；完整大檔以分頁／節流 |
| **Search / grep / glob** | `Search "Hamiltonian" · 6 matches` | 按檔案分組的命中位置、上下文；點擊可定位來源（有能力才給） |
| **Bash / exec** | `Run pytest · failed (exit 1)` | command（安全可複製）、cwd、time、exit code、stdout/stderr 按真實 evidence 區分；ANSI 輸出安全降級 |
| **Write / Edit / patch** | `Edit src/model.py · modified` | 受驗證的 old/new diff，檔名、`A/M/D`、hunk 與增刪行；不知道 old content 時顯示 raw patch 而非重建假 diff |
| **Images / generated output** | `Generated figure.png` | 有界縮圖和尺寸、原圖按需查看；資源出錯時保留路徑 |
| **Subagent**（未來） | `Subagent · working / done` | 父子關聯／可跳往對應會話（只有真實 adapter 有關聯才顯示） |
| **Unknown/custom** | `Tool: <name> · status unknown` | 有界、安全格式化的 metadata／payload；不因新工具名稱白屏 |
| **Question/permission** | `Needs input in Terminal`（如果沒有結構化控制） | 明確「回 Terminal 完成」；不生成虛假 Approve／Deny 按鈕 |

**推薦 rendering registry**：`normalizeToolEvent → ToolPresentation { type, title, target, status, preview, detailSlots, sourceRefs }`。Detail slot 可以有 `content / written / command / stdout / stderr / diff / image`；同一工具事件只有一個真正的 owner。UI 不直接理解各工具原始 JSON。

### 3.4 預設折疊、手動優先與異常升權

| 情況 | 初始狀態 | 不可被藏起來的訊號 |
| --- | --- | --- |
| 正在工作、有工具在跑 | 群組摺疊；摘要顯示最新 running 動作 | `Working` + 已知最新工具名；無法判定就顯示 `Working` |
| 成功完成且有可讀答案 | 群組摺疊；答案保留全文 | 成功／統計概況 |
| 失敗／取消／timeout | 群組摺疊；摘要強調 `N failed`，必要時一行錯誤 | **失敗數、主要失敗工具、可展開入口** |
| 等待使用者操作 | 群組摺疊；**等待操作的提示獨立可見** | `Needs attention`；未支援 UI 控制時導向 Terminal |
| 沒有最終答案，且只剩未確認的 call | 群組摺疊；保留一行最新活動／未知終態 | `Outcome unknown`；不可假裝完成 |
| 使用者手動展開／收起 | `user-open`／`user-closed` 覆蓋 auto | 狀態警示仍留在 summary；手動選擇不被 live chunk 改回 |
| 重新連接或 Session branch 切換 | 同 binding 保留選擇；不同 binding 作隔離 | 新 Session 不閃舊工具／舊錯誤 |

**決策取捨：** 參考筆記裡 pi-web 曾在「無可讀答案／失敗」預設展開過程；此處尊重使用者「預設工具都折疊」的偏好，採**群組仍折疊但異常摘要升權**。若實機測試發現不夠清楚，優先提高異常提示的可讀性，不直接全組自動展開。

### 3.5 資訊密度與內容預算（待真機驗證的設計值）

- Group Summary：有足夠寬度時目標**一行**；行高目標 22–28 logical px，窄 pane 不裁掉 failed/pending。
- Compact Tool Row：目標 24–32 logical px；類型文字 + icon 有語義，不只靠顏色。長檔名採中間省略且可在 detail 完整複製。
- Detail 初始只露 8 KiB 以內的有用資訊；文本按 32 KiB／頁；極長 code、單行、diff 用專用限額及純文字 fallback（繼承 [02 的有界預算](02-ux-spec.md)）。
- 1000 tools 時**不實例化 1000 個 Detail**：先顯示一條 group，展開後有界批次（如 20 條／次）或驗證過的 native virtualization。行高變動需保留 `scrollAnchor`。
- 相同工具在數毫秒內相繼更新，不做每事件重排全局 conversation；先更新 state，再 coalesce 可見 UI redraw。**沒有真實 progress fraction 不畫百分比或假的進度條**。
- Thinking 不等同工具：可和工具同屬 process 區，但單獨 disclosure；只展示 Pi 有提供的內容。

## 4. Live Conversation Rail：真正能找回某一輪的側邊導航

### 4.1 位置與密度

**新比較結論（pi-harness）：Rail 只負責「這是哪輪、我在哪輪、如何跳到它」，Hover 不是另一張內容卡。** 參考 `/home/chlo/Projects/pi-harness/packages/ui/src/components/ChatMinimap.tsx` 的現有多層預覽，以及同專案 `docs/notes/minimap-simplification.md` **已接受但尚未完成的簡化設計**：只留 user/custom turn 簡短提示、沿用 transcript owner 的幾何／跳轉（其**單一 active turn** 思路在 Herdr 被「所有可視輪次同時高亮」取代），不再把 assistant outline、heading jumps、tool-count badges 放進 rail。**以簡化提案作目標，不把提案誤稱為已上線能力。**

```text
┌───────────────────────────────────────────────────────────────────┐
│ Pi · Project                                      ● Working       │
├───────────────────────────────────────────────────────┬───────────┤
│ User: 檢查...                                         │           │
│                                                      │   ─ ●     │  ← 可視輪次 1
│ Pi: 找到兩處差異...                                  │   ─       │
│ ▸ 12 operations · 1 failed                           │   ─ ●     │  ← 可視輪次 2；工具失敗不改 Pin 色
│                                                      │   ─       │
│ 下一輪提問...                                         │   ─ ·     │  ← 不在視野內
│                                                      │           │
├───────────────────────────────────────────────────────┴───────────┤
│ Composer                                                         │
├───────────────────────────────────────────────────────────────────┤
│ 原有 Herdr Status Bar                                [SVG mode]  │
└───────────────────────────────────────────────────────────────────┘
```

- 右邊是**Chat Pane 內容區內**的極窄 rail／gutter（設計候選 20–28 logical px；不是永久打開的 200px 右側面板）。不移動 Herdr 主 Sidebar，也不遮住 Scrollbar、Composer、失敗提示或內文文字；必要時從正文容器扣出固定小寬度，**不能改變原生 Pane tree**。
- Rail 導航單位是**問答 turn**（由一則使用者意圖和 Pi 後續事件形成），不是每個 token、tool 或 assistant chunk。更新中的 turn 只佔**一個** marker，內容持續更新。
- **只表示同一個已驗證 Pi runtime／Session／當前 branch**。切焦點或切 Session 應更新整條 rail，不能顯示前一個 Pi 的題目；跨分支不能用 index 亂對應。
- **開關策略**：一輪或很短對話先不顯示；達到約 3 個可導航 turns 或內容超過約 2 個 viewport 時才顯示（待 P1 實測）。寬 Pane 顯示穩定的低對比軌道；滑鼠接近／鍵盤 focus 時增亮與放大 hit target，**不增加整條 rails 的寬度造成版面跳動**。
- **狹窄 Pane**：小於約 520 logical px 時先隱藏常駐 rail，可透過一次性「對話目錄」入口開啟緊湊 turn list／popover；小於約 360 時只保留無障礙鍵盤導航與回底。不能因 rail 把文字／Composer 壓到不可閱讀。

### 4.2 節點、密度與優先保留

**每節點**是一個小短橫／點，依狀態傳達有限語義：

- 普通 turn：neutral marker；**當 viewport 同時顯示多個 turn，就同時 Highlight 其所有 marker**；條件是量測的輪次區間與 `[scrollY, scrollY + viewportHeight)` 相交。非可視 Pin 中性；**工具 fail／pending／running 絕不修改 Pin 顏色**。Streaming 不新增 tool marker。
- **不**為每個工具做一個節點；如要定位 tool failure，先跳至對應 turn，再可選聚焦其 Tool Activity summary。
- **長會話**有界採樣或群集：例如最多 16–24 個可點 marker（P1 候選），保留**首輪、末輪與所有可視輪次**，剩餘按時間／turn 位置抽樣並形成 `+N` clustered node；不把可視輪次悄悄抽樣丟掉；**工具失敗不是 Pin 的顏色或優先級**。Rail 不自行建立另一份 scroll／resize observer；只讀 conversation viewport owner 提供的 measured turn ranges、scrollY 與 viewportHeight。
- 有 cluster 時，hover 預覽先顯示「第 17–30 輪／14 段」之類，不偽裝成單一問題；Click 開啟有界的子選單／zoom-in rail，**不能跳到任意抽樣輪就稱為精確跳轉**。
- marker key 必須是 `(hostKey, runtimeId, sessionId, branchEpoch, turnId)`，而不是 DOM row index 或目前第 N 個項目。新事件插入、Compaction、pagination、remount 後也不可跳到錯 turn。**Rail markers、hover preview 必須 clamp 在 viewport，外框使用 Herdr Pane 圓角與 overflow clipping。**

### 4.3 Hover Preview：一個短提示，而不是資訊卡

**定稿傾向：預設只顯示這一輪的使用者問題。** 內容足以辨認輪次即可，不需要把 Pi 的回答或執行摘要再顯示一次。只有仍需處理的高優先異常，才附加一個極短的狀態提示。這是參考 `pi-harness` 的簡化設計後，對先前四行資訊卡方案的**明確取代**。

```text
         ┌────────────────────────┐
         │ 檢查 Hamiltonian 符號…  │
         └────────────────────────┘   ← 正常輪次：只一行
                                  ─ ●

         ┌────────────────────────┐
         │ 修正測試失敗…          │
         │ ! 需要處理             │
         └────────────────────────┘   ← 真正未解決的異常才兩行
                                  ─ !
```

- **第一順位（必需）**：來源 user/custom prompt 的首個有意義短句；不呼叫 LLM 摘要器，不讀 Session JSONL，來源不足時顯示本地化的「第 N 輪」或「內容未載入」。標題不是模型生成的解釋，不能把空白／工具 stdout 假裝成問題。
- **第二順位（只有例外才出現）**：`需要處理`／`尚未解決`／`跳轉不可用` 等**真實可驗證的高優先狀態**，最多一個，附簡單警示符號。正在工作、已完成等一般狀態由 marker／對話本體表達，hover 不再重複。
- **明確不顯示**：Pi 回答摘要、Thinking、檔名清單、工具執行次數與 badge、token／模型／成本、時間戳、輪次序號、Markdown headings 或其他 metadata。這些仍可在點擊後的對話本體找到；可讀性比「資料齊全」重要。
- **尺寸／截斷候選**：預設單行；確有需要最多兩行（問題一行＋異常一行），寬度約 **180–220 logical px**，問題約 **30–45 個可視字元**的視覺裁切，需支援 CJK／英文長字與無文字附件的 fallback。數字不是最終 GPUI 契約，以實機文字測量與 Accessibility 為準。
- **呈現**：小而低干擾、使用 Herdr theme 的文字＋淡背景；**不要大型帶標題的卡片、資訊表格、巢狀按鈕或持續動畫**。Hover 只是辨認，Click 才是導航；鍵盤 focus 要能取得同樣的最小資訊。
- Hover latency：設計目標是指標穩定停留約 **150–250ms** 後出現，避免滑過一串 markers 彈滿畫面；移開後及時關閉即可，**預覽不帶可點擊內容，不需要額外設計「滑進大卡片」的停留區**。**Herdr Mod runtime 明確沒有 `setTimeout`**；必須先驗證 GPUI/native delay／task 機制，不能用 JS timer 假造。若沒有可靠延遲能力，**優先即時、穩定地顯示單一預覽**（或者只在鍵盤 focus 出現），而不是阻塞或引入不安全 helper。鍵盤 focus marker 必須可取得**同等內容**的 preview。不要增加全域 hover tooltip。
- 以 **GPUI 原生單一輕量提示層**呈現（overlay 或相鄰浮層，**具體定位 API 待目標 Herdr 版本驗證**）；位於 rail **內側的聊天畫面**，避開 Composer、Status Bar、Window 邊界，不遮擋觸發 marker。只有一個預覽，切換節點時替換內容而不堆疊。
- Hover **絕對不滾動**、不改 active turn、不把 UI 變成另一個 Session；focus preview 時維持可見，離開／Esc／Pane 切換時關閉。預覽**不承擔額外操作**，不需要把鼠標移入預覽去展開／點擊其他控件；視覺預覽可禁用或降為語義標籤，以支援 reduced motion／觸控與 accessibility。
- 若 runtime/branch 身分錯誤、資料過期或超出目前 memory window：顯示「內容未載入／不可用」，不顯示上一個 Session 的片段；不能把出錯的訊息、原始 JSON／路徑當富 HTML 或命令執行。

### 4.4 Click-to-jump：跳到穩定錨點，不打斷流式

1. 點擊一個 marker 時，捕捉 `TurnKey + bindingEpoch + targetRevision`；在 **UI 的 conversation scroll container** 裡定位，不改 active Pi Session、branch、terminal state，也不向 Pi 發 prompt。
2. 如果該 turn 已掛載，優先使**使用者訊息／turn 開頭**對齊容器上緣少量內縮（如 12 px），不要以點擊 `last` 就一律跳到底的 HW1 Demo 規則代替精確定位。
3. 若 turn 不在可見 window：先由同一 Pi runtime memory snapshot API 請求有界相關 turn；若無資料，顯示無法定位並保持原捲動位置，**不得靠讀檔案硬查**。
4. Jump 期間暫停 `followTail`，記住 return anchor；highlight 目標 turn 一次輕微的狀態提示（Reduced Motion 禁動畫），**不自動展開群組或單項工具**。需要查看失敗，使用者在 turn 內再點活動摘要。
5. **正常讀取／streaming**：目前可見的 turn 高亮依 viewport 更新；只有使用者已在底部時才跟隨新訊息。使用者在上面閱讀、hover rail、展開卡片時，新的 Pi 內容不能把他拉到底。
6. 點擊時在同一刻 Session 被切換或 Pane 失焦：取消舊跳轉結果、關閉 preview；絕不能把舊 Session 的定位指令套到新 Pane。
7. **鍵盤**：rail 用一個可到達的導航群組，箭頭在 markers 間移動、Enter/Space jump、Esc 關 preview／返回對話；Focus 不得困住 Composer。**可及性標籤可以比視覺 hover 多一點必要定位語義**，例如 `第 7 輪，檢查 Hamiltonian，按 Enter 跳轉`，真正需要處理時才附 `需要處理`。

### 4.5 Rail 和 Tool Activity 的聯動

- **工具失敗本身不改變 Pin 顏色，不會觸發 `需要處理`。** Hover 只有明確的 `requiresUserAction` 才附第二行；原始工具計數、失敗原因都留在對話 Tool Activity 內。Click 回到該 turn，精確錯誤計數與原因由 Tool Activity summary/detail 承擔，且仍保持**collapsed**。
- 使用者展開某輪工具細節改變行高時，**scroll anchor／可見多個 marker 同步更新而不跳錯**；群組折疊時同理。
- 收到 live tool event：更新的是既有 turn 的 marker 狀態與 preview cache，不重建整條 rail（也不使 hover 消失），不以每 token 觸發布局運算。
- 過程與結論分離：Rail **不顯示回答摘要或 assistant headings**。辨認此輪靠 user/custom prompt，內容與結果靠 click-to-jump 後的主對話；不得拿中間工具 stdout 冒充預覽文字。

## 5. Native GPUI 架構建議（不是現成 API 清單）

```text
Pi Extension (P2) / Synthetic Fixtures (P1)
          │
          ▼
Normalized Turn & Tool Event Store
          │
          ├── TurnActivityProjector ─→ ActivitySummary (1 line)
          │                           └→ CompactToolRows (on demand)
          │                                └→ ToolDetailRenderer (on demand)
          │
          ├── RailIndex ────────────→ RailMarkers / clustered items
          │                           └→ HoverPreviewModel
          │
          └── ConversationViewport ─→ Stable TurnKey / anchor / followTail
                                     └→ jumpToTurn(turnKey)
```

### 資料與狀態（提案）

```ts
// P1 proposal only — not fields currently guaranteed by Herdr or Pi
type TurnKey = string; // namespaced by host + Pi runtime/session/branch epoch
interface TurnProjection {
  key: TurnKey;
  userTextPreview: string;           // bounded, from observed source text
  status: "working"|"done"|"failed"|"needs-input"|"unknown"; // only unresolved actionable exceptions may reach hover
  activityGroupIds: string[];
  firstEventSequence: number;
}
interface ToolActivityGroup {
  key: string;                       // stable (turn key + semantic group id)
  callIds: string[];                 // original source tool calls, no lossy de-dup
  counters: { read?: number; search?: number; run?: number; edit?: number; failed?: number; pending?: number };
  runningToolId?: string;
  disclosure: "auto"|"user-open"|"user-closed";
}
interface RailViewState {
  visibleTurnKeys: TurnKey[];        // all turns intersecting the viewport
  scrollY: number;                  // canonical conversation scroll position
  viewportHeight: number;
  keyboardFocusedTurnKey?: TurnKey;  // focus distinct from scroll position
  hoveredTurnKey?: TurnKey;
  hoverKind?: "marker"|"cluster";
  previewOpen: boolean;
  lastReadingAnchor?: { turnKey: TurnKey; offset: number };
}
```

- **Index 與 Renderer 分離**：`RailIndex` 由 event store 的 TurnKey／status／short preview 建立，不能每次 hover 都去量測所有 history rows。**Conversation viewport／turn geometry owner 提供 `visibleTurnKeys` 的整個集合，而非單一 active，Rail 不建立第二套 scroll observer。** 長會話只對可見節點做有限工作。可參考 `pi-harness` 的 `history-rail.ts`：paged outline 提供**身分／順序／短預覽**，measured transcript 才能提供**已掛載的像素位置**；未掛載的 turn 絕不能假設自己有幾何。
- **分層 state**：Pi event store 是 canonical content；ToolGroup 與 RailIndex 是**derived projection**；hover/focus/disclosure/scrollAnchor 是 per-pane **local UI state**。都不是第二個 transcript authority。
- **先確認真 API**：[官方 Herdr `AGENTS.md`](https://github.com/herdrdev/herdr-app/blob/master/defaults/AGENTS.md) 記載 `.on_hover((hovered,cx)=>...)`、`openOverlay(...)`，但**native anchored preview、延遲 hover、虛擬 list 與 scroll-to-key 需要實驗**。同份文件明確禁止 `setTimeout`、DOM 和 CSS；沒有證據時不能把 `scrollIntoView`／`:hover` 或 JS 計時器當 GPUI 命令。
- **策略降級**：不能實作安全定位 overlay 就先用 marker focused 狀態＋靠近 rail 的簡潔固定預覽容器；無法可靠 `jumpToTurn` 之前不能宣稱 rail 可用。窄 pane 不顯示 rail，但可有獨立的 turn list 選單；此選單也需共用同樣 TurnKey。

## 6. P1/P2 階段及效能預算

| 階段 | 該完成的事 | 明確不做 |
| --- | --- | --- |
| **P1.1** | Fixtures 測工具 group／item/detail、error/pending、hover preview 的預覽資料模型 | Session JSONL reader、搜尋輸入框 |
| **P1.2** | 原生 GPUI compact Tool Activity；**另做 Rail 導航 spike**（markers + viewport highlight + click-to-jump），先測是否比無 rail 好用 | HTML/CSS 移植、自動改 Terminal |
| **P1.3** | 若 Rail spike 有實測價值，再做 hover/focus 小摘要、cluster 選單與窄 pane fallback；若無價值，僅保留回底／輪次跳轉的替代入口 | 大面板、所有工具專用卡 |
| **P2** | 用活著的 Pi Extension events 增量更新 Turn／Tool／Rail；驗證分支／重連後不串內容 | 另一個 Pi RPC、JSONL watcher |
| **P4** | 1000 tools／長會話的 render budget、難型工具與大型 diff／科學內容精修 | 高頻全量重排、動畫換可靠性 |

**候選量測目標**（需實機 benchmark，非聲稱已達）：已掛載 turn marker click 後下一次 layout pass 能定位；hover preview 150–250ms 顯示、pointer move 不閃爍；同一 live turn 每多一個 token **不增加 rail 節點數**；1000 calls 收合時大致只佔單一 group summary；rail 的 projection 更新與 viewport index 工作不隨「全部歷史 × 每 token」增加。

## 7. 可執行驗收場景

| ID | 場景 | 通過條件 |
| --- | --- | --- |
| **TA-01** | 一輪連續讀 20 次，最後有答案 | 預設僅一條活動摘要，答案先可讀；展開後無 20 個 bordered boxes |
| **TA-02** | 工具執行中、新 tool events 連續流入 | 摘要更新目前操作，工具本體不自動展開；同一 event 不重複計數 |
| **TA-03** | 1 失敗＋1 未確認，後面還有成功工具 | 摺疊的摘要仍有 failed/pending，不能蓋成 Success；錯誤詳情可定位 |
| **TA-04** | 手動開 group + 某 item，再切 Terminal/UI／繼續 stream | 回來保留兩層展開與原閱讀 anchor；不重複 append |
| **TA-05** | Bash stdout 很長／Edit diff 不完整／未知工具 | 有界預覽、完整來源資訊、可複製 fallback；不偽造 diff 或 exit code |
| **RL-01** | 1、3、30、1000 turns | 短會話不擠畫面；長會話 cluster 可追溯；首／尾／當前／異常不消失 |
| **RL-02** | Hover／鍵盤 focus 第 7 輪 | **正常只顯示一行簡短使用者問題**；未解決需處理時最多再一行警示；**不顯示 Pi 摘要、工具統計、時間或 heading**；hover 不 jump |
| **RL-03** | Click 第 7 輪 | 同一 Session 的精確 TurnKey 對齊；不偷改 Pi branch 或 UI tool 折疊 |
| **RL-04** | 閱讀第 7 輪時收到 100 個 tool event | 不強制跟隨最新、**所有可視 markers 同時高亮**／預覽穩定，沒有每事件全量重算 |
| **RL-05** | Hover 第 A Pane marker，然後切換到 Pane B / Pi 重啟 | A 的 preview／定位結果立即失效，不在 B 顯示 A 的內容 |
| **RL-06** | 長文展開、上方補內容、窄 360px、Reduced Motion | 不遮擋 Composer／Status Bar，不丟 viewport anchor；窄 pane 使用替代導航 |
| **RL-07** | 16+ marker cluster／含 failed turn | Cluster 展開能精確選中被合併的輪；可視輪次不被採樣吞掉，工具失敗不影響 Pin 色 |
| **RL-08** | 無滑鼠、鍵盤導航、螢幕閱讀器 | preview 可經 focus 取得，同樣內容有 accessible name；不是 hover-only 功能 |
| **RL-09** | 一般輪次／未解決異常的 Hover 簡潔度 | **正常單行短 prompt**；異常最多加一行 `需要處理`；沒有回答摘要、tool badges、時間、模型、token、heading outline 或大卡片 |
| **RL-10** | 視窗同時包含 3 個 user turns | **3 個 Pin 同時高亮**；滑鼠捲動即時更新，Click 保留連續 transcript 的 earlier turns |
| **RL-11** | Hover 頂部／底部 Pin、折疊展開、Resize | Hover 與所有 Pin 不超出 viewport；量測高度更新後閱讀位置穩定，Stack 子視圖的外框對齊 Herdr Theme |
| **RL-12** | 可視多輪與不可視輪次交替 | 所有可視輪次皆為 **8px 圓點**，不可視為 **4px 圓點**；點中心對齊、點擊區不變；Pin 不使用工具狀態色，也沒有縱向高亮條 |

### 交付 Gate

目前 Demo 已透過 headless tests 驗證多 Pin + clamp + measured scroll，但仍須實機確認。只有通過 P1 Native GPUI 互動測試與目標 Herdr App 的實機 hover/click/resize/scrollback 截圖或短錄影，才能稱為完成。**在那之前所有尺寸、時間、API 與呈現均是方案，不是已完成實作。**

## 8. 來源追溯與避免照抄

- **HW1 功能**：`.../HW1/homework1/src/hw1_chat/static/app.js` (`buildRail`, `markActiveNode`, `sampleQuestions`)；`style.css`（`.msg-rail`, `.rail-node`）；`index.html`（`#msg-rail`）。參考「Turn Marker、active、jump」；**新增 hover 內容預覽，樣式不照抄**。
- **pi-harness 對照（來源和狀態）**：`/home/chlo/Projects/pi-harness/packages/ui/src/components/ChatMinimap.tsx` 目前仍有 320px 完整 preview、Assistant heading/paragraph 與 tool badge；`packages/ui/src/lib/history-rail.ts` 以 committed entry ID 連結 paged outline 與 measured transcript，未載入的 turn 有身分但**不虛構像素位置**；`docs/notes/minimap-simplification.md` 是**已接受、尚未完成實作**的精簡方向（只顯示 prompt 摘要、單一 active turn、移除 answer outline、共享 transcript owner 幾何），這是 Herdr 的主要 UX 參考，而非宣稱目前 pi-harness 已呈現該最終樣式。
- **四倉研究**：`.../Documents/playground/notes/agent-ui-ux-4repos.md` 的 PI-Desktop `TurnProcess`／ZCode typed tool renderer／pi-web `ChatMinimap` 與 `.../agent-ui-ux-4repos-deep.md` 第 3、4、5 節（分組、手動 disclosure、性能，以及修訂歸因）。
- **Herdr API 限制**：[01 evidence](01-evidence.md)、[03 architecture](03-architecture.md)：本專案 native GPUI，並非網頁，也未證實具備 DOM 或內建 tooltip/scroll-to-ID。
- **衝突處理**：針對先前 [09 P0 feedback](09-p0-feedback-round1.md)「工具都預設折疊」，優先採 group-first 折疊；針對「不要 Search」，**取消搜尋規劃優先級，使用 navigation rail 作已知輪次的**跳轉**，不是全文檢索的替身**。

**本文件為修改規格，不是要求現在改 Mod 或動正在工作的 Pi。**

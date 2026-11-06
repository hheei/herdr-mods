# 02 · UI／UX 規格

本文件是 **UI-first 設計規格，不是既有功能清單**。不開發 Session JSONL Reader／歷史索引；訊息來源為 Pi runtime extension 的有界記憶體 snapshot 與 live events。借鑑來源是 [R1／R2](01-evidence.md#r1) 與 [Moshi 的兩種呈現](01-evidence.md#m2)；尺寸、門檻與互動優先序是本專案的初始提案，須以 [驗收測試](05-delivery-and-tests.md) 修正。

**實作順序**：本文件定義目標 UX，不代表 P0 原型就必須全部完成。**P0 先做能切換、能閱讀、能測試的最小原型；P1 再依真機使用結果打磨排版、資訊層級、工具卡、Composer、回饋與無障礙。** 逐項精修工作與可觀察的 Done Gate 見 [07 · 原型後打磨](07-post-prototype-polish.md)。不中斷 Pi、只切 focused Pane、必須可返回 Terminal 是 P0 就不能延後的安全要求。

## 1. 使用情境與成功定義

| 情境 | 使用者要做的事 | 成功標準 |
| --- | --- | --- |
| 寫程式 | 在大量工具輸出中找答案、看 patch、繼續下指令 | 不必讀完日誌；失敗不能被摺疊藏掉；回 Terminal 不損失正在執行的工作 |
| 科研 | 閱讀長篇中文、公式、表格、來源與實驗結果 | 內容可複製、可搜尋、有證據來源；不為美化改變數學或程式語義 |
| 多機器 | 同時觀看本機與 SSH 主機上的 Pi | 每個 Pane 清楚知道 host／Session；斷線不冒充 Agent 已停止 |
| 多 Pane／多使用端 | 一個 Pane 用 UI，另一個用 Terminal，手機也可能在同一 Session | 模式屬於本畫面；資料一致；輸入有明確歸屬與衝突防護 |
| 長時間工作 | 在同一 Pi Session 中查看大量工具呼叫、離開後再回來 | 滾動、折疊、草稿留存；記憶體與重繪成本有上限 |

優先序：**資料正確 > 工作不中斷 > 輸入／焦點穩定 > 可讀性 > 動畫**。這不是監控儀表板優先的產品，對話必須佔主要空間。

## 2. UX-01：同一 Pane 的雙呈現

### 固定入口

**切換按鈕固定放在 Herdr 視窗最下方 Status Bar**，不放 Pane Header，也不插入額外 Pane。Status Bar 是視窗級 UI，因此按鈕永遠只操作**目前聚焦的 Pane**：按下時由宿主同步捕捉 active PaneId、Terminal instance、binding epoch，判斷是否為受支援的 Pi；非 Pi、沒有 active Pane 或綁定不明確時，按鈕停用並有可讀的狀態說明。

外觀預設是一個緊湊的 `Terminal | UI` 兩段式切換控制（或空間不足時單一可及的圖示切換鈕），顯示**當前聚焦 Pane 的模式**；聚焦其他 Pane 時，狀態立即更新，**不能自動切換其他 Pane 的模式**。切換入口在兩種呈現中始終位於 Status Bar，不能只在 hover 才出現，也不能因 UI Mod 本身崩潰而失去返回 Terminal 的能力。

這裡是**模式切換**，與既有 `project-open` 的單 icon launcher 無關；不復用「選工具」的右鍵邏輯，也不改動它。按鈕應**嵌入既有 Status Bar 的同一個 GPUI renderer／組合容器**，共用原有背景、頂部邊框、高度與 spacing，保留 Machine、Agent 數量、Commands、Project Open 的排列；**禁止再把 Status Bar 拆成相鄰 Block、額外 32px slot 或浮動 Overlay**，避免畫面像被挖空。需驗證狀態列組合擴充點；若沒有，應在可控的 Status Bar host／renderer 層整合，不能以覆蓋其他 Mod 解決。

```text
+-- Native Pane frame ---------------------------------------------+
| Pi  /project  host-name  Working                           ...  x |
+------------------------------------------------------------------+
| 同一個 body rectangle；此處只繪製一種呈現                         |
|                                                                  |
| Terminal：原 TerminalView，不另開程序                              |
| UI：相同 binding 的 AgentUiView                                   |
|                                                                  |
+-- Herdr Status Bar (原本的同一列、同一背景與邊框) ------------------+
| Machine · 2 agents       Commands   Project Open   [Terminal | UI]|
+------------------------------------------------------------------+
```

**模式狀態以 Pane／terminal instance 為範圍，不是全域偏好；Status Bar 控制才是視窗級。** 同一 Session 在兩台螢幕可選不同呈現。明確點選優先於記憶，無匹配歷史或不支援 Agent 時預設 Terminal；從未打開 UI 的 Pane 不預先解析全部對話。焦點從 Pane A 切到 Pane B，只更新按鈕的 active mode／enabled 狀態，不更改 A 或 B 的 mode；避免 `focused()` 在 async 期間指向另一個 Pane，切換請求必須帶按下當下捕捉的 identity 和 epoch。

### 切換的交易

| 次序 | Terminal → UI | UI → Terminal |
| --- | --- | --- |
| 1 | 在 Status Bar 點擊當下固定 active pane／terminal／session binding epoch，不在 async 後重讀全域焦點 | 保存 UI 草稿、anchor、disclosure、search 狀態 |
| 2 | IME composition 尚未提交時延後切換，保持原焦點 | 同樣先處理 composition；不得自動送出文字 |
| 3 | 命中同身分 cache 就顯示；否則中性 loading，不顯示其他會話的舊資料 | 顯示原 TerminalView；不重新 attach／resume Agent |
| 4 | 釋放 Terminal 的鍵盤與 pointer routing，但保留其程序、buffer 和合法尺寸 | 將焦點交還此 Pane 的 Terminal；不把 UI 草稿貼進 TUI |
| 5 | 訂閱資料；後續結果須通過 epoch guard | UI View 可保留，停止不可見的重繪／降頻資料工作 |

原生 Terminal 選取、scrollback、Kitty 圖像和 TUI editor 草稿都應留存。切到 UI 不能把 terminal cols/rows 設成 0。視窗本身 resize 可以有正常 resize；單純模式切換不得觸發額外 resize storm。

### 失敗退路

UI 初始化失敗時立即可回 Terminal；**Status Bar 的切換控制由宿主／可靠的 Status Bar renderer 掌握**，不依賴失敗的 Agent UI Mod render。GUI 關閉或 helper 崩潰，不發任何 `kill`／`abort`／`park`。原生 Pane 的 Close 仍是「關閉工作」而不是「回終端」；在工作中點 Close 應沿用／明確呈現宿主的終止語義，不能偽裝成一般面板關閉。

## 3. UX-02：資訊分層

### 三層密度

| 層級 | 預設內容 | 進入方式 |
| --- | --- | --- |
| 閱讀層 | 使用者問題、助手主要回覆、活動摘要、不可忽略的錯誤／需輸入狀態 | UI 初始畫面 |
| 證據層 | 每個工具參數與結果、已提供的 thinking、diff、精確用量／時間、context 標記 | 點擊 disclosure 或「詳細」 |
| 診斷層 | entry ID、branch／parent、原始 JSON／檔案範圍、資料來源、capabilities、同步水位 | 明確的「診斷」面板，不混入正文 |

不要在每條訊息旁常駐十幾個數字。常用的 Copy、展開與來源必須有可鍵盤操作的入口；其餘集中在固定 `…`，不依賴 hover-only 圖示。主題沿用 `theme()`，不另開一個有不同背景／邊框的孤立區塊。

### 完成輪次

```text
使用者
  檢查這個推導與程式的符號是否一致……       [展開長問題] [⋯]

Pi
  已確認有兩處不一致：……

  ▸ 過程：讀取 8 個檔案 · 搜尋 4 次 · 執行 3 個命令
  ! 其中 1 項測試失敗，未驗證的部分：……       [查看失敗]
  43 s · 模型名稱                            [詳細] [複製答案]
```

結果優先不代表重排或刪除原始事件。顯示用的 `TurnProjection` 可以把中間活動放入過程群組，但保留每項 evidence 的原始 entry／call 對應；若無法確定哪段是最終答案，就保留順序，不能自行宣稱「結論」。

## 4. UX-03：工具與 thinking 的折疊規則

以 [R2 的後續修正](01-evidence.md#r2) 為基礎，採每個物件的三態策略：`auto | user-open | user-closed`。使用者手動選擇持久化在本機 view state，優先於 global default，不能因 message_end、分組、重連或 remount 重設。

| 狀態 | auto 預設 | 使用者手動後 |
| --- | --- | --- |
| 正在工作 | 一行當前活動＋必要的最新工具摘要；不是所有日誌全開 | 維持手動選擇 |
| 已完成且有可讀答案 | 過程摺疊，答案可見 | 維持手動選擇 |
| 結束但無答案、錯誤、截斷、未確認終態 | 展開相關失敗／最後活動，顯示說明 | 可收起正文，但錯誤摘要不能消失 |
| thinking 進行中 | 小型「思考中」摘要，正文預設關閉 | 明確展開後顯示 provider／Pi 實際提供的內容 |
| 搜尋命中收起內容 | 暫時 reveal 命中項並標記來源 | 搜尋離開後恢復原 disclosure，不改永久偏好 |

只顯示已提供的 thinking，不聲稱能還原未暴露的內部推理。部分內容沒有紀錄或已被隱藏時，說明不可用，不補寫。

### 工具活動分組

按同一 turn 中的相鄰活動與類型產生摘要，如「讀取 8 個檔案，修改 2 個檔案，執行 3 個命令」。成功工具可分組；失敗、等待使用者、未知結果必須有獨立可見標記。並行工具不能靠 completion order 冒充執行順序，使用 `toolCallId`／parent 關係呈現。

群組是索引，不能丟掉原始呼叫。預設展開群組顯示前 20 項，其餘用「再顯示 20 項」或列表虛擬化；不是一次掛載 1000 張卡。工具卡不隨 chunk 自動伸縮至數千像素。

### Renderer registry

| 類型 | 一行摘要 | 展開後 |
| --- | --- | --- |
| read／search | 檔名、pattern、已知命中數 | 位置＋內容預覽；保留原始結果入口 |
| bash／exec | 指令摘要、cwd、真實狀態 | 文字輸出；有來源證據才分 stdout/stderr／顯示 exit code |
| edit／write | 檔名＋已知修改資訊 | 有 old/new 證據才建 diff；不能靠現在磁碟狀態重造歷史 patch |
| image／artifact | 名稱與類型 | 安全縮圖／可複製路徑；大檔按需讀取 |
| unknown/custom | 工具名與有界摘要 | schema 容錯、純文字或 Raw JSON 詳情；新格式不白屏 |

顯示 `Read 8 files` 的計數必須有明確規則，例如 unique canonical file paths；無法判定時說「8 次讀取」，不能把呼叫數等同檔案數。成功／失敗至少以文字或形狀再標一次，不靠綠紅顏色。

## 5. UX-04：滾動、搜尋與長會話

### 滾動狀態機

`following`：使用者在末端，新增內容在 native layout 完成後跟隨。  
`reading`：使用者向上捲動、搜尋跳轉或選取歷史後，任何新 chunk 都不搶回底部。  
`restoring`：切換呈現、補載 older、變更字型或 disclosure 時，以 stable anchor 恢復。

Anchor 不是單一 scroll offset，而是 `{rowRenderKey, intraRowOffset, followTail, queryGeneration}`；row 被折疊／branch 改變時，找同 turn 或最近仍存在的前驅，再明示目前不是原來的分支。每次 viewport／內容尺寸改變只做有界校正，避免反覆拉扯。

離開末端顯示固定位置的「有新內容 ↓」，點擊才回末端。選取文字時暫停自動跟隨；新圖片解碼不得讓正在閱讀的上一行移走。頂部補歷史先保存 anchor，插入後恢復，而不是靠固定加 scrollTop 猜測高度。

### 搜尋

搜尋 **本地 Pi event store 與已取得的記憶體 snapshot**，不只搜尋目前掛載的 GUI rows。第一版限目前 Pi Session／當前分支，可選「對話／工具結果／thinking」；當資料不在目前 window 時，可透過 Pi runtime API 要求有界的較早內容，沒有可用 API 就明示搜尋範圍限制。**不**另外建立跨 Session 磁碟搜尋或 host index。

第一版用搜尋與 turn list；小地圖是後續增強，不因未做小地圖而犧牲基本捲動穩定。科學長篇內容要求 CJK、Unicode、跨 code block 的字詞定位測試。

### 有界呈現預算（設計值）

- 初始 window：從 Pi Extension 取得最近 50 個 turn／最多 200 個投影 row 的記憶體 snapshot；older 只能從同一 Pi runtime 取得，按 byte budget 限縮。
- 工具正文先顯示 8 KiB；詳細文字每頁 32 KiB。超限顯示可操作的截斷提示，不靜默丟棄資料。
- rich diff 初始上限 1000 行或 160 KiB，超出改 summary＋純文字分頁；lockfile 預設不用富 diff。
- 高亮上限 800 行／100,000 字元，單行超過 2000 字元退純文字；這些是初始產品預算，非來源 benchmark 的保證。
- 未驗證 variable-height list adapter 前用 bounded pagination；不得命名為「已虛擬化」。

## 6. UX-05：串流與狀態，不製造假進度

已完成的對話投影與 live tail 分開更新（兩者**都**來自 Pi memory snapshot／events，而不是磁碟歷史 Reader）。收到增量先合併到資料模型，再節流繪製；Copy／Search 讀取最新已收到的完整資料，不讀視覺動畫中間幀。第一版不逐字人造打字；減少 redraw，比增加華麗流光重要。

Pi 的低層 `agent_end` 不一定代表不再續跑，可能有 retry／compaction／queued follow-up；完成判斷要採 adapter 的 settled 語義。[P2](01-evidence.md#p2)、[P5](01-evidence.md#p5)

| 軸 | 例子 | 不得混淆成 |
| --- | --- | --- |
| Agent 執行 | working / waiting-input / settled / interrupted / unknown | 資料 transport live |
| 觀察連線 | unavailable / connecting / live / stale / offline / error | Agent 成功或停止 |
| 會話身分 | bound / ambiguous / replaced / historical | 「cwd 相同所以是同一個」 |
| 呈現 | terminal / loading-ui / ui / ui-error | Pi 的生命週期 |

離線時顯示「連線中斷，以下為上次同步內容」，保留可讀 cache。不要永久 spinner，也不把未收尾工具自動標綠。重試可指數退避，操作按鈕能看到最後成功同步時間；時間以等寬數字或預留欄位避免抖動。

## 7. UX-06：Composer 與 Terminal 各自保有草稿

### 兩個不同能力級別

**未連上 Pi Extension**：只能顯示 Herdr 已知的 host／Agent 元資訊與明確的「尚未啟用 Pi GUI 整合」狀態，可保留 UI 草稿及返回 Terminal；**不**從 JSONL 補建對話，也不自動用 `hc send` 假裝 Send 可用。

**Live + control**：由同一 Pi Extension 取得 runtime snapshot/events；身分驗證及 capability 通過後才啟用 Send。Pi 正在工作時，預設「完成後送出」，另有明確的「引導目前工作」選項；後者按 Pi `steer` 語義，不描述成即時中斷工具。[P2](01-evidence.md#p2)

| 操作 | 語義 |
| --- | --- |
| 閒置時送出 | 向同一 Pi runtime 送出一則 user message |
| 工作中「完成後送出」 | `followUp`；回執說明排隊，不說已執行 |
| 工作中「引導目前工作」 | `steer`；目前工具完成後的介入點，不等同 Stop |
| Stop | 獨立、有可讀 label 的破壞性動作；等待 runtime 確認，不與 Send 使用同一 click target |
| 連線中斷後送出 | 預設阻止並保留草稿，不偷偷離線排隊自動送達 |
| Session 已換／TUI 回 shell | 立即凍結送出，要求重新綁定；不能把 prompt 當 shell 命令 |

### 草稿規則

草稿 key 包含 host、runtime incarnation、session ID、branch selection 與 client ID。保留版本號，送出時捕捉 draft revision；成功後只有 revision 未改變才清空，避免清掉使用者剛開始寫的新一句。

TUI editor 與 UI composer 是兩份草稿，**切模式不互相複製或清空**。可提供明確「移到 Terminal 編輯器」動作，但只能透過 bridge 驗證 idle、目前 editor 內容與 expected revision，確認後執行。原生 terminal 仍有非空草稿時 UI 提示，不默默覆蓋。

中文／日文輸入法組字期間，Enter 不觸發 Send；模式切換、搜尋與 dialog 都不能強制提交組字。預設 plain text editor，Shift+Enter 換行；快捷鍵可設定，不能覆蓋 Terminal 的 Ctrl+C。

### 回執與本地回聲

先顯示本地 pending bubble，狀態依序為「準備送出／runtime 已接收或排隊／已觀察到對話紀錄」。無明確回執時顯示「送達結果不確定」，保留 request ID 供診斷，不自動重送。重複文字不能作唯一去重條件，具體契約見 [04](04-pi-contracts.md)。

## 8. UX-07：只在有能力時呈現控制

Pi 及其 extensions 未必提供統一的 plan／permission／question event。第一版不能因為 Moshi 或其他 Agent 有這些卡片，就假裝 Pi 有可回覆的相同協定。

已註冊、具有 request ID／choice schema／expected generation 的互動 Adapter 才能顯示可操作卡片。其他情況顯示「需要在 Terminal 完成的互動」＋回 Terminal；不能解析終端文字後自動送 `y`、Enter 或 Esc。支援按鍵不等同支援授權語義。

模型／thinking-level／compact／branch 切換等控制放次級設定；沒有受支援的同-runtime API 就停用或回 Terminal。歷史 branch browser 的「查看」必須和「讓 Pi 切到此分支」分成不同動作；不自動重寫工作區檔案。

## 9. UX-08：科研與程式碼內容

Markdown 採 native text renderer；程式碼採可選取、可複製的等寬原生 code view。完整支援不能僅以 JSON 成功解析來宣告。[H1](01-evidence.md#h1)

| 內容 | 必須的基線 | 未通過原型前的降級 |
| --- | --- | --- |
| 中文長文 | CJK 換行、合適行高、選取／複製不破 surrogate/grapheme | 純文字但保留段落，不裁成不可讀碎片 |
| 公式 | 保留 LaTeX 原文、inline/display 區分與複製來源 | 明確的可複製公式 source block；不得假稱已有 KaTeX |
| 表格 | 清楚 header、對齊數字、可複製原始資料 | 有界橫向捲動，不擠壓整個 Pane |
| 程式碼 | 語言標示、行號可選、Copy、只讀預覽 | 超預算停高亮，保留全文讀取入口 |
| diff | 以內容證據呈現行變更，A/M/D＋文字 | 純文字 patch／外部編輯器；不偽造 historical old content |
| 來源連結 | 顯示可辨識 domain／引用文字；只允許可處理 scheme | 開啟外部 app／遠端內容之前要求明確 click |
| 圖片／結果 | 保留比例、受限縮圖、來源與大小 | 載入失敗時顯示 metadata 與重試；不讓版面塌陷 |

公式 renderer 可後續採可信的離線解析→安全 SVG／image pipeline，但它屬新增元件，需資源上限、去腳本與選取來源驗證。不能直接把輸入的 HTML／JSX／SVG 當可信程式執行。

## 10. UX-09：原生視覺與無障礙

**以下字級、間距與狀態細節列為 P1 的原型後校準工作**，不是 P0 首張原型的硬性美術定稿；最初設計值會根據真實 Herdr theme、字體、Pane 寬度和測試觀察調整。實作分工與相同場景修改前後對照見 [07](07-post-prototype-polish.md)。

尺寸都是 logical px 的提案：Status Bar 沿用宿主原有高度，切換控制不可增加整列高度或產生獨立背景；Pane Header 不額外加入切換鈕；內文 14–15、code 12.5–13.5、caption 11.5–12；spacing 4/8/12/16/24。內容寬度上限約 900，超寬 Pane 留白；在小於 520 的 Pane 關閉右側 inspector，改內聯詳細頁；小於 360 時合併 header metadata，不把 composer 擠出畫面。

整個 body 共用一個背景與邊界，不把 UI 卡片塞進與原生內容分離的切割區塊。模式選擇的可見 active state 與鍵盤 focus ring 不能因追求極簡而移除。遵循使用者不需要 hover 冒泡提示的偏好，但不能刪掉 accessible name；需要說明時用 click／focus 可達的說明，不靠 hover。

鍵盤順序：原生 Pane 內容（對話／搜尋 → 展開項 → Composer → Send／更多）及**可從鍵盤到達的 Status Bar 模式切換控制**；焦點移入 Status Bar 不得誤發 Pi TUI 按鍵。非活動呈現不接收 pointer／keyboard／a11y focus。Reduced motion 下關閉裝飾動畫，僅保留狀態文字；spinner 若使用，採 Herdr native animation，不用 JS timer 持續通知整窗重繪。[H1](01-evidence.md#h1)

搜尋 Cmd/Ctrl+F 只在 UI focus 時由本 Mod 處理；Terminal 模式仍由宿主處理。Esc 先關閉彈出／搜尋，不作 abort。模式切換命令由 command palette 可用，預設快捷鍵須與目標 App bindings 檢查後再決定，不強加一組可能衝突的快捷鍵。

## 11. UX-10：例外畫面與文案

| 事件 | 畫面與可用操作 |
| --- | --- |
| 新 Pi 尚未開始對話 | Pi memory snapshot 為空時呈現空態；不以磁碟檔案是否存在判斷失敗 |
| 同 cwd 有多個 Pi runtime | 以已驗證的 host／Terminal／process binding 精確連接；不靠 mtime 或標題猜測 |
| 未載入 Pi extension | 「尚未啟用 Pi GUI 整合」；Terminal 可用，安裝後待 idle 經同意才可 reload |
| bridge 版本不符 | 顯示缺少哪些能力與返回 Terminal；不嘗試自行讀檔或重啟 Agent |
| Session 被 `/new` 或 `/resume` 換掉 | 主動換 binding epoch；舊草稿封存並提示，不自動搬到新 Session |
| 仍在閱讀舊分支，但 Pi 已換分支 | 「正在查看歷史分支」；送出停用或要求回 live 分支 |
| 未知 entry／custom tool | 只對該 row 降級，其他訊息正常；提供原始詳情 |
| Pi event 暫時缺少欄位／只收到部分 message | 保留最後已驗證資料並顯示 pending；重同步 current runtime snapshot，而不是讀磁碟補完 |
| 工具尚未有 end event 時 bridge 斷開 | 「結果未確認」；不補成功，不刪掉正在閱讀的 partial output |
| helper／UI 崩潰 | 原 Terminal 可立即回去；不得因清理 UI 而終止 Pi |

## 12. UX 不採用的做法

不常駐高密度 token/cost 儀表盤、不自動展開所有 thinking、不讓 hover 成為唯一入口、不以動畫掩飾 stale data、不自動批准、不用 newest-session 猜身分、不建立 JSONL Reader／index、不在閱讀時強制回底、不為「統一輸入」覆寫 Terminal 草稿、不以 UI mode 切換觸發任何 runtime 指令。

完整測試對應見 [05 的 UX 與安全驗收矩陣](05-delivery-and-tests.md)。

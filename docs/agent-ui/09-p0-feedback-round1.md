# 09 · P0 實際試用回饋：精簡介面與正確 Markdown（待實作）

**2026-11-06 · 第一輪使用者回饋 · 歷史問題與驗收標準。**  
**實作更新：** 目前唯一的 `agent-ui` Demo 已加入單 SVG、移除場景／搜尋列、群組折疊工具並接入 `TextView.markdown` API；這不等於完成實機 GPUI 渲染、真正逐 Pane 切換或最終 Rail 的精確定位。詳見 [11](11-agent-ui-demo-implementation.md)。
本文件只列**查核結果、變更要求與驗收標準**；目前**沒有修改 Mod、Layout、測試程式或安裝器**。這不是已完成修正的清單。

## 0. 範圍與優先順序

使用者的整體反饋是「風格可以保留，但不希望像測試控制台或工具儀表板」。因此維持現有暗色原生主題、排版留白與對話為主體的方向，優先**移除多餘 UI**，而非重做整個視覺。

| ID | 觀察／需求 | P1 決策 | 優先級 |
| --- | --- | --- | --- |
| UX-F01 | 頂部 `Working / Completed / Needs attention` 不知道用途 | **移出一般畫面**：只屬於 fixtures／開發測試入口 | P1 高 |
| UX-F02 | Status Bar `Terminal | UI · demo` 太雜 | **單一 SVG Icon**，外觀及尺寸比照 `project-open`；不使用 segmented control | P1 高 |
| UX-F03 | `Search this preview…` 多餘 | **取消預設常駐搜尋框**；真實長會話如有需要再設置按需功能 | P1 中 |
| UX-F04 | 每個工具都是 box，畫面太重 | **整個工具群組預設折疊成一條精簡摘要**；展開後是簡潔文字列，單工具詳情再按需開啟 | P1 最高 |
| UX-F05 | Markdown 像沒有解析 | **使用 Herdr 原生 Markdown renderer**；驗證內容與選取／複製；不能再把裸 Markdown 當純字串顯示 | P1 高 |

以上五項是**同一輪使用者回饋（四點，其中第 4 點另含 Markdown）**，不是憑空新增的產品功能。

## 1. 查核：為何目前會這樣

### F01 · 三個狀態大按鈕只用來切換 fixture

- `mods/agent-ui/fixtures.js` 內的 `CASES` 是 Working、Completed、Needs attention 三組**模擬對話**。
- `mods/agent-ui/main.js` 的 `select(id, cx)` 切換 `this.scene`，`render()` 中 `agent-ui-scenes` 把全部 `CASES` 畫成三個大按鈕。
- 它們是**開發者測試用情境選擇器**，不是 Agent 真的能在 Working／Completed／Needs attention 三種執行狀態之間由使用者切換。讓這三個按鈕出現在正式介面會形成錯誤心智模型。
- **規格**：移出一般 UI；保留 fixtures 作自動化與手動測試資料，由啟動參數／`props().scenario`、內部測試指令或**明確的開發模式**選擇。正式運行時只顯示 Pi 真實狀態的*低權重文字／狀態點*（如果取得），不提供手動改寫狀態的按鈕。

**驗收**：使用者打開正常 UI，第一屏沒有三個情境按鈕；測試仍能確定性地選擇三個情境而不依賴可見 UI。狀態不能被操作誤認成修改 Agent 執行。

### F02 · Status Bar 只留一個簡單 SVG

- 目前的 `mods/project-open/main.js` 有 `agent-ui-demo-toggle`，內含 `demo-terminal` 和 `demo-ui` 兩個文字按鈕與外框；與同檔的 `project-open-button`（**22×22 logical px 觸發區、15px SVG**）風格不一致。
- **最終視覺**：一個不帶文字的 SVG icon button；與 Project Open **同樣尺寸、垂直對齊、透明背景、無額外外框、無 hover tooltip／hover 色塊**，不增加 Status Bar 高度，也不額外切一個 Layout Block。不要將 `P0 · DEMO` 或 `Terminal / UI` 長字串塞在 Status Bar。
- **動作**：左擊切換 *Terminal ↔ UI*；可以依目前 mode 使用兩個視覺一致的 SVG variant（例如 Terminal glyph／conversation glyph），**同一時間只顯示一個 SVG**。不可讓圖示看起來像「啟動第二個 Agent」。若某狀態的 icon 語義不夠清楚，應先在實機原型比較，再定稿。
- **狀態**：支援 Pi 且有可靠 current-pane binding 時可點；非 Pi／不確定目標／沒有 Pane 時 disabled，不可偷偷操作最後一個 Pi。點擊當下鎖定 `PaneId + epoch`，焦點在 async 期間移動也不可切錯 Pane；這點仍以 [同 Pane API Gate](03-architecture.md#2-最難的缺口真正的同一原生-pane) 為前提。
- **可用性**：極簡**不等於沒有 accessible name／focus indicator**：鍵盤 focus 或螢幕閱讀器仍須能辨識 `Switch to UI`／`Switch to Terminal`；正常滑鼠 hover 不顯示提示。需要較長解釋時可在首次啟用說明或明確的設定頁處理，不在 status bar 常駐。
- **兼容**：不要改掉 Project Open 的既有右鍵與左擊行為；兩個 icon 是兩個獨立 hit target，無套娃點擊。Status Bar 仍保留 Machine、Agents、Commands、Project Open，所有內容共用**同一條背景／border**。

**驗收**：Status Bar 每一時刻只有一個切換 SVG（非兩段文字）；icon 尺寸和 Project Open 一致；Dark／Light、寬／窄窗口都沒有「挖空」或高低跳動；滑鼠、鍵盤切換不誤觸 Project Open；發生 UI 錯誤時仍能返回 Terminal。

### F03 · Search 不必常駐

- 現在 `mods/agent-ui/main.js` 在每個場景上方常駐 `Input.new(this.filter)`，並直接使用 `query` 過濾 mock rows。這是為了測試 fixture interaction，**不是正式需求已被驗證**。
- **規格**：在 P1 的**預設對話 UI** 移除 `Search this preview…` 輸入列；不要只是把它縮成另一個顯眼的搜尋卡片。原本的搜尋 mock 測試可保留在開發路徑，不成為交付畫面。
- **後續**：若真實 Pi Session 很長、使用者確實需要檢索，再設計由鍵盤快捷鍵／Command Palette 或次級 `Find in conversation` 入口**按需開啟**的功能；此功能**不列入 P1 放行 Gate**。必須確認和 Terminal 原生 Find 快捷鍵不衝突、對話來源範圍／折疊區命中清楚，再落地。

**驗收**：P1 正常對話畫面沒有常駐搜尋輸入；進入 UI 第一屏從 header 直接進入對話內容。移除它不應改變後續 scroll anchor、tool disclosure 或 Composer 的狀態。

**第二輪需求補充**：不加 Search，但參考 `/home/chlo/Projects/aiphy2026/HW1/homework1/src/hw1_chat/static/app.js` 的 **message rail** 功能，評估對話區右緣的**即時輪次導航**：click 跳轉、hover／focus 顯示內容摘要。該 HW1 Demo 本身只有節點 active/jump 和簡單 `title`，**沒有**完整問題／答案的 hover preview；完整 preview 是新設計。外觀不照抄 HW1 的波浪與綠色，rail 不取代 Herdr 全域 Sidebar。詳細方案見 [10](10-tool-activity-live-rail.md)。

**第三輪精簡決策（pi-harness 參考）**：已將「完整 hover preview」收斂為**一行短使用者提問**；只有確實未解決、需要人處理時可附第二行極短警示。**不顯示 assistant 回答、工具統計、時間戳或 markdown 大綱。** Rail 只標記一個 active turn，細節在 click 跳到對話之後閱讀。pi-harness 的 `docs/notes/minimap-simplification.md` 同樣是這個方向，但它在來源專案仍是**尚未實作完成**的設計。詳見 [10 §4.3](10-tool-activity-live-rail.md)。

### F04 · 不是「每個 box 預設收起」，而是「工具群組本身預設收起」

目前 `row(role === 'tools')` 會把每個 item 都交給 `toolRow()`；每個 `toolRow` 本身是 **bordered + raised background + rounded box**。就算每個工具 details 關閉，仍會堆出很多盒子。這是使用者認為礙事的根因。

**目標的三層結構**（群組摘要／展開清單／單項詳情）：

```text
Pi
  這裡是主要回答／正在生成的文字。

  ▸ 已執行 12 個操作 · 讀取 8 次 · 搜尋 3 次 · 執行 1 次
    ! 其中 1 項失敗                         （僅摘要，預設）

# 使用者點擊摘要後（同一位置展開）：

  ▾ 已執行 12 個操作 · 讀取 8 次 · 搜尋 3 次 · 執行 1 次
      ✓ Read src/window.rs
      ✓ Search "layout.select"
      ! Run tests — failed                        ▸ Details
      …（短文字列，不再每個工具加 box）
```

- **第一層：工具活動群組**：每個 assistant turn／合理的相鄰工具批次**預設 `collapsed`**。以一條文字摘要與 chevron 呈現，沒有 card 邊框／背景／每項 tool box；在必要時顯示有根據的數量、當前工具名稱、錯誤數與 pending 數。
- **第二層：工具清單**：只在展開群組後顯示，預設**簡潔行列表**（icon／狀態文字＋工具名＋一句摘要），不要每個 item 都獨立 raised box；行距一致、可選取／複製。若列表很長，使用有界分頁／虛擬化，不一口氣掛 1000 row。
- **第三層：單項詳情**：使用者明確點選單個 tool 才顯示參數、stdout／stderr、diff 或錯誤訊息；**初始全關閉**。顯示細節時可用內嵌區塊或輕邊線，不應重新製造整頁卡片堆疊。
- **例外重要**：失敗、需要使用者處理、未確認結果**可以藏在群組細節，但其風險標記與數目不能藏在已收起的摘要之後**。當 Agent 尚未有回覆且最後一步卡住，至少要看到「正在執行 X」或「需要處理」這樣的一行；不代表自動展開所有詳情。
- **手動優先**：群組和 tool 分別有 `auto / user-open / user-closed` 狀態，使用者手動展開後，不因新事件、chunk、切換 Terminal/UI 而自動收回。思考內容也預設折疊。
- **過度折疊的邊界**：不可把最後答案、真正的錯誤摘要或權限等待入口折疊成完全不可見，也不能把「沒有 end event」標成成功。

**驗收**：20 個成功 tools 的一個 turn，預設只佔**一條活動摘要**而非 20 張卡；展開後是緊湊的文字列，每個工具詳情默認關閉；含 1 個失敗時，未展開仍清楚顯示「1 failed」；已手動展開的狀態跨重繪保留。

**第二輪需求補充**：工具卡不能只有「變簡單」；要參考 PI-Desktop 的 typed presentation、paseo 的 run grouping 與 ZCode 的 per-tool renderer，做**Group Summary → Compact Tool Rows → 專用 Detail** 三層。詳見 [10 §3](10-tool-activity-live-rail.md)，包含 Read/Search/Bash/Edit/Images/未知工具、異常升權、擬議尺寸與長輸出限制。

### F05 · Markdown 目前不是 parser，應優先換成官方 native renderer

**已查明原因：** `mods/agent-ui/main.js` 的 `para()` 只做 `String(text).split("\\n\\n")`，在整個段落開頭是 `## ` 時把字號調大並去掉 `##`；**沒有解析粗體 `**text**`、斜體、`#` headings、list、link、inline/fenced code、quote 或 tables**。所以畫面出現裸 Markdown 符號是**目前 renderer 的實作限制**，不是 Pi 的 Session 尚未接入造成的。即使改為真 Pi event，只要仍用 `para()`，結果會一樣。

**Herdr 官方文件提供了原生途徑**：

- [Herdr App 官方 Mod Guide — UI](https://github.com/herdrdev/herdr-app/blob/master/defaults/AGENTS.md)：列出 `TextView.markdown(id, text)` 為 Markdown 呈現方式。
- 同份官方文件也列出 `EditorState.new(...)+Editor.new(state)` 作為可讀／可編輯的原生程式碼顯示器；不是 HTML/CSS/WebView。
- **但**專案目前沒有拿到目標 Mac 上由 Herdr 生成的 `gpui-kit.d.ts`／相容版本的實機檢查結果，因此 **`TextView` 的確切 import、支持的 CommonMark／GFM 子集、表格、數學公式、Markdown block style、超長文本選取、URL 開啟及增量更新效能，仍須實機核對**。不要從函式名稱直接推論支援所有 Markdown／KaTeX。
- **首選**：將 assistant/user 文字統一經正規的 GPUI Markdown Viewer 呈現；保留來源文字供 Copy、搜尋、調試，並對不支援元素做**保留原文的純文字 fallback**。
- **段落與串流**：避免每個 token 全文重建造成 scroll anchor 跳動；先驗證 renderer 的更新頻率、cache key、id 穩定性與選取行為。
- **Code blocks**：避免把多行程式碼塞進一般文字行；若 markdown viewer code block 不適合選取／複製，依官方建議在細節 viewer 使用原生只讀 Editor。
- **安全**：使用 renderer 的安全文字路徑，不允許外部事件文字注入 DOM/JS/可執行 SVG；圖片、檔案連結和外部 URL 需明確操作，失敗時保留原始文字。

**P1 最小 Markdown 測試矩陣（必須實際拍圖及複製驗證）**：

| 項目 | 合格條件 |
| --- | --- |
| `#`／`##`／`###` | 不是原始標記；層級、字距、換行正常 |
| `**bold**`、`*italic*`、inline `code` | 字形／字體可辨識；不殘留 Markdown 控制符 |
| unordered／ordered list、引用區塊 | 縮排和換行正確，CJK 多行不擠在一列 |
| fenced code + language | 等寬、保留空白／縮排，可選取與 Copy；超長行有穩定布局 |
| link／URL | 有明確視覺與安全的 click 行為，不因 hover 造成額外干擾 |
| CJK／英文／emoji／LaTeX source | 複製不丟字；`$...$` 若無 native math 支援就保留 source，不誤當 HTML |
| 長文＋stream update | 不白屏、不每個 token 跳 scroll、不在更新時丟 selection |

**驗收**：對照原型既有 `**bold**`／`## 建議` fixtures，前者應粗體、後者應作標題；再測表格／code／links／科學公式 fallback。只有在目標 App 的 `herdr-app check` + 實際 GUI 截圖與複製測試通過後，才稱為「Markdown 支援完成」。

## 2. 建議的一般畫面（移除場景列和常駐搜尋）

```text
┌───────────────────────────────────────────────────────────┐
│ Pi · Project / session                             Working │
├───────────────────────────────────────────────────────────┤
│ User                                                      │
│   請檢查這段推導與程式……                                   │
│                                                           │
│ Pi                                                        │
│   ## 結論（此處實際呈現為二級標題，不保留 ##）             │
│   有兩項**重要**差異……（important 實際加粗）               │
│                                                           │
│   ▸ 已執行 12 個操作 · 1 failed                            │
│                                                           │
│   下一步……                                                │
│                                                           │
├───────────────────────────────────────────────────────────┤
│ [Message composer；此 P1 原型僅本地演示]                   │
├─────────────── 原生 Herdr Status Bar ─────────────────────┤
│ Machine · Agents · Project Open  [SVG 模式圖示] · Commands  │
└───────────────────────────────────────────────────────────┘
```

不新增 side inspector、floating toolbar 或大量 pills。**對話是主角**：第一屏就能開始閱讀；工具細節與搜尋皆屬按需操作。

## 3. 交付順序與測試（P1）

1. **P1.1 移除測試 UI 噪聲**：將 scenario selector 移至開發測試入口；移除常駐 preview search。保留 fixtures 與現有三種情境回歸測試。
2. **P1.2 Status Bar 單 SVG**：比照 `project-open-button` 的尺寸／hover 風格；驗證當前 mode、keyboard focus、non-Pi disabled、Project Open 不受影響。這**不解決**現階段「chrome stack 不是原生逐 Pane」的宿主缺口。
3. **P1.3 工具摘要分層**：先 group collapsed，再 compact list，最後 per-tool detail；用 20 成功／1 失敗／1 running／1000 tools fixtures 驗證。
4. **P1.4 Markdown viewer**：先從官方 `TextView.markdown` 做小型 spike，在目標 Mac 取 `.d.ts` 確認實際 API；渲染、Copy、CJK、code、公式降級、streaming 後才替換 `para()`。
5. **P1.5 同畫面對照與回歸**：相同場景修改前／後截圖與影片，檢查 Status Bar／Markdown／工具高度／Composer／窄 Pane，不改 Pi runtime 或 Session 資料層。

| 測試 ID | 必要驗收 |
| --- | --- |
| FB-01 | 正常畫面無 Working／Completed／Needs attention 三顆可按的 fixture 按鈕；測試仍能選 fixture |
| FB-02 | Status Bar 只有一個簡潔 SVG 模式切換鈕，不含 segmented control；Project Open 功能不受影響 |
| FB-03 | 正常畫面無 Search this preview 常駐輸入框；對話閱讀區增加可用空間 |
| FB-04 | 20 tools 預設合併一條；展開後無一工具一 box；失敗／pending 摘要仍可見 |
| FB-05 | 真正 Markdown（粗體、標題、列表、code、links）可驗證；不支援元素保持安全可複製原文 |
| FB-06 | 三種 fixtures、切換／草稿／手動展開、Dark/Light、360/520/900px 無明顯回歸 |

## 4. 本次與原計劃的關係

- [02 · UI／UX 規格](02-ux-spec.md)：更新為**單 icon**、group collapsed、search 不常駐、native Markdown 優先。
- [07 · 原型後打磨](07-post-prototype-polish.md)：把 FB-01～06 變成 P1 的前置清單與 Done Gate。
- [05 · 交付計劃](05-delivery-and-tests.md)：P1 開始先完成這輪回饋；不把這些項目延後至 Pi bridge。
- [10 · Tool Activity + Live Rail](10-tool-activity-live-rail.md)：補齊工具專用細節，並將「不加搜尋、改評估側邊輪次導航」落成可測試互動規格。
- [08 · P0 原型現況](08-prototype-implementation.md)：記錄目前程序仍有的限制；不可錯誤宣稱已修正。

**不變項**：Pi-only、UI-first、Status Bar、不中斷原 Terminal、未驗證時禁用真實 Send、不建立 Session JSONL Reader、不為了整理介面重啟 Agent。

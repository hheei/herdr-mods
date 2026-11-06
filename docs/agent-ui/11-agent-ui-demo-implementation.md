# 11 · Agent UI Demo：實作與驗收現況

**狀態：2026-11-06，本地可安裝的 native GPUI fixture demo；非正式 Pi GUI，實機渲染仍待核對。**  
此文件記錄 P1 設計 [09](09-p0-feedback-round1.md)、[10](10-tool-activity-live-rail.md) 的第一個實作試驗，不取代設計規格。**唯一實作是 `mods/agent-ui`；不再維護獨立 v1／v2 Mod**。先前 UI／UX 研究仍作為設計參考。

## 試用

在 **Herdr App GUI 所在的機器**，從 `herdr-mods` checkout 執行：

```sh
sh scripts/install.sh agent-ui project-open
```

然後在 Herdr App Layout 選擇器選 **`agent-ui-demo`**。Status Bar 上切換入口是一個小 SVG：Terminal 目前顯示對話 icon（點擊進 UI）；UI 顯示 Terminal icon（點擊返回）。主程式仍在原 Terminal／PTY 裡，**Demo 不會傳送任何 Pi 指令**。

完整操作與回復方式：[Agent UI Mod README](../../mods/agent-ui/README.md)。

## 目錄與單一版本

| 位置 | 用途 |
| --- | --- |
| `mods/agent-ui/main.js` | 新的 Native GPUI View、工具群組／行／細節、Markdown、Rail、模擬 Composer |
| `mods/agent-ui/fixtures.js` | 七輪完整合成對話，含 Markdown、工具類型、failed／pending／working |
| `mods/agent-ui/model.js` | 純函式：工具數量與狀態摘要、極短問題 preview、rail node、window target |
| `mods/agent-ui/mod.json` | `place:none` + `install:derive:agent-ui-demo` |
| `mods/project-open/main.js` | **僅在 agent-ui-demo Layout** 嵌入原 Status Bar 的單一 SVG 按鈕；不再有舊式 segmented 控制 |
| `mods/project-open/agent-ui.svg`、`agent-terminal.svg` | 同一顆切換按鈕的兩個 icon 狀態（一次只顯示一個） |
| `scripts/demo-layout.awk` | **既有**的 derive 工具產生唯一 `agent-ui-demo.json`（未重寫安裝流程） |
| `tests/agent-ui.test.cjs`、`tests/agent-ui-demo-install.test.sh` | 模擬 GPUI 互動及隔離安裝測試 |

## 目前畫面實作

### 清理第一屏

- 沒有 `Working / Completed / Needs attention` 三顆測試場景按鈕。
- 沒有 `Search this preview` 或其他常駐搜尋欄。
- 標題只保留 `Pi · Conversation`、低權重的最新狀態及 `DEMO`。
- Composer 永遠標明 **Synthetic / demo**；點擊 Send 只追加本地新輪次與模擬回覆。

### Tool Activity

1. 每個有工具的 turn **預設只顯示一行摘要**，含種類與可信計數；**右側不再有獨立狀態**。若失敗，僅在摘要的同一行文字內附帶 `N failed`，不以彩色狀態獨立佔據右側。失敗與待處理不是同一件事。
2. 點擊整組 summary 才生成**無獨立卡片背景**的 compact tool rows。
3. 點擊單項才掛載 Detail；Read／Search／Exec／Edit／Custom 有不同的 detail 標題；Edit patch 的增減行以簡單顏色區分。未知工具保留原文，輸出限制 8 KiB／32 行（Demo 文字預覽，不是全量結果 viewer）。
4. 切換其他 turn 後 group/detail disclosure 存在 View 的本地 `Set` 中，不被重新渲染自動關閉。

**仍非最終產品：** 有界分頁、檔案跳轉、真正的 stdout/stderr channel、可靠舊新 diff、1000+ 工具虛擬化還沒接入。不可把 fixtures 的虛構 exit status 當真實診斷。

### 原生 Markdown

使用 [Herdr 官方 Mod Guide](https://github.com/herdrdev/herdr-app/blob/master/defaults/AGENTS.md) 列出的 `TextView.markdown(id, text)`，直接把原始 Markdown 交給 Renderer；不使用舊有 `para()` 的分段／`##` 特判。

已建立 fixtures：`##`、`**bold**`、`*italic*`、inline `code`、fenced code、quote。**Node 測試只證明呼叫／來源文字正確，沒有驗證實機 import、文字排版或 KaTeX**。在目標 Mac 上需實際執行 `herdr-app check`、觀看截圖與複製試驗，且不能宣稱支援所有 GFM／數學。

### Message Rail

- **Message Rail 本身就是 Scrollbar**：唯一的 18px 寬操作區**只繪製訊息圓點**；沒有 1px Track、4px Thumb，也沒有獨立的視野高亮條。圓點固定在右側垂直中線、**間距 3px（pitch 14px）**，整列不高於 viewport 的 **40%**。大小是**以閱讀位置為中心的高斯波包**：焦點 11px，往兩側遞減至 **6px 下限**；焦點取「與 viewport 相交、且最靠列中央」的圓點，因此可見輪次不必然全部同尺寸，視覺上只有一個焦點。顏色只用 Theme 中性的 `dim`／`muted`，可視僅提高亮度。
- 高密度歷史**按桶合併**：`maxDots = floor(viewportHeight × 0.4 / 14)`、`perDot = ceil(turns / maxDots)`，一個圓點代表連續 `perDot` 輪，跳轉到該桶第一輪，Hover 追問 `+N`。**不抽樣丟棄任何輪次**，也不把每點縮成 1–2px 細線；這與編輯器 scrollbar decoration 的處理方式一致（比例定位＋密集處合併），而不是 minimap 的全量縮小。
- 合併軌使用 `.on_mouse_move` 依位置找最近的圓點，Hover 只顯示**一行截短 user prompt**，離開控制軌即關閉。只有 `requiresUserAction === true` 的明確介入事件才加第二行 `需要處理`；**工具 failed／pending 不等於使用者需要介入**，也**不影響 Pin 顏色**。
- 點擊固定 turn ID 時，在**同一份完整對話**內更新 `scrollY` 到該輪的**實際量測高度位置**；**不再將 earlier turns 切掉／換一份 window**。目前使用 Herdr 已有的 `on_scroll_wheel`、`on_size_change`、`overflow_hidden` 和絕對位置來建立手動可捲動 viewport；不是宣稱 Herdr 已有 public `scroll-to-id`。
- `turnGeometry` 由每輪 `.on_size_change` 實測高度構成；群組展開導致高度變化時保留原閱讀錨點，滑鼠滾動更新 `scrollY`，所有與 viewport 區間相交的 turn 同時高亮。Hover 預覽及 rail pin 的 top 都以 viewport 高度 clamp，容器本身裁切。
- **操作**：點擊圓點並放開＝跳至該輪；從圓點拖曳超過 5px＝改成按 Rail 垂直位置捲動對話，放開不再觸發跳轉；點擊或拖曳圓點間的空白區也可按比例捲動。所有操作只更新唯一的 `scrollY`，不是另一個 Scrollbar 控件。窄 Pane 仍保留圓點；只有極短 viewport 才隱藏整條 Rail 防止溢出。此視圖仍是原本 Chrome Layout Stack 的子 View，不是獨立 model Pane；外框維持 `rounded(10)`、1px Theme border、38px Topbar。

**已完成：連續 transcript 的量測式 Jump、固定中線 3px 間距的圓點列、40% 高度上限、以及高斯波包焦點。** 尚未完成／實機未驗證：桶合併的 Hover 文字長度、跨視窗 pointer capture、鍵盤 Focus／Screen Reader 和 GPUI 真實文字幾何。這些不是已完成產品功能。

**Dots-only Rail 已實作（headless 測試通過，實機待驗證）**：唯一 18px 操作區只由圓點組成，沒有畫出 Scroll Track／Thumb。圓點的位置由每輪實測 `turnGeometry` 映射；當前 viewport 內的圓點放大，就代表可見區間。Wheel、圓點跳轉和 Drag-to-scrub 都使用相同 `scrollY`。圓點短按與拖曳透過 5px 門檻區分；空白處可以直接捲動，不用先點任何 Thumb。Resize、工具展開仍沿用相同幾何。原生 App 的指標事件、Hover 與視覺需要實機驗證。

## 安裝與不干擾要求

- `sh scripts/install.sh agent-ui project-open`：使用唯一的 `agent-ui-demo` Layout，不覆蓋 `main`、一般個人 Layout 或原 Terminal 模型；若標準 `herdr-mods` Status Bar 尚未整合 `project-open`，安裝器按其既有規則 patch 並留 `.bak`。
- Demo Layout 的切換仍使用 **chrome stack 包住整個 active Tab renderer**，不是最終要求的**每個 split model Pane 都能各自切換**。如果 Tab 有多個 model Panes，顯示 UI 時它們會一起隱藏，**不是**執行停止。
- 沒有 Pi Session JSONL Reader、沒有真正的 Pi Extension、沒有 subprocess、沒有修改正在跑的 Pi。
- 所有更動預設**只在本地 checkout**，不是 GitHub release；要驗收前不要把這個 Demo 宣告為產品。

## 測試與下一步

```sh
node tests/agent-ui.test.cjs
node tests/project-open.test.cjs
sh tests/agent-ui-demo-install.test.sh
```

已覆蓋的行為：七輪 fixtures、group 和 tool detail 的折疊、失敗摘要（**右側不顯示狀態**）、工具失敗不觸發 `requiresUserAction`、Markdown 的原生 API 參數、**所有可見輪次的 Rail multi-highlight**、按 ID 捲動完整 transcript、Hover／Pin 可視範圍 clamp、**Dots-only Rail：圓點點擊、空白處點擊／拖曳、5px Gesture 門檻、上下邊界、Wheel／Resize 同步，且不渲染 Track／Thumb**、圓角 root、本地 Composer、窄畫面、單 SVG status control、獨立 derive layout、不覆蓋一般個人 Layout／main、備份。

實機進行以下 QA 才算完成下一個 Gate：`herdr-app check`、真實視窗截圖、Markdown code blocks、Hover 是否裁切、click 過程是否跳動、窄 Pane／IME／鍵盤 focus、當實際 UI 初始化失敗時是否仍能從 Status Bar 回 Terminal。**這台 Linux 執行環境沒有 `herdr-app` desktop binary，故無法代替目標 Mac 上的實機結果。**

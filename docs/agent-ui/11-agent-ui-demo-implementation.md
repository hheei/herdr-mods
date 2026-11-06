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

1. 每個有工具的 turn **預設只顯示一行摘要**，含種類與可信計數；failed／pending 不可藏起來。
2. 點擊整組 summary 才生成**無獨立卡片背景**的 compact tool rows。
3. 點擊單項才掛載 Detail；Read／Search／Exec／Edit／Custom 有不同的 detail 標題；Edit patch 的增減行以簡單顏色區分。未知工具保留原文，輸出限制 8 KiB／32 行（Demo 文字預覽，不是全量結果 viewer）。
4. 切換其他 turn 後 group/detail disclosure 存在 View 的本地 `Set` 中，不被重新渲染自動關閉。

**仍非最終產品：** 有界分頁、檔案跳轉、真正的 stdout/stderr channel、可靠舊新 diff、1000+ 工具虛擬化還沒接入。不可把 fixtures 的虛構 exit status 當真實診斷。

### 原生 Markdown

使用 [Herdr 官方 Mod Guide](https://github.com/herdrdev/herdr-app/blob/master/defaults/AGENTS.md) 列出的 `TextView.markdown(id, text)`，直接把原始 Markdown 交給 Renderer；不使用舊有 `para()` 的分段／`##` 特判。

已建立 fixtures：`##`、`**bold**`、`*italic*`、inline `code`、fenced code、quote。**Node 測試只證明呼叫／來源文字正確，沒有驗證實機 import、文字排版或 KaTeX**。在目標 Mac 上需實際執行 `herdr-app check`、觀看截圖與複製試驗，且不能宣稱支援所有 GFM／數學。

### Message Rail

- 七輪各一個 marker，右側窄軌，**單一目前選擇輪次**。
- `.on_hover` 顯示**一行截短 user prompt**；只有 `needs-input` 真正需處理輪次才加第二行 `需要處理`；無工具數量、時間戳、Pi 回覆或大幅預覽。
- 點擊依**穩定 turn ID** 選取本地 transcript **window**，由被點輪次開始顯示之後的內容；用 `Earlier turns` 或 Rail 返回更早內容。這不是依螢幕像素位置的原生 `scroll-to-key`。因此 **free scroll 時的 active node 跟隨**仍未完成、也不該在 UI 驗收中假裝已做到。
- 寬度低於約 520 logical px 時隱藏 rail，優先保留對話與 Composer。Hover popover 的真正 hit target／位置／裁切和鍵盤可及性需在原生 App 另行檢查。

**真正連續 transcript 的精確 Jump／viewport-derived activeTurnKey、長歷史 cluster、鍵盤 Focus／Screen Reader 是下一輪 UI spike 的未完成項**，而不是已完成的功能。

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

已覆蓋的行為：七輪 fixtures、group 和 tool detail 的折疊、失敗摘要、Markdown 的原生 API 參數、極簡 hover、按 ID window jump、本地 Composer、窄畫面、單 SVG status control、獨立 derive layout、不覆蓋一般個人 Layout／main、備份。

實機進行以下 QA 才算完成下一個 Gate：`herdr-app check`、真實視窗截圖、Markdown code blocks、Hover 是否裁切、click 過程是否跳動、窄 Pane／IME／鍵盤 focus、當實際 UI 初始化失敗時是否仍能從 Status Bar 回 Terminal。**這台 Linux 執行環境沒有 `herdr-app` desktop binary，故無法代替目標 Mac 上的實機結果。**

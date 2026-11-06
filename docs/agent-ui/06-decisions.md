# 06 · UI-first 架構決策（ADR）

「採納」是本專案設計方向，**不是**上游已實作或實機驗收通過。來源核對見 [01](01-evidence.md)，具體契約見 [03](03-architecture.md)／[04](04-pi-contracts.md)。

## ADR-001 · 一個 Pi runtime，兩個可切換的呈現

**採納。** Herdr Core 保持原有 PTY／Pi，Terminal 和 GUI 對應同一程序與 Session。切換不呼叫 `kill`、`terminal.park`、`pane.close`、`abort` 或重啟／額外啟動 Pi。UI 出錯時仍可回原生 Terminal。

**拒絕**：另啟 `pi --mode rpc --session ...`，那是第二個實例，不能原位接管正在運行的 TUI。[H4](01-evidence.md#h4)、[P5](01-evidence.md#p5)

## ADR-002 · UI-first，不建立 Session JSONL Reader

**採納，取代先前的 Reader-first 方向。** 本專案是 GUI Mod，不是 Transcript archive／歷史查詢服務。**不**開發 JSONL parser、disk index、file watcher、file cursor／rotation 或跨 session search。Pi runtime 內存 snapshot 和 extension events 足以支援主要 UI；能否取得較舊內容由 Pi 的同 runtime API 和 memory budget 決定。

保留的研究材料中仍有 JSONL 相關說明，僅用於理解 Pi 行為與限制，不是工作項目。[P1–P4](01-evidence.md#p1)

## ADR-003 · UI 元件與互動先用合成 fixtures 做到成熟

**採納，但明確分兩個階段。** P0 用 synthetic fixtures 建**可操作的最小原型**（既有 Status Bar 切換、對話、最少工具卡、mock Composer、返回 Terminal），先確認同 Pane 技術 Gate。**P1 在觀察原型的使用摩擦後才打磨** native GPUI message timeline、工具卡、diff、thinking、搜尋、Composer、scroll/focus/a11y；不要求第一版就做完像素級 polish。詳見 [07](07-post-prototype-polish.md)。Pane Header 只有資訊，不放切換鈕。用 mock event feeder 模擬 streaming／故障，不等待 host observer 完成才開始做 UI。

**拒絕**：先造一整個 gateway/index platform，最後才開始畫介面。這與本產品目標不符。

## ADR-004 · 嚴格同原生 Pane，不以 Tab stack 代替

**目標採納，實作 Gate 待驗證。** Herdr `layout.select` 操作 chrome layout，未證實能切任意既有 model split Pane。[H3–H4](01-evidence.md#h3)

如需宿主功能，提案只改 Herdr App 的 **per-pane presenter**；保留 PaneId、TerminalView、PTY、Kitty buffer、focus 和 geometry。不得因實作便利退而切整個 Tab，或用 park／close 中斷工作。

## ADR-005 · Status Bar 切換控制與 Presenter 分離

**採納，與原有 `project-open` 相容。** Terminal／UI 切換鈕固定在**視窗底部 Status Bar**，而非 Pane Header。狀態列可以是視窗級，但切換命令只對**當前聚焦的 Pane** 生效；點擊時捕捉 PaneId／terminal incarnation／binding epoch，不能在 async 後把命令投送到新的 focused Pane。焦點變更只更新按鈕顯示；Shell／不支援 Agent／無焦點時停用。

**原位整合要求**：共用已有 Status Bar 背景、頂邊框、高度與 renderer，保留 Machine、Agents、Commands、Project Open；不增加另一個底部 Layout Block／挖空 32px 欄位。控制由可靠的宿主或 status compositor 擁有，即使 Agent UI Mod render 失敗也可回 Terminal。如果 Herdr 沒有 Status Bar 組合 API，先做能力驗證或最小宿主擴充，而不直接覆蓋現有 Mod。

## ADR-006 · 最小 Pi Extension，直接取 live session 資訊

**採納。** 同一 Pi TUI 中的 Extension 以 `ctx.sessionManager.getBranch()`／`getSessionId()` 提供有界 GUI snapshot；message/tool/settled hooks 提供新事件。Mod 不直接讀磁碟 Session。必要的傳輸 relay 只負責 authenticated framing／transport，不保存或解析長期歷史。[P2](01-evidence.md#p2)

**代價**：舊 Pi 未裝 extension 時 GUI 僅顯示有限狀態與回 Terminal；安裝不能為了 UI 強制 reload 正在工作的 Pi。

## ADR-007 · 只用原生 GPUI 設計，不搬 Web 產品

**採納。** 借鑑四倉與 Moshi 的行為、排版、狀態機，不拷貝其 React、CSS、私有 hook 或商業資產。Native Markdown／code／CJK／數學能力逐個驗證，缺失要有 source-preserving fallback。[R1–R2](01-evidence.md#r1)、[M2](01-evidence.md#m2)、[H1](01-evidence.md#h1)

## ADR-008 · Presentation、runtime state 與 UI view state 三層分離

**採納。** Pi event store 只關心資料與身份；turn／activity projection 是純轉換；local view state 記草稿、anchor、disclosure、search、mode。UI 狀態不得污染 Pi Session 或工具執行。不同 Pane 不假設同一 Mod JS heap，必要時用獨立可驗證的 coordinator。

## ADR-009 · 先讓錯誤誠實可見，不追求虛假的完整能力

**採納。** 未有 tool end 就標 unknown／running；未裝 extension 顯示「整合未啟用」，不讀 JSONL 假裝有完整 transcript；沒有 question/approval adapter 就回 Terminal，不盲按 y／Enter。不顯示不存在的 token、推理或歷史。

## ADR-010 · 使用者手動互動優先

**採納。** 答案優先、工具活動有摘要；失敗與未完成保留可見。折疊狀態 `auto / user-open / user-closed`，不因 stream／切 mode／畫面重建而重設。reading anchor 不被新輸出拉到底；鍵盤、IME、草稿優先於裝飾動畫。[R2](01-evidence.md#r2)

## ADR-011 · 控制必須精確綁定，不盲打 Terminal

**採納；控制通道需實測。** Prompt／follow-up／steer／Stop 使用同一 Pi 的 extension API，檢查 runtime binding epoch、session、input revision 與 capability。不用 `hc send`／`hc keys` 做通用默認控制。敏感輸入不用 argv；通道不安全時禁用 Send，但保持 UI 閱讀和 Terminal 可用。

## ADR-012 · 不確定送達不自動重試

**採納。** 使用 requestId、回執狀態、不可確定時 `uncertain`，同文字可以發兩次。Moshi 的時間窗文字配對只供研究，不作本產品去重證明。[M3](01-evidence.md#m3)、[P4](01-evidence.md#p4)

## ADR-013 · 安裝與退出不影響工作，CI 不能代替 GUI 驗收

**採納。** Mod、Pi extension、relay、可選 App presenter hook 分別安裝與回退；不改現有 `project-open`，不默默 patch binary 或重啟 Pi。通過 `herdr-app check` 不表示同 Pane、IME、scrollback、Kitty 圖像或 native focus 已通過，需目標機器實測。[H1](01-evidence.md#h1)

## 決策修訂規則

引入功能時先問：**這件事是否直接讓 UI／UX 更好？** 若只是擴大歷史搜尋、索引、遠端平台或 session database，應獨立立案，不列入本 Mod 的必要範圍。所有設計變更都更新 [05 的測試與 Gate](05-delivery-and-tests.md)。

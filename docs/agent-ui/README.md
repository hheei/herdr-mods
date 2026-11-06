# Herdr Agent UI：Pi-first、UI-first 設計

**設計草案 0.3 · 2026-11-06**  
**目標：真正的原生 GUI，不是 Session 檔案閱讀器。** 實作與目標 Mac GUI 驗證尚未開始。

## 一句話

在 Herdr **視窗底部 Status Bar** 放置 **Terminal / UI 切換按鈕**，只切換目前聚焦的**同一個原生 Pane**。兩個模式對應**同一個正在執行的 Pi 程序與 Session**，切換不重啟、不 detach、不重跑工具、不丟各自的草稿與閱讀位置。

## 工作範圍（已重新聚焦）

| 核心 | 內容 |
| --- | --- |
| **Pane UX** | 底部 **Status Bar** 固定切換按鈕，只作用於 focused Pane；原生 Pane frame／鍵盤焦點與錯誤回退不受影響 |
| **Conversation UI** | 使用者／助手內容、流式回覆、工具活動、可折疊 thinking、diff、長內容與搜尋 |
| **Composer** | 輸入、排隊 follow-up、明確 steer、草稿與 IME 保護、可靠送達狀態 |
| **Pi 最小 Adapter** | **連到原本 Pi TUI 的 extension**，只提供當前會話的 bounded snapshot、live events、session identity、必要控制 |
| **Presenter** | Herdr GPUI Native Mod；Pane 表示狀態與 Pi runtime 完全解耦 |
| **資料策略** | 先以合成 UI fixtures 開發畫面；整合後由 Pi 的**記憶體 Session API 與 hooks**供應資料，不另做磁碟解析系統 |

**刻意不做**：Session JSONL Reader、歷史檔案 scanner、增量索引、檔案 watcher、file cursor／rotation、跨 Session 搜尋與歷史歸檔工具。也不複製 Moshi 的完整 gateway。未來確有需求才獨立設計，不屬於這次交付。

### UI 的資料從哪裡來？

```text
現有 Herdr Core ── 現有 PTY ── 現有 Pi TUI（持續工作）
                             │
                             └─ 最小 Pi extension（可選安裝）
                                 ├─ session_start / getBranch() / getSessionId()
                                 ├─ message_* / tool_execution_* / agent status
                                 └─ 經驗證的送訊息／steer／follow-up／abort
                                     │
                          小型事件傳輸 Adapter
                                     │
                          Herdr Agent UI (GPUI)
                                     │
                              同 Pane 的 UI 面
```

`getBranch()`、`getEntries()` 屬 **Pi 正在執行程序的記憶體 API**；這裡不要求 Mod 直接讀 `~/.pi/agent/sessions/*.jsonl`。已開啟但沒有 extension 的 Pi：仍能回 Terminal，UI 只顯示能由 Herdr 確知的狀態與清楚的未連線說明，不假裝有完整聊天資料。

## 第一版畫面

```text
┌────────────────────────────────────────────────────────────┐
│ Pi · project · Working                               ...   │
├────────────────────────────────────────────────────────────┤
│ User：請檢查推導及相關程式……                               │
│                                                            │
│ Pi：發現兩處不一致……                                       │
│   ▸ 過程：讀取 8 個檔案、執行 3 條命令、修改 2 個檔案        │
│   ! 1 項測試失敗                         [查看細節]        │
│                                                            │
│                                    [有新內容 ↓]            │
├────────────────────────────────────────────────────────────┤
│ 輸入訊息……                [完成後送出 ▾]  [送出] [停止…]   │
├──────────────────── 原本的 Status Bar ─────────────────────┤
│ Machine · 2 agents      Commands · Open   [ Terminal | UI ]│
└────────────────────────────────────────────────────────────┘
```

切換按鈕與現有 Project Open／Commands 等元件**嵌在同一個 Status Bar renderer**：不增加獨立 Layout Block、空洞或第二層背景。按鈕顯示**聚焦 Pane** 的目前模式；換焦點只更新按鈕狀態，不改另一個 Pane 的畫面。非 Pi 或無法精確綁定的 Pane 停用切換。

結果優先、過程可折疊；使用者手動展開的內容不被系統自動收回。長輸出有界呈現，搜尋與複製使用完整已收到的事件內容。程式碼／科學公式優先保真；不假裝原生 GPUI 已支援 KaTeX。

**先原型、再打磨**：P0 先驗證同 Pane 切換、內容呈現、基本工具卡與草稿動線；P1 才以真實操作和截圖對照來細調字級、間距、狀態、工具折疊、Composer、鍵盤／IME 與窄 Pane。詳細工作單見 [07](07-post-prototype-polish.md)；原型階段不為了畫面完美拖延切換可行性測試。

## 阻擋性技術關卡

**Herdr 的 `layout.select` 目前可核實作用於 chrome layout，不是任意原生 split Pane 的替換 API。** P0 必須先在目標版本證明真的能只切指定 Pane，保留原始 TerminalView、PTY、Kitty images、焦點與尺寸。若沒有公開接口，需最小 **Herdr App 呈現層擴充**；不能以切換整個 Tab 充當完成，也不能 `pane.close`／`terminal.park`。

**Pi hook 不是另一個 Pi 程序。** 不開第二個 `pi --mode rpc` 指向同一 Session。Pi 的事件與 `ctx.sessionManager` 只在同一 TUI runtime 的 extension 裡取得；完整控制必須通過身分驗證及安全傳輸。沒有可用橋接時保持 Terminal 完整可用。

## 文件索引

| 文件 | 用途 |
| --- | --- |
| [01 · 來源證據](01-evidence.md) | 四倉 UI 筆記、Moshi 與 Herdr／Pi 固定版本的核查；包含已排除的 JSONL 方案作為背景 |
| [02 · UI／UX 規格](02-ux-spec.md) | Pane 切換、對話、工具卡、捲動、輸入、CJK／科研、無障礙 |
| [03 · UI 架構](03-architecture.md) | UI 元件、狀態 ownership、最小 Pi extension／傳輸與失效隔離 |
| [04 · Pi 最小契約](04-pi-contracts.md) | live snapshot／event／runtime identity、控制與回執；不含 Session Reader |
| [05 · 階段與驗收](05-delivery-and-tests.md) | **P0 可互動原型／Pane Gate → P1 UI／UX 打磨 → P2 Pi adapter → P3 Composer → P4 整合硬化** |
| [06 · 架構決策](06-decisions.md) | 已選方案、明確不做的歷史系統與拒絕的替代方案 |
| [07 · 原型後打磨](07-post-prototype-polish.md) | **P1 才執行**的完整 UI／UX 精修清單、優先級、視覺 tokens 與實機驗收場景 |
| [08 · P0 原型實作現況](08-prototype-implementation.md) | 已建立的 native GPUI fixture demo、安裝方式、測試及**逐 Pane 切換仍未解決的缺口** |

## 不可破壞的行為

1. **切換入口固定於 Status Bar**，不放 Pane Header，亦不新增懸浮的獨立底部區塊；切換本身不向 Pi 送命令、不重建程序、不終止既有工作。
2. 一個 Pane 的模式不影響其他 Pane／Tab／機器。
3. 連線或 Session 切換後舊事件不得閃現到新 Pane，控制不得送錯 runtime。
4. GUI 崩潰、bridge 未安裝或失聯時，原 Terminal 是不受牽連的退路。
5. 手動 disclosure、草稿、中文 IME、搜尋位置、閱讀 anchor 都優先於自動排版／串流。
6. 文件中所有 API／native 行為均區分「官方已存在」與「本專案需實作／需驗證」。

本次只維護設計文件，沒有實作／安裝／重啟 Agent，亦不覆蓋既有 `project-open` 或其他未提交修改。

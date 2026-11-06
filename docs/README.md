# 設計與研究

| 主題 | 狀態 | 入口 |
| --- | --- | --- |
| Pi-first Agent UI：同 Pane 的 Terminal／UI 無中斷切換與原生 GUI | 已更新為**單一 Agent UI Native GPUI fixture**；有工具分組、Markdown、單 SVG、極簡 Rail；**真正逐 Pane 切換與實機視覺仍待驗證** | [Agent UI 設計包](agent-ui/README.md) |

這裡以設計和驗收規格為主。唯一的 Agent UI 模擬 Mod 可以**選擇安裝**，但不等於完成正式 Pi 整合；`project-open` 的正式安裝與使用以專案根目錄 README 為準。

Agent UI 目前只有 [一個 Demo 實作](agent-ui/11-agent-ui-demo-implementation.md)，路徑是 `mods/agent-ui`，使用 `agent-ui-demo` Layout。最初的 [P0 實驗記錄](agent-ui/08-prototype-implementation.md) 僅保留作設計歷史；目前仍**不是**正式的同 model split-Pane Pi UI。

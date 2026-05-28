<!-- 檔案用途：專案主要說明文件 -->
<!-- 功能：專案概述、快速開始指南、新資料夾結構說明 -->

# Agent Evaluation Dashboard

AI 工作流程可靠性測試的 MVP 專案

提供本地無 token 的模擬評估，以及透過 MCP (Model Context Protocol) 整合的 repository 掃描功能。

> **📣 專案結構**：前端、後端、設定與文件已分層整理，根目錄只保留入口文件和常用腳本。

---

## 📁 專案結構

```
Agent_Evaluation_Dashboard/
├── frontend/              # 前端檔案
│   ├── index.html        # 主要 HTML 介面
│   ├── app.js            # 前端邏輯（模擬評估 + MCP 連接）
│   └── styles.css        # UI 樣式表
│
├── backend/              # 後端檔案
│   ├── server.py         # HTTP 伺服器 + MCP 客戶端
│   └── mcp_servers/      # MCP 伺服器實作
│       └── local_repo_server.py  # 本地 repo 掃描工具
│
├── config/               # 配置檔案
│   ├── mcp.config.json   # MCP 伺服器配置
│   └── requirements.txt  # Python 依賴（目前為空）
│
├── docs/                 # 文件
│   └── ARCHITECTURE.md   # 架構說明
│
├── tests/                # 單元測試
│   ├── test_server.py
│   └── test_mcp_client.py
│
├── smoke-tests/          # 手動 smoke tests
│   └── check-structure.sh # 結構檢查
│
├── .github/workflows/    # CI/CD 配置
│   └── ci.yml            # GitHub Actions 自動測試
│
├── AGENTS.md             # AI Agent 協作指南
├── CLAUDE.md             # Claude 協作指南
├── CONTRIBUTING.md       # 貢獻指南
└── start.sh              # 快速啟動
```

---

## 🚀 快速開始

### 方法一：靜態模式（僅前端）

直接在瀏覽器中開啟前端檔案：

```bash
open frontend/index.html
```

這個模式只提供模擬的評估功能，不需要啟動後端伺服器。

### 方法二：MCP 模式（完整功能）

啟動包含 MCP 連接的後端伺服器：

```bash
python3 backend/server.py
```

然後在瀏覽器開啟：

```
http://127.0.0.1:5173
```

---

## 🧪 測試連到個人 Repo

### 在本地測試

1. 啟動 MCP 模式（見上方）
2. 在儀表板的 `MCP Connector` 區塊：
   - 選擇 `local-repo`
   - 設定 `Repo Path` 為你的專案路徑：
     - 當前專案：`.`
     - 其他專案：`/Users/brandonlee/dev/your-project`
3. 點擊 `Connect MCP` 初始化連接
4. 點擊 `Run Repo Scan` 執行掃描

### 透過 GitHub Actions 測試

每次 push 或 PR 到 `main`/`master`/`dev` 分支時，CI 會自動執行：

- ✅ Python 語法檢查
- ✅ 單元測試
- ✅ 伺服器啟動測試
- ✅ 程式碼品質檢查

檢視測試結果：前往 GitHub repo 的 `Actions` 頁籤。

---

## 📊 功能特色

### 模擬評估

1. 選擇工作流程、prompt 版本、模型預設、fallback 選項、benchmark 範圍
2. 點擊 `Run Benchmark`
3. 查看指標：
   - 成功率
   - Hallucination 率
   - 平均延遲
   - Token 成本
   - 任務層級結果
   - 失敗分析
4. 在 `Run History` 查看歷史記錄
5. 使用 `Compare v1/v2` 比較不同 prompt 版本

### MCP 評估

1. 連接 MCP 伺服器（見上方「測試連到個人 Repo」）
2. 點擊 `Run Repo Scan` 執行基於 MCP 的 benchmark
3. 查看：
   - MCP Tools 列表
   - 最新證據（Latest Evidence）
   - 執行結果（Run Results）
   - 失敗分析（Failure Analysis）

---

## 🛠️ 技術架構

```
Browser (frontend/)
  ↓ HTTP fetch
backend/server.py (HTTP API + MCP Client)
  ↓ JSON-RPC over stdio
backend/mcp_servers/local_repo_server.py
  ↓ File system operations
Your Repository
```

### MCP 工具

- `repo_summary` - 取得 repo 摘要
- `read_file` - 讀取檔案內容
- `search_files` - 搜尋檔案
- `scan_static_app` - 掃描靜態應用程式
- `set_repo_root` - 設定 repo 根目錄（執行時期切換）
- `scan_repo_quality` - 程式碼品質掃描

---

## 🔧 開發

### 執行測試

```bash
python3 -m unittest discover tests -v
```

### 檢查語法

```bash
python3 -m py_compile backend/server.py
python3 -m py_compile backend/mcp_servers/local_repo_server.py
```

### 手動測試 MCP 伺服器

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | python3 backend/mcp_servers/local_repo_server.py
```

---

## 📝 貢獻

請參閱 `CONTRIBUTING.md`。

---

## 📚 詳細文件

- **架構說明**：`docs/ARCHITECTURE.md`
- **AI Agent 協作**：`AGENTS.md`
- **Claude 協作**：`CLAUDE.md`

---

## 🎯 下一步

未來可整合的功能：

- ✅ Ollama 本地模型執行器
- ✅ OpenAI 相容 API 執行器
- ✅ JSON benchmark 檔案
- ✅ LLM judge
- ✅ CI regression gate
- ✅ GitHub MCP 伺服器
- ✅ Jira MCP 伺服器

---

**專案類型**：AI 工作流程可靠性測試 MVP  
**技術棧**：Vanilla JS 前端 + Python HTTP 伺服器 + MCP 整合  
**授權**：（請根據需要補充）

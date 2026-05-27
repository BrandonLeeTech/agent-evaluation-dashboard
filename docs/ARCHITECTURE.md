<!-- 檔案用途：專案架構圖 -->
<!-- 功能：視覺化說明專案的資料夾結構和檔案關係 -->

# 🏗️ 專案架構圖

## 資料夾結構

```
Agent_Evaluation_Dashboard/
│
├── 📁 frontend/                    # 前端檔案
│   ├── 📄 index.html              # 主要 HTML 介面
│   │   └── 功能：提供使用者介面，包含模擬評估和 MCP 連接
│   │
│   ├── 📄 app.js                  # 前端邏輯
│   │   └── 功能：執行模擬評估、MCP 連接、狀態管理
│   │
│   └── 📄 styles.css              # UI 樣式表
│       └── 功能：定義所有 UI 元件的視覺樣式
│
├── 📁 backend/                     # 後端檔案
│   ├── 📄 server.py               # HTTP 伺服器 + MCP 客戶端
│   │   ├── 功能：提供 HTTP API 端點
│   │   ├── 功能：管理 MCP 伺服器連接
│   │   └── 功能：處理工具探索和執行請求
│   │
│   └── 📁 mcp_servers/            # MCP 伺服器實作
│       └── 📄 local_repo_server.py  # 本地 repo MCP 伺服器
│           ├── 功能：實作 MCP 協定 (JSON-RPC 2.0)
│           ├── 工具：repo_summary, read_file, search_files
│           ├── 工具：scan_static_app, scan_repo_quality
│           └── 工具：set_repo_root (動態切換 repo)
│
├── 📁 config/                      # 配置檔案
│   ├── 📄 mcp.config.json         # MCP 伺服器配置
│   │   └── 功能：定義 MCP 伺服器啟動命令和環境變數
│   │
│   └── 📄 requirements.txt        # Python 依賴清單
│       └── 功能：定義專案所需的 Python 套件（目前使用標準庫）
│
├── 📁 docs/                        # 文件
│   └── 📄 ARCHITECTURE.md         # 本檔案（架構說明）
│
├── 📁 tests/                       # 單元測試
│   ├── 📄 __init__.py             # 測試模組初始化
│   ├── 📄 test_server.py          # server.py 測試
│   └── 📄 test_mcp_client.py      # MCP 客戶端測試
│
├── 📁 .github/                     # CI/CD 配置
│   └── 📁 workflows/
│       └── 📄 ci.yml              # GitHub Actions 自動測試
│           ├── 測試：Python 語法檢查
│           ├── 測試：單元測試 (pytest)
│           ├── 測試：伺服器啟動
│           └── 測試：程式碼品質
│
├── 📄 README.md                    # 專案概述（根目錄）
├── 📄 AGENTS.md                    # AI Agent 協作指南
├── 📄 CLAUDE.md                    # Claude 協作指南
├── 📄 CONTRIBUTING.md              # 貢獻指南
├── 📄 .gitignore                   # Git 忽略清單
│
├── 🔧 start.sh                     # 快速啟動伺服器
└── 🔧 test-structure.sh            # 驗證新結構
```

---

## 資料流向

### 模擬評估模式（純前端）

```
使用者
  ↓
瀏覽器開啟 frontend/index.html
  ↓
frontend/app.js
  ├── 執行模擬的 AI 工作流程
  ├── 產生假資料（不消耗 token）
  ├── 計算指標（成功率、延遲、成本）
  └── 顯示結果到 UI
```

### MCP 評估模式（完整功能）

```
使用者
  ↓
瀏覽器 → http://127.0.0.1:5173
  ↓
frontend/index.html + frontend/app.js
  ↓ (HTTP fetch)
backend/server.py
  ├── API 端點：
  │   ├── /api/health           健康檢查
  │   ├── /api/mcp/status       MCP 狀態
  │   ├── /api/mcp/connect      連接 MCP + 設定 repo
  │   ├── /api/mcp/call         呼叫 MCP 工具
  │   └── /api/evaluations/repo-scan  執行 repo 掃描
  │
  ↓ (JSON-RPC 2.0 over stdio)
backend/mcp_servers/local_repo_server.py
  ├── initialize      初始化 MCP 伺服器
  ├── tools/list      列出可用工具
  ├── tools/call      執行工具
  │   ├── repo_summary       取得 repo 摘要
  │   ├── read_file          讀取檔案
  │   ├── search_files       搜尋檔案
  │   ├── scan_static_app    掃描靜態應用
  │   ├── scan_repo_quality  品質掃描
  │   └── set_repo_root      設定 repo 路徑
  │
  ↓ (檔案系統操作)
你的 Repository
  ├── 讀取檔案
  ├── 搜尋內容
  ├── 分析結構
  └── 回傳結果
  │
  ↓ (結果往回傳)
backend/server.py → frontend/app.js → UI 顯示
```

---

## 技術棧

### 前端
- **HTML/CSS/JavaScript**：純 vanilla，無框架
- **瀏覽器 API**：fetch, localStorage, DOM
- **特色**：零建置步驟、小檔案大小

### 後端
- **Python 3.11+**：標準庫，無外部依賴
- **HTTP 伺服器**：`http.server.ThreadingHTTPServer`
- **MCP 客戶端**：自訂 `StdioMCPClient`
- **MCP 伺服器**：JSON-RPC 2.0 over stdio

### 協定
- **HTTP**：前端 ↔ 後端
- **JSON-RPC 2.0**：後端 ↔ MCP 伺服器
- **MCP (Model Context Protocol)**：工具探索和執行

---

## 模組依賴圖

```
frontend/index.html
  ↓ imports
frontend/app.js
  ↓ imports
frontend/styles.css

backend/server.py
  ↓ spawns
backend/mcp_servers/local_repo_server.py
  ↓ reads
config/mcp.config.json

tests/test_server.py
  ↓ imports
backend/server.py

tests/test_mcp_client.py
  ↓ imports
backend/server.py

.github/workflows/ci.yml
  ↓ runs
  ├── backend/server.py
  ├── backend/mcp_servers/local_repo_server.py
  └── tests/*.py
```

---

## 啟動流程

### 使用 `start.sh`

```
1. 使用者執行 ./start.sh
   ↓
2. 腳本執行 python3 backend/server.py
   ↓
3. backend/server.py 載入 config/mcp.config.json
   ↓
4. backend/server.py 啟動 HTTP 伺服器在 127.0.0.1:5173
   ↓
5. backend/server.py 設定靜態檔案服務目錄為 frontend/
   ↓
6. 使用者開啟瀏覽器 http://127.0.0.1:5173
   ↓
7. 瀏覽器載入 frontend/index.html
   ↓
8. frontend/index.html 載入 frontend/app.js 和 frontend/styles.css
   ↓
9. 使用者操作 UI（模擬評估或 MCP 連接）
```

### MCP 連接流程

```
1. 使用者點擊 "Connect MCP"
   ↓
2. frontend/app.js 發送 POST /api/mcp/connect
   ↓
3. backend/server.py 收到請求
   ↓
4. backend/server.py 從 config/mcp.config.json 讀取配置
   ↓
5. backend/server.py 使用 subprocess 啟動 backend/mcp_servers/local_repo_server.py
   ↓
6. backend/server.py 發送 JSON-RPC initialize 請求
   ↓
7. backend/mcp_servers/local_repo_server.py 回應 capabilities
   ↓
8. backend/server.py 發送 tools/list 請求
   ↓
9. backend/mcp_servers/local_repo_server.py 回應工具清單
   ↓
10. (如果有 repoRoot) backend/server.py 呼叫 set_repo_root 工具
    ↓
11. backend/server.py 回傳結果給 frontend/app.js
    ↓
12. frontend/app.js 更新 UI（顯示工具清單）
```

---

## 設計決策

### 為什麼用 Vanilla JS？

- ✅ 零建置步驟 → 更快迭代
- ✅ 無框架鎖定 → 更容易理解
- ✅ 小檔案大小 → 快速載入
- ✅ AI Agent 友善 → 沒有 JSX/Vue/React 的複雜度

### 為什麼用 MCP？

- ✅ 動態工具探索 → 儀表板不需預先知道工具
- ✅ 執行時期 repo 切換 → 無需重啟伺服器
- ✅ 可擴展性 → 未來可加入 GitHub、Jira 等 MCP 伺服器

### 為什麼用 Python 標準庫？

- ✅ 零依賴 → 不需 pip install
- ✅ 跨平台 → 任何有 Python 3 的系統都能跑
- ✅ 穩定 → 標準庫不會有破壞性變更

### 為什麼模擬評估？

- ✅ MVP 可演示功能 → 不需 API keys
- ✅ 無 token 成本 → 開發期間省錢
- ✅ 易於替換 → 未來可換成真實 LLM 呼叫

---

## 擴展點

### 未來可新增的功能

1. **真實 LLM 整合**
   - 替換 `frontend/app.js` 中的 `runBenchmark()` 和 `simulateTask()`
   - 呼叫 OpenAI/Anthropic API
   - 使用 LLM judge 評估品質

2. **更多 MCP 伺服器**
   - GitHub MCP server（PR、issue、討論）
   - Jira MCP server（ticket、sprint）
   - Slack MCP server（訊息、頻道）
   - 在 `config/mcp.config.json` 加入新伺服器

3. **資料持久化**
   - 目前：localStorage（瀏覽器限制 ~5MB）
   - 未來：SQLite / PostgreSQL
   - 當 localStorage 不足時才需要

4. **建置流程**
   - 目前：不需要建置
   - 未來：當需要 TypeScript、React、npm packages 時
   - 加入 webpack/vite/rollup

5. **認證授權**
   - 目前：無認證（本地使用）
   - 未來：如需多使用者共享
   - 加入 JWT / OAuth

---

## 測試策略

### 現有測試

1. **單元測試** (`tests/`)
   - `test_server.py`：路徑解析、結構化內容、指標計算
   - `test_mcp_client.py`：MCP 錯誤處理

2. **CI/CD** (`.github/workflows/ci.yml`)
   - Python 語法檢查
   - pytest 單元測試
   - 伺服器啟動測試

3. **結構測試** (`test-structure.sh`)
   - 檔案存在性
   - Python 語法
   - 配置檔案格式

### 測試缺口（未來可補充）

1. **前端測試**
   - 單元測試：Vitest / Jest
   - E2E 測試：Playwright / Cypress

2. **整合測試**
   - 前後端整合
   - MCP 連接流程
   - Repo 掃描功能

3. **效能測試**
   - 大型 repo 掃描時間
   - 並行請求處理
   - 記憶體使用

---

## 安全考量

### 已實作

1. **路徑遍歷防護**
   - `resolve_repo_path()` 檢查路徑
   - 不允許 `..` 或絕對路徑攻擊

2. **命令注入防護**
   - 使用 `subprocess.run(["cmd", "arg"])` 而非 `os.system()`
   - 不使用 shell=True

3. **JSON 解析**
   - 使用標準 `json` 模組
   - 捕捉解析錯誤

### 待加強（未來）

1. **輸入驗證**
   - 前端輸入消毒（防 XSS）
   - 後端參數驗證

2. **速率限制**
   - MCP 呼叫頻率限制
   - API 端點速率限制

3. **認證授權**
   - 目前無認證（僅本地使用）
   - 如需公開部署則需加入

---

## 效能特性

### 目前效能

- **MCP 處理程序啟動**：~100ms
- **工具呼叫**：~50-200ms
- **Repo 掃描（小型）**：~500ms
- **Repo 掃描（大型）**：~2-5s
- **前端渲染**：<50ms

### 最佳化機會

1. **連接池**
   - 目前：每次請求啟動新處理程序
   - 優化：重用 MCP 伺服器處理程序

2. **快取**
   - 目前：無快取
   - 優化：快取 `repo_summary` 結果

3. **並行處理**
   - 目前：單一請求處理
   - 優化：使用 asyncio 或多執行緒

---

## 維護清單

### 定期檢查

- [ ] CI/CD 測試狀態
- [ ] Python 版本相容性
- [ ] 瀏覽器相容性
- [ ] 文件更新

### 重構時機

- 當檔案 > 1000 行
- 當函式 > 50 行
- 當模組職責不清
- 當測試覆蓋率 < 70%

### 升級時機

- 當需要外部套件（加入 pip）
- 當需要建置步驟（加入 webpack）
- 當需要資料庫（加入 ORM）
- 當需要多使用者（加入認證）

---

**最後更新**：2026-05-27  
**架構版本**：v2.0（重構後）  
**維護者**：詳見 `CONTRIBUTING.md`

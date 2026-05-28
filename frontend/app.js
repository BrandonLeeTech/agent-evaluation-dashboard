/**
 * 檔案用途：前端應用程式主要入口點 (ES Module Orchestrator)
 * 功能：
 *   - 載入並整合 API、數據與 UI 模組
 *   - 管理全域與目前選取的評估紀錄狀態
 *   - 綁定 DOM 事件監聽器並協調功能運作
 */

import { fetchMcpStatus, fetchHistory, postHistory, connectMcpApi, runMcpRepoScanApi } from './js/api.js';
import { loadRuns, saveRuns, runBenchmark } from './js/benchmarks.js';
import {
  els,
  getConfig,
  setRunStatus,
  setMcpStatus,
  renderMcpTools,
  renderMcpEvidence,
  renderCurrentRun,
  showGlobalErrorBanner
} from './js/ui.js';

// 初始化全域狀態
let runs = loadRuns();
let selectedRunId = runs[0]?.id || null;

/**
 * 將本次新增的 runs 同步到本地快取與後端 SQLite。
 * @param {Array<object>} newRuns
 */
function recordRuns(newRuns) {
  if (!newRuns.length) {
    return;
  }

  runs = [...newRuns, ...runs];
  selectedRunId = newRuns[0]?.id || selectedRunId;
  saveRuns(runs);
  renderCurrentRun(selectedRunId, runs);

  newRuns.slice().reverse().forEach((run) => {
    void postHistory(run).catch(() => {});
  });
}

/**
 * 優先從後端載入歷史紀錄；若後端離線，回退到 localStorage。
 */
async function loadHistory() {
  try {
    const payload = await fetchHistory();
    const history = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.runs)
        ? payload.runs
        : [];
    runs = history;
    saveRuns(runs);
  } catch {
    runs = loadRuns();
  }

  selectedRunId = runs[0]?.id || null;
  renderCurrentRun(selectedRunId, runs);
}

/**
 * 處理模擬基準測試的點擊與執行流程
 */
function handleRun() {
  const config = getConfig();
  setRunStatus("Running", "running");
  els.runButton.disabled = true;

  window.setTimeout(() => {
    const run = runBenchmark(config);
    recordRuns([run]);
    setRunStatus("Complete", "complete");
    els.runButton.disabled = false;
  }, 320);
}

/**
 * 處理對照組與實驗組 Prompt (v1 / v2) 的快速模擬比對
 */
function handleCompare() {
  const base = getConfig({ prompt: "v1" });
  const candidate = getConfig({ prompt: "v2" });
  const baseRun = runBenchmark(base);
  const candidateRun = runBenchmark(candidate);
  recordRuns([candidateRun, baseRun]);
  setRunStatus("Compared", "complete");
}

/**
 * 清除所有保存在本地的評估紀錄
 */
function resetHistory() {
  runs = [];
  selectedRunId = null;
  saveRuns(runs);
  renderCurrentRun(selectedRunId, runs);
  setRunStatus("Ready", "");
}

/**
 * 從後端獲取 MCP 伺服器並更新其連線狀態
 */
async function loadMcpStatus() {
  try {
    const status = await fetchMcpStatus();
    const server = status.servers?.find((item) => item.name === els.mcpServerSelect.value) || status.servers?.[0];
    setMcpStatus(server?.running ? "Connected" : "Backend ready", server?.running ? "online" : "");
    els.mcpMeta.textContent = `${status.defaultServer || "no-server"} · ${status.servers?.length || 0} configured`;
  } catch (error) {
    setMcpStatus("Backend offline", "offline");
    els.mcpMeta.textContent = "Start with python3 backend/server.py";
    els.mcpOutput.textContent = error.message;
  }
}

/**
 * 連線至所選的 MCP 伺服器並初始化 Repo Root
 */
async function connectMcp() {
  const server = els.mcpServerSelect.value;
  const repoRoot = els.mcpRepoPathInput.value.trim();
  setMcpStatus("Connecting", "running");
  try {
    const payload = await connectMcpApi(server, repoRoot);
    renderMcpTools(payload.server, payload.tools);
    if (payload.root) {
      els.mcpMeta.textContent = `${payload.server} · ${payload.tools.length} tools · ${payload.root}`;
    }
    setMcpStatus("Connected", "online");
  } catch (error) {
    setMcpStatus("Connect failed", "offline");
    els.mcpOutput.textContent = error.message;
  }
}

/**
 * 觸發完整後端 Repo 掃描並載入真實評估指標
 */
async function runMcpRepoScan() {
  const server = els.mcpServerSelect.value;
  const repoRoot = els.mcpRepoPathInput.value.trim();
  setRunStatus("MCP Running", "running");
  setMcpStatus("Running scan", "running");
  els.mcpRepoScanButton.disabled = true;
  try {
    const payload = await runMcpRepoScanApi(server, repoRoot);
    recordRuns([payload.run]);
    renderMcpTools(payload.evidence.server.name, payload.evidence.tools);
    renderMcpEvidence(payload.evidence);
    setRunStatus("MCP Complete", "complete");
    setMcpStatus("Connected", "online");
  } catch (error) {
    setRunStatus("MCP Failed", "running");
    setMcpStatus("Scan failed", "offline");
    els.mcpOutput.textContent = error.message;
  } finally {
    els.mcpRepoScanButton.disabled = false;
  }
}

// 綁定 UI 事件接頭
els.runButton.addEventListener("click", handleRun);
els.compareButton.addEventListener("click", handleCompare);
els.resetButton.addEventListener("click", resetHistory);
els.mcpConnectButton.addEventListener("click", connectMcp);
els.mcpRepoScanButton.addEventListener("click", runMcpRepoScan);

els.historyTable.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-run-id]");
  if (!row) return;
  selectedRunId = row.dataset.runId;
  renderCurrentRun(selectedRunId, runs);
});

// 初始化頁面內容
await loadHistory();
void loadMcpStatus();

/**
 * 全域非預期錯誤攔截：
 * 當頁面上任何未被 try-catch 捕獲的 JS 錯誤或 Promise rejection 發生時，
 * 顯示錯誤復原橫幅，並提供一鍵清除本機快取的修復功能。
 */
function handleGlobalRecovery() {
  runs = [];
  selectedRunId = null;
  saveRuns(runs);
  renderCurrentRun(selectedRunId, runs);
  setRunStatus('Ready', '');
  location.reload();
}

window.addEventListener('error', (event) => {
  const message = event.message || 'An unexpected JavaScript error occurred.';
  showGlobalErrorBanner(`${message}`, handleGlobalRecovery);
});

window.addEventListener('unhandledrejection', (event) => {
  const message = event.reason?.message || String(event.reason) || 'An unhandled promise rejection occurred.';
  showGlobalErrorBanner(`${message}`, handleGlobalRecovery);
});

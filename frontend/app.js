/**
 * 檔案用途：前端應用程式主要入口點 (ES Module Orchestrator)
 * 功能：
 *   - 載入並整合 API、數據與 UI 模組
 *   - 管理全域與目前選取的評估紀錄狀態
 *   - 綁定 DOM 事件監聽器並協調功能運作
 */

import { fetchMcpStatus, fetchHistory, postHistory, connectMcpApi, runMcpRepoScanApi, runRepoBenchmarkApi, runGroundedQaApi } from './js/api.js';
import { loadRuns, saveRuns } from './js/benchmarks.js';
import {
  els,
  getModelLabel,
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
 * 更新頂部工具列的「目前使用模型」即時 Badge
 */
function updateActiveModelBadge() {
  const label = getModelLabel(els.modelSelect.value);
  document.getElementById('activeModelLabel').textContent = label;
  els.repoBenchmarkAiToggle.disabled = els.modelSelect.value === "local";
  if (els.repoBenchmarkAiToggle.disabled) els.repoBenchmarkAiToggle.checked = false;
}

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
    const payload = await connectMcpApi(server, repoRoot, true);
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

async function runRepoBenchmark() {
  const server = els.mcpServerSelect.value;
  const repoRoot = els.mcpRepoPathInput.value.trim();
  const model = els.repoBenchmarkAiToggle.checked ? els.modelSelect.value : "local";
  setRunStatus("Repo Benchmark Running", "running");
  setMcpStatus("Checking repository", "running");
  els.repoBenchmarkButton.disabled = true;
  try {
    const payload = await runRepoBenchmarkApi(server, repoRoot, model);
    recordRuns([payload.run]);
    renderMcpEvidence({
      server: payload.evidence.server,
      summary: payload.evidence.summary,
      quality: payload.evidence.quality,
      benchmark: {
        metrics: payload.run.metrics,
        evaluation: payload.run.evaluation,
        checks: payload.run.results,
      },
    });
    const incomplete = ["failed", "partial"].includes(payload.run.evaluation.modelStatus);
    setRunStatus(incomplete ? "Benchmark Partial" : "Benchmark Complete", incomplete ? "running" : "complete");
    setMcpStatus("Benchmark complete", "online");
  } catch (error) {
    setRunStatus("Benchmark Failed", "running");
    setMcpStatus("Benchmark failed", "offline");
    els.mcpOutput.textContent = error.message;
  } finally {
    els.repoBenchmarkButton.disabled = false;
  }
}

/**
 * 以真實 repo evidence 評估 QA agent 任務，不執行測試、不呼叫外部 AI。
 */
async function runGroundedQa() {
  const server = els.mcpServerSelect.value;
  const repoRoot = els.mcpRepoPathInput.value.trim();
  const query = els.qaTaskInput.value.trim();
  const model = els.modelSelect.value;
  setRunStatus("QA Evaluating", "running");
  setMcpStatus("Collecting evidence", "running");
  els.groundedQaButton.disabled = true;
  try {
    const payload = await runGroundedQaApi(server, repoRoot, query, model);
    recordRuns([payload.run]);
    renderMcpTools(payload.evidence.server.name, payload.evidence.tools);
    renderMcpEvidence(payload.evidence);
    setRunStatus("QA Complete", "complete");
    setMcpStatus("Connected", "online");
  } catch (error) {
    setRunStatus("QA Failed", "running");
    setMcpStatus("QA failed", "offline");
    els.mcpOutput.textContent = error.message;
  } finally {
    els.groundedQaButton.disabled = false;
  }
}

// 綁定 UI 事件接頭
els.resetButton.addEventListener("click", resetHistory);
els.mcpConnectButton.addEventListener("click", connectMcp);
els.mcpRepoScanButton.addEventListener("click", runMcpRepoScan);
els.repoBenchmarkButton.addEventListener("click", runRepoBenchmark);
els.groundedQaButton.addEventListener("click", runGroundedQa);

// 即時更新「目前使用模型」Badge（監聽 dropdown 變更）
els.modelSelect.addEventListener("change", updateActiveModelBadge);

els.historyTable.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-run-id]");
  if (!row) return;
  selectedRunId = row.dataset.runId;
  renderCurrentRun(selectedRunId, runs);
});

// 初始化頁面內容
updateActiveModelBadge();
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

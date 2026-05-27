/**
 * 檔案用途：前端應用程式主要入口點 (ES Module Orchestrator)
 * 功能：
 *   - 載入並整合 API、數據與 UI 模組
 *   - 管理全域與目前選取的評估紀錄狀態
 *   - 綁定 DOM 事件監聽器並協調功能運作
 */

import { fetchMcpStatus, connectMcpApi, runMcpRepoScanApi } from './js/api.js';
import { loadRuns, saveRuns, runBenchmark } from './js/benchmarks.js';
import {
  els,
  getConfig,
  setRunStatus,
  setMcpStatus,
  renderMcpTools,
  renderMcpEvidence,
  renderCurrentRun
} from './js/ui.js';

// 初始化全域狀態
let runs = loadRuns();
let selectedRunId = runs[0]?.id || null;

/**
 * 處理模擬基準測試的點擊與執行流程
 */
function handleRun() {
  const config = getConfig();
  setRunStatus("Running", "running");
  els.runButton.disabled = true;

  window.setTimeout(() => {
    const run = runBenchmark(config);
    runs.unshift(run);
    selectedRunId = run.id;
    saveRuns(runs);
    renderCurrentRun(selectedRunId, runs);
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
  runs.unshift(candidateRun, baseRun);
  selectedRunId = candidateRun.id;
  saveRuns(runs);
  renderCurrentRun(selectedRunId, runs);
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
    runs.unshift(payload.run);
    selectedRunId = payload.run.id;
    saveRuns(runs);
    renderCurrentRun(selectedRunId, runs);
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
renderCurrentRun(selectedRunId, runs);
loadMcpStatus();

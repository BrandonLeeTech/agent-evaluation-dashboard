/**
 * 檔案用途：前端 UI 渲染與 DOM 操作模組
 * 功能：
 *   - 集中管理 DOM 元素選取器
 *   - 處理日期、成本格式化與 HTML 消毒防護 (XSS)
 *   - 更新 MCP 與評估執行的 UI 狀態狀態列
 *   - 渲染評估列表、失敗分析與歷史紀錄表格 (包含 try-catch 防禦性渲染)
 *   - 提供全域錯誤復原橫幅 UI
 */

import { workflowProfiles, promptProfiles, modelProfiles } from './benchmarks.js';

export const els = {
  workflowSelect: document.getElementById("workflowSelect"),
  promptSelect: document.getElementById("promptSelect"),
  modelSelect: document.getElementById("modelSelect"),
  fallbackToggle: document.getElementById("fallbackToggle"),
  judgeToggle: document.getElementById("judgeToggle"),
  thresholdInput: document.getElementById("thresholdInput"),
  runButton: document.getElementById("runButton"),
  compareButton: document.getElementById("compareButton"),
  resetButton: document.getElementById("resetButton"),
  mcpServerSelect: document.getElementById("mcpServerSelect"),
  mcpRepoPathInput: document.getElementById("mcpRepoPathInput"),
  mcpConnectButton: document.getElementById("mcpConnectButton"),
  mcpRepoScanButton: document.getElementById("mcpRepoScanButton"),
  mcpStatusDot: document.getElementById("mcpStatusDot"),
  mcpStatusText: document.getElementById("mcpStatusText"),
  mcpMeta: document.getElementById("mcpMeta"),
  mcpBadge: document.getElementById("mcpBadge"),
  mcpToolsList: document.getElementById("mcpToolsList"),
  mcpOutput: document.getElementById("mcpOutput"),
  runStatus: document.getElementById("runStatus"),
  successMetric: document.getElementById("successMetric"),
  hallucinationMetric: document.getElementById("hallucinationMetric"),
  latencyMetric: document.getElementById("latencyMetric"),
  costMetric: document.getElementById("costMetric"),
  successMeter: document.getElementById("successMeter"),
  hallucinationMeter: document.getElementById("hallucinationMeter"),
  latencyNote: document.getElementById("latencyNote"),
  tokenNote: document.getElementById("tokenNote"),
  runMeta: document.getElementById("runMeta"),
  gateBadge: document.getElementById("gateBadge"),
  resultList: document.getElementById("resultList"),
  failureMeta: document.getElementById("failureMeta"),
  failureList: document.getElementById("failureList"),
  historyMeta: document.getElementById("historyMeta"),
  historyTable: document.getElementById("historyTable"),
};

// HTML 轉義消毒防止 XSS
export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// 格式化日期時間
export function formatDate(iso) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "Invalid Date";
  }
}

// 格式化費用
export function formatCost(cost) {
  if (typeof cost !== 'number') return "$0.00000";
  if (cost === 0) return "$0.00000";
  return `$${cost.toFixed(5)}`;
}

// 獲取各種配置項目的顯示標籤
export function getWorkflowLabel(key) {
  return workflowProfiles[key]?.label || key;
}

export function getPromptLabel(key) {
  return promptProfiles[key]?.label || key;
}

export function getModelLabel(key) {
  return modelProfiles[key]?.label || key;
}

// 更新當前評估執行狀態狀態列
export function setRunStatus(text, mode) {
  els.runStatus.textContent = text;
  els.runStatus.className = `status-pill ${mode || ""}`.trim();
}

// 更新 MCP 連接狀態狀態列
export function setMcpStatus(text, mode) {
  els.mcpStatusText.textContent = text;
  els.mcpStatusDot.className = `status-dot ${mode || ""}`.trim();
  els.mcpBadge.textContent = mode === "online" ? "Online" : mode === "running" ? "Running" : "Offline";
  els.mcpBadge.className = `gate-badge ${mode === "online" ? "pass" : mode === "running" ? "neutral" : "fail"}`;
}

// 渲染選中 MCP 伺服器之工具清單
export function renderMcpTools(server, tools) {
  els.mcpMeta.textContent = `${server} · ${tools.length} tools`;
  if (!tools.length) {
    els.mcpToolsList.innerHTML = `
      <div class="empty-copy">
        <strong>No tools</strong>
        <span>Awaiting MCP connection.</span>
      </div>
    `;
    return;
  }

  els.mcpToolsList.innerHTML = tools.map((tool) => `
    <div class="tool-item">
      <strong>${escapeHtml(tool.name)}</strong>
      <span>${escapeHtml(tool.description || "No description")}</span>
    </div>
  `).join("");
}

// 渲染 MCP 原始 JSON 輸出證據
export function renderMcpEvidence(evidence) {
  const compact = {
    server: evidence.server?.name,
    running: evidence.server?.running,
    root: evidence.quality?.root || evidence.summary?.root,
    tools: evidence.tools?.map((tool) => tool.name),
    file_count: evidence.summary?.file_count,
    extensions: evidence.summary?.extensions,
    quality: evidence.quality,
  };
  els.mcpOutput.textContent = JSON.stringify(compact, null, 2);
}

// 渲染單個任務執行結果列
export function renderResultRow(result) {
  const tags = [
    result.hallucinated ? "hallucination" : null,
    result.fallbackTriggered ? "fallback" : null,
    result.retryCount ? `${result.retryCount} retry` : null,
    ...(result.tags || []),
  ].filter(Boolean);

  const tagHtml = tags.length
    ? tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")
    : '<span class="small-muted">clean</span>';

  return `
    <div class="result-row">
      <div class="task-title">
        <strong>${escapeHtml(result.title)}</strong>
        <span>${escapeHtml(result.taskId)} · ${escapeHtml(result.category)}</span>
      </div>
      <span class="result-status ${result.passed ? "pass" : "fail"}">${result.passed ? "Pass" : "Fail"}</span>
      <span class="score-cell">${Math.round(result.score * 100)}%</span>
      <span class="small-muted">${(result.latency / 1000).toFixed(2)}s · ${result.tokens} tok</span>
      <div class="tag-list">${tagHtml}</div>
    </div>
  `;
}

// 渲染失敗項目原因分析
export function renderFailureAnalysis(run) {
  try {
    const failures = run.results.filter((result) => !result.passed);
    if (!failures.length) {
      els.failureList.innerHTML = `
        <div class="empty-copy">
          <strong>No failures</strong>
          <span>All selected benchmark tasks passed.</span>
        </div>
      `;
      return;
    }

    els.failureList.innerHTML = failures.map((failure) => {
      const severity = failure.hallucinated ? "high" : failure.score < 0.62 ? "medium" : "low";
      return `
        <div class="analysis-item">
          <header>
            <span>${escapeHtml(failure.reason)}</span>
            <span class="severity-${severity}">${severity}</span>
          </header>
          <p>${escapeHtml(failure.taskId)}: ${escapeHtml(failure.risk)}. Score ${Math.round(failure.score * 100)}%, fallback ${failure.fallbackTriggered ? "triggered" : "not triggered"}.</p>
        </div>
      `;
    }).join("");
  } catch (error) {
    console.error("Failed to render failure analysis:", error);
    els.failureList.innerHTML = `
      <div class="empty-copy">
        <strong style="color: var(--status-fail);">Analysis Error</strong>
        <span>Unable to process failure reports.</span>
      </div>
    `;
  }
}

// 獲取目前畫面上勾選的測試類別
export function getSelectedCategories() {
  return Array.from(document.querySelectorAll("input[name='category']:checked"))
    .map((input) => input.value);
}

// 從當前 UI 中擷取設定物件
export function getConfig(overrides = {}) {
  return {
    workflow: els.workflowSelect.value,
    prompt: els.promptSelect.value,
    model: els.modelSelect.value,
    fallback: els.fallbackToggle.checked,
    strictJudge: els.judgeToggle.checked,
    threshold: Number(els.thresholdInput.value || 80),
    categories: getSelectedCategories(),
    ...overrides,
  };
}

// 渲染空白無資料狀態
export function renderEmptyState() {
  els.successMetric.textContent = "--";
  els.hallucinationMetric.textContent = "--";
  els.latencyMetric.textContent = "--";
  els.costMetric.textContent = "--";
  els.successMeter.style.width = "0%";
  els.hallucinationMeter.style.width = "0%";
  els.latencyNote.textContent = "No run yet";
  els.tokenNote.textContent = "0 tokens";
  els.runMeta.textContent = "No benchmark run selected";
  els.failureMeta.textContent = "Current run";
  els.gateBadge.textContent = "No Gate";
  els.gateBadge.className = "gate-badge neutral";
  els.resultList.className = "result-list empty-state";
  els.resultList.innerHTML = `
    <div class="empty-copy">
      <strong>No run data</strong>
      <span>Awaiting task-level evaluation.</span>
    </div>
  `;
  els.failureList.innerHTML = `
    <div class="empty-copy">
      <strong>No failures</strong>
      <span>Awaiting failure categories.</span>
    </div>
  `;
}

// 渲染當前選定的評估執行詳細資料與歷程
export function renderCurrentRun(selectedRunId, runs) {
  try {
    const run = runs.find((item) => item.id === selectedRunId);
    if (!run) {
      renderEmptyState();
      renderHistory(runs, selectedRunId);
      return;
    }

    const { metrics, config } = run;
    els.successMetric.textContent = `${metrics.successRate}%`;
    els.hallucinationMetric.textContent = `${metrics.hallucinationRate}%`;
    els.latencyMetric.textContent = `${(metrics.avgLatency / 1000).toFixed(2)}s`;
    els.costMetric.textContent = formatCost(metrics.cost);
    els.successMeter.style.width = `${metrics.successRate}%`;
    els.hallucinationMeter.style.width = `${metrics.hallucinationRate}%`;
    els.latencyNote.textContent = `${metrics.passed}/${metrics.total} tasks passed`;
    els.tokenNote.textContent = `${metrics.tokens.toLocaleString()} tokens`;
    els.runMeta.textContent = `${getWorkflowLabel(config.workflow)} · ${getPromptLabel(config.prompt)} · ${getModelLabel(config.model)}`;
    els.failureMeta.textContent = `${metrics.failed} failed · ${metrics.fallbackRate}% fallback`;

    els.gateBadge.textContent = metrics.gatePassed ? "Gate Passed" : "Gate Failed";
    els.gateBadge.className = `gate-badge ${metrics.gatePassed ? "pass" : "fail"}`;

    els.resultList.className = "result-list";
    els.resultList.innerHTML = run.results.map(renderResultRow).join("");
    renderFailureAnalysis(run);
    renderHistory(runs, selectedRunId);
  } catch (error) {
    console.error("Failed to render current run:", error);
    els.resultList.className = "result-list empty-state";
    els.resultList.innerHTML = `
      <div class="empty-copy">
        <strong style="color: var(--status-fail);">Rendering Error</strong>
        <span>This run dataset may be corrupted. (${escapeHtml(error.message)})</span>
      </div>
    `;
    renderHistory(runs, selectedRunId);
  }
}

// 渲染歷史執行列表表格
export function renderHistory(runs, selectedRunId) {
  try {
    els.historyMeta.textContent = `${runs.length} saved runs`;
    if (!runs.length) {
      els.historyTable.innerHTML = `
        <tr>
          <td colspan="8">No saved benchmark runs.</td>
        </tr>
      `;
      return;
    }

    els.historyTable.innerHTML = runs.map((run) => {
      const workflow = escapeHtml(getWorkflowLabel(run.config?.workflow));
      const model = escapeHtml(getModelLabel(run.config?.model));
      const selected = run.id === selectedRunId ? "selected" : "";
      return `
        <tr class="${selected}" data-run-id="${run.id}">
          <td>${formatDate(run.createdAt)}</td>
          <td>${workflow}</td>
          <td>${model}</td>
          <td>${run.metrics?.successRate ?? 0}%</td>
          <td>${run.metrics?.hallucinationRate ?? 0}%</td>
          <td>${run.metrics?.fallbackRate ?? 0}%</td>
          <td>${formatCost(run.metrics?.cost ?? 0)}</td>
          <td>${run.metrics?.gatePassed ? "Pass" : "Fail"}</td>
        </tr>
      `;
    }).join("");
  } catch (error) {
    console.error("Failed to render history table:", error);
    els.historyTable.innerHTML = `
      <tr>
        <td colspan="8" style="color: var(--status-fail); text-align: center;">Error loading run history list.</td>
      </tr>
    `;
  }
}

// 顯示全域錯誤復原橫幅
export function showGlobalErrorBanner(message, onRecover) {
  let banner = document.getElementById("globalErrorBanner");
  if (banner) banner.remove();

  banner = document.createElement("div");
  banner.id = "globalErrorBanner";
  banner.style.cssText = `
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;
    width: 90%;
    max-width: 600px;
    background: rgba(220, 53, 69, 0.95);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
    color: #ffffff;
    padding: 16px 20px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    gap: 16px;
    animation: slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  `;

  if (!document.getElementById("bannerStyleSheet")) {
    const style = document.createElement("style");
    style.id = "bannerStyleSheet";
    style.textContent = `
      @keyframes slideDown {
        from { transform: translate(-50%, -50px); opacity: 0; }
        to { transform: translate(-50%, 0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  const content = document.createElement("div");
  content.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex-grow: 1;
  `;

  const title = document.createElement("strong");
  title.textContent = "Application Error Detected";
  title.style.fontSize = "15px";

  const msg = document.createElement("span");
  msg.textContent = message;
  msg.style.fontSize = "13px";
  msg.style.opacity = "0.9";

  content.appendChild(title);
  content.appendChild(msg);

  const actions = document.createElement("div");
  actions.style.cssText = `
    display: flex;
    gap: 8px;
    align-items: center;
    flex-shrink: 0;
  `;

  const recoverBtn = document.createElement("button");
  recoverBtn.textContent = "Reset Storage & Reload";
  recoverBtn.style.cssText = `
    background: #ffffff;
    color: #dc3545;
    border: none;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  `;
  
  recoverBtn.addEventListener("mouseover", () => {
    recoverBtn.style.background = "rgba(255, 255, 255, 0.9)";
    recoverBtn.style.transform = "scale(1.02)";
  });
  recoverBtn.addEventListener("mouseout", () => {
    recoverBtn.style.background = "#ffffff";
    recoverBtn.style.transform = "scale(1)";
  });
  recoverBtn.addEventListener("click", () => {
    if (onRecover) onRecover();
    banner.remove();
  });

  const closeBtn = document.createElement("button");
  closeBtn.innerHTML = "&times;";
  closeBtn.style.cssText = `
    background: transparent;
    color: #ffffff;
    border: none;
    font-size: 20px;
    cursor: pointer;
    padding: 0 4px;
    opacity: 0.8;
    line-height: 1;
  `;
  closeBtn.addEventListener("click", () => banner.remove());

  actions.appendChild(recoverBtn);
  actions.appendChild(closeBtn);

  banner.appendChild(content);
  banner.appendChild(actions);

  document.body.appendChild(banner);
}

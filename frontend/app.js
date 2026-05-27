/**
 * 檔案用途：前端應用程式邏輯
 * 功能：
 *   - 執行模擬的 AI 工作流程評估
 *   - 處理 MCP 連接和工具呼叫
 *   - 管理儀表板狀態和 UI 更新
 *   - 儲存執行歷史到 localStorage
 */

const benchmarkTasks = [
  {
    id: "REQ-001",
    category: "requirements",
    title: "Convert login requirement into edge-case tests",
    difficulty: 0.16,
    risk: "Missing negative auth cases",
  },
  {
    id: "REQ-002",
    category: "requirements",
    title: "Extract checkout acceptance criteria",
    difficulty: 0.2,
    risk: "Ambiguous payment states",
  },
  {
    id: "REQ-003",
    category: "requirements",
    title: "Detect conflicting password policy rules",
    difficulty: 0.26,
    risk: "Contradiction not flagged",
  },
  {
    id: "API-001",
    category: "api",
    title: "Generate API validation tests for 400 responses",
    difficulty: 0.18,
    risk: "Schema mismatch",
  },
  {
    id: "API-002",
    category: "api",
    title: "Find retry cases in async order creation",
    difficulty: 0.28,
    risk: "Retry loop",
  },
  {
    id: "API-003",
    category: "api",
    title: "Validate pagination boundary behavior",
    difficulty: 0.17,
    risk: "Boundary missed",
  },
  {
    id: "UI-001",
    category: "ui",
    title: "Map UI regression checks for profile settings",
    difficulty: 0.14,
    risk: "Weak visual assertion",
  },
  {
    id: "UI-002",
    category: "ui",
    title: "Find mobile layout risks in checkout flow",
    difficulty: 0.22,
    risk: "Viewport state missed",
  },
  {
    id: "UI-003",
    category: "ui",
    title: "Create accessibility checks for form errors",
    difficulty: 0.2,
    risk: "ARIA behavior missed",
  },
  {
    id: "AGT-001",
    category: "agent",
    title: "Evaluate tool selection for bug triage agent",
    difficulty: 0.24,
    risk: "Wrong tool path",
  },
  {
    id: "AGT-002",
    category: "agent",
    title: "Detect hallucinated test evidence",
    difficulty: 0.33,
    risk: "Fabricated evidence",
  },
  {
    id: "AGT-003",
    category: "agent",
    title: "Check fallback path when primary answer is invalid",
    difficulty: 0.29,
    risk: "Fallback not triggered",
  },
];

const workflowProfiles = {
  testcase: {
    label: "Testcase Generator",
    baseScore: 0.78,
    hallucinationRisk: 0.11,
    retryRisk: 0.12,
    tokenBase: 860,
    latencyBase: 1100,
  },
  qaFallback: {
    label: "QA Workflow + Fallback",
    baseScore: 0.82,
    hallucinationRisk: 0.08,
    retryRisk: 0.18,
    tokenBase: 1180,
    latencyBase: 1550,
  },
  agent: {
    label: "Task Agent",
    baseScore: 0.74,
    hallucinationRisk: 0.16,
    retryRisk: 0.22,
    tokenBase: 1420,
    latencyBase: 1900,
  },
  mcpRepo: {
    label: "MCP Repo Scan",
    baseScore: 0.9,
    hallucinationRisk: 0,
    retryRisk: 0,
    tokenBase: 0,
    latencyBase: 250,
  },
};

const promptProfiles = {
  v1: { label: "Prompt v1", score: 0, tokens: 0, hallucination: 0 },
  v2: { label: "Prompt v2", score: 0.06, tokens: 140, hallucination: -0.025 },
  v3: { label: "Prompt v3", score: 0.035, tokens: 250, hallucination: -0.04 },
  mcp: { label: "MCP tools", score: 0, tokens: 0, hallucination: 0 },
};

const modelProfiles = {
  local: {
    label: "Local Small",
    score: -0.07,
    tokenMultiplier: 0.82,
    latencyMultiplier: 0.72,
    costPerThousand: 0,
  },
  mini: {
    label: "Cloud Mini",
    score: 0.02,
    tokenMultiplier: 1,
    latencyMultiplier: 1,
    costPerThousand: 0.0004,
  },
  reasoning: {
    label: "Cloud Reasoning",
    score: 0.09,
    tokenMultiplier: 1.28,
    latencyMultiplier: 1.55,
    costPerThousand: 0.002,
  },
};

const failureReasons = [
  "Missing edge case",
  "Weak expected result",
  "Unverified assumption",
  "Hallucinated evidence",
  "Incomplete fallback",
  "Low confidence output",
];

const storageKey = "agent-evaluation-runs-v1";
let runs = loadRuns();
let selectedRunId = runs[0]?.id || null;

const els = {
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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function mulberry32(seed) {
  return function random() {
    let t = seed += 0x6d2b79f5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function loadRuns() {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRuns() {
  localStorage.setItem(storageKey, JSON.stringify(runs.slice(0, 20)));
}

function getSelectedCategories() {
  return Array.from(document.querySelectorAll("input[name='category']:checked"))
    .map((input) => input.value);
}

function getConfig(overrides = {}) {
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

function runBenchmark(config) {
  const workflow = workflowProfiles[config.workflow];
  const prompt = promptProfiles[config.prompt];
  const model = modelProfiles[config.model];
  const runId = `run-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const seed = Array.from(runId).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const random = mulberry32(seed);
  const tasks = benchmarkTasks.filter((task) => config.categories.includes(task.category));

  const results = tasks.map((task, index) => {
    const noise = (random() - 0.5) * 0.16;
    const judgePenalty = config.strictJudge ? 0.05 : 0;
    let score = workflow.baseScore + prompt.score + model.score - task.difficulty - judgePenalty + noise;
    score = clamp(score, 0.18, 0.98);

    let hallucinationChance = workflow.hallucinationRisk + prompt.hallucination - model.score * 0.12 + task.difficulty * 0.12;
    hallucinationChance = clamp(hallucinationChance, 0.015, 0.42);
    let hallucinated = random() < hallucinationChance;

    let fallbackTriggered = false;
    let retryCount = 0;
    if (config.fallback && (score < 0.78 || hallucinated || random() < workflow.retryRisk)) {
      fallbackTriggered = true;
      retryCount = 1 + Math.floor(random() * 2);
      score = clamp(score + 0.09 + random() * 0.07, 0.18, 0.99);
      if (hallucinated && random() > 0.34) hallucinated = false;
    }

    const passBar = config.strictJudge ? 0.79 : 0.72;
    const passed = score >= passBar && !hallucinated;
    const tokenJitter = 0.84 + random() * 0.32;
    const fallbackTokens = fallbackTriggered ? 430 + retryCount * 160 : 0;
    const tokens = Math.round((workflow.tokenBase + prompt.tokens + fallbackTokens) * model.tokenMultiplier * tokenJitter);
    const latencyJitter = 0.82 + random() * 0.42;
    const latency = Math.round((workflow.latencyBase + retryCount * 620) * model.latencyMultiplier * latencyJitter);
    const reason = passed ? "Validated" : failureReasons[(index + Math.floor(random() * failureReasons.length)) % failureReasons.length];

    return {
      taskId: task.id,
      category: task.category,
      title: task.title,
      risk: task.risk,
      score: Number(score.toFixed(3)),
      passed,
      hallucinated,
      fallbackTriggered,
      retryCount,
      tokens,
      latency,
      reason,
    };
  });

  const metrics = calculateMetrics(results, model.costPerThousand, config.threshold);

  return {
    id: runId,
    createdAt: new Date().toISOString(),
    config,
    metrics,
    results,
  };
}

function calculateMetrics(results, costPerThousand, threshold) {
  const total = results.length || 1;
  const passed = results.filter((result) => result.passed).length;
  const hallucinated = results.filter((result) => result.hallucinated).length;
  const fallback = results.filter((result) => result.fallbackTriggered).length;
  const tokens = results.reduce((sum, result) => sum + result.tokens, 0);
  const latency = results.reduce((sum, result) => sum + result.latency, 0) / total;
  const avgScore = results.reduce((sum, result) => sum + result.score, 0) / total;
  const successRate = Math.round((passed / total) * 100);
  const hallucinationRate = Math.round((hallucinated / total) * 100);
  const cost = tokens / 1000 * costPerThousand;

  return {
    total,
    passed,
    failed: total - passed,
    successRate,
    hallucinationRate,
    fallbackRate: Math.round((fallback / total) * 100),
    tokens,
    avgLatency: Math.round(latency),
    avgScore: Number(avgScore.toFixed(3)),
    cost: Number(cost.toFixed(5)),
    gatePassed: successRate >= threshold && hallucinationRate <= 10,
  };
}

function formatDate(iso) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatCost(cost) {
  if (cost === 0) return "$0.00000";
  return `$${cost.toFixed(5)}`;
}

function setRunStatus(text, mode) {
  els.runStatus.textContent = text;
  els.runStatus.className = `status-pill ${mode || ""}`.trim();
}

function getWorkflowLabel(key) {
  return workflowProfiles[key]?.label || key;
}

function getPromptLabel(key) {
  return promptProfiles[key]?.label || key;
}

function getModelLabel(key) {
  return modelProfiles[key]?.label || key;
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return payload;
}

function setMcpStatus(text, mode) {
  els.mcpStatusText.textContent = text;
  els.mcpStatusDot.className = `status-dot ${mode || ""}`.trim();
  els.mcpBadge.textContent = mode === "online" ? "Online" : mode === "running" ? "Running" : "Offline";
  els.mcpBadge.className = `gate-badge ${mode === "online" ? "pass" : mode === "running" ? "neutral" : "fail"}`;
}

function renderMcpTools(server, tools) {
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

function renderMcpEvidence(evidence) {
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

async function loadMcpStatus() {
  try {
    const status = await apiRequest("/api/mcp/status");
    const server = status.servers?.find((item) => item.name === els.mcpServerSelect.value) || status.servers?.[0];
    setMcpStatus(server?.running ? "Connected" : "Backend ready", server?.running ? "online" : "");
    els.mcpMeta.textContent = `${status.defaultServer || "no-server"} · ${status.servers?.length || 0} configured`;
  } catch (error) {
    setMcpStatus("Backend offline", "offline");
    els.mcpMeta.textContent = "Start with python3 backend/server.py";
    els.mcpOutput.textContent = error.message;
  }
}

async function connectMcp() {
  const server = els.mcpServerSelect.value;
  const repoRoot = els.mcpRepoPathInput.value.trim();
  setMcpStatus("Connecting", "running");
  try {
    const payload = await apiRequest("/api/mcp/connect", {
      method: "POST",
      body: JSON.stringify({ server, repoRoot }),
    });
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

async function runMcpRepoScan() {
  const server = els.mcpServerSelect.value;
  const repoRoot = els.mcpRepoPathInput.value.trim();
  setRunStatus("MCP Running", "running");
  setMcpStatus("Running scan", "running");
  els.mcpRepoScanButton.disabled = true;
  try {
    const payload = await apiRequest("/api/evaluations/repo-scan", {
      method: "POST",
      body: JSON.stringify({ server, repoRoot }),
    });
    runs.unshift(payload.run);
    selectedRunId = payload.run.id;
    saveRuns();
    renderCurrentRun();
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

function renderCurrentRun() {
  const run = runs.find((item) => item.id === selectedRunId);
  if (!run) {
    renderEmptyState();
    renderHistory();
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
  renderHistory();
}

function renderResultRow(result) {
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

function renderFailureAnalysis(run) {
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
}

function renderHistory() {
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
    const workflow = getWorkflowLabel(run.config.workflow);
    const model = getModelLabel(run.config.model);
    const selected = run.id === selectedRunId ? "selected" : "";
    return `
      <tr class="${selected}" data-run-id="${run.id}">
        <td>${formatDate(run.createdAt)}</td>
        <td>${workflow}</td>
        <td>${model}</td>
        <td>${run.metrics.successRate}%</td>
        <td>${run.metrics.hallucinationRate}%</td>
        <td>${run.metrics.fallbackRate}%</td>
        <td>${formatCost(run.metrics.cost)}</td>
        <td>${run.metrics.gatePassed ? "Pass" : "Fail"}</td>
      </tr>
    `;
  }).join("");
}

function renderEmptyState() {
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

function handleRun() {
  const config = getConfig();
  if (!config.categories.length) {
    setRunStatus("Select scope", "running");
    return;
  }

  setRunStatus("Running", "running");
  els.runButton.disabled = true;
  window.setTimeout(() => {
    const run = runBenchmark(config);
    runs.unshift(run);
    selectedRunId = run.id;
    saveRuns();
    renderCurrentRun();
    setRunStatus("Complete", "complete");
    els.runButton.disabled = false;
  }, 320);
}

function handleCompare() {
  const base = getConfig({ prompt: "v1" });
  const candidate = getConfig({ prompt: "v2" });
  const baseRun = runBenchmark(base);
  const candidateRun = runBenchmark(candidate);
  runs.unshift(candidateRun, baseRun);
  selectedRunId = candidateRun.id;
  saveRuns();
  renderCurrentRun();
  setRunStatus("Compared", "complete");
}

function resetHistory() {
  runs = [];
  selectedRunId = null;
  saveRuns();
  renderCurrentRun();
  setRunStatus("Ready", "");
}

els.runButton.addEventListener("click", handleRun);
els.compareButton.addEventListener("click", handleCompare);
els.resetButton.addEventListener("click", resetHistory);
els.mcpConnectButton.addEventListener("click", connectMcp);
els.mcpRepoScanButton.addEventListener("click", runMcpRepoScan);
els.historyTable.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-run-id]");
  if (!row) return;
  selectedRunId = row.dataset.runId;
  renderCurrentRun();
});

renderCurrentRun();
loadMcpStatus();

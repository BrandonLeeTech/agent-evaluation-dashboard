/**
 * 檔案用途：前端評估基準與數據邏輯模組
 * 功能：
 *   - 儲存評估任務、模型、Prompt 與 Workflow 配置檔
 *   - 執行模擬的 AI 基準測試評估
 *   - 計算評估數據指標 (成功率、延遲、費用等)
 *   - 管理 localStorage 歷史紀錄讀寫
 */

export const benchmarkTasks = [
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

export const workflowProfiles = {
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

export const promptProfiles = {
  v1: { label: "Prompt v1", score: 0, tokens: 0, hallucination: 0 },
  v2: { label: "Prompt v2", score: 0.06, tokens: 140, hallucination: -0.025 },
  v3: { label: "Prompt v3", score: 0.035, tokens: 250, hallucination: -0.04 },
  mcp: { label: "MCP tools", score: 0, tokens: 0, hallucination: 0 },
};

export const modelProfiles = {
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

export const failureReasons = [
  "Missing edge case",
  "Weak expected result",
  "Unverified assumption",
  "Hallucinated evidence",
  "Incomplete fallback",
  "Low confidence output",
];

export const storageKey = "agent-evaluation-runs-v1";

// 輔助數學函數
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function mulberry32(seed) {
  return function random() {
    let t = seed += 0x6d2b79f5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * 從 localStorage 載入所有評估紀錄
 */
export function loadRuns() {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * 將評估紀錄儲存至 localStorage
 */
export function saveRuns(runs) {
  localStorage.setItem(storageKey, JSON.stringify(runs));
}

/**
 * 計算單次評估運行的統計指標
 */
export function calculateMetrics(results, costPerThousand, threshold) {
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

/**
 * 執行模擬評估流程
 */
export function runBenchmark(config) {
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

/**
 * 檔案用途：前端 API 請求模組
 * 功能：封裝與後端 Python 伺服器的所有 HTTP 請求，提供給主入口與 UI 邏輯調用。
 */

export async function apiRequest(path, options = {}) {
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

/**
 * 獲取所有已設定的 MCP 伺服器狀態與健康狀態
 */
export function fetchMcpStatus() {
  return apiRequest("/api/mcp/status");
}

/**
 * 載入後端 SQLite 保存的歷史紀錄
 */
export function fetchHistory() {
  return apiRequest("/api/history");
}

/**
 * 將單次 run 寫入後端 SQLite 歷史紀錄
 * @param {object} run
 */
export function postHistory(run) {
  return apiRequest("/api/history", {
    method: "POST",
    body: JSON.stringify({ run }),
  });
}

/**
 * 連接指定 MCP 伺服器並更新其 Repository Root
 * @param {string} server
 * @param {string} repoRoot
 * @param {boolean} reconnect
 */
export function connectMcpApi(server, repoRoot, reconnect = false) {
  return apiRequest("/api/mcp/connect", {
    method: "POST",
    body: JSON.stringify({ server, repoRoot, reconnect }),
  });
}

/**
 * 呼叫指定 MCP 伺服器的工具
 * @param {string} server
 * @param {string} name
 * @param {object} argumentsObj
 */
export function callMcpToolApi(server, name, argumentsObj = {}) {
  return apiRequest("/api/mcp/call", {
    method: "POST",
    body: JSON.stringify({ server, name, arguments: argumentsObj }),
  });
}

/**
 * 執行完整的本地 Repository 品質與結構掃描
 * @param {string} server
 * @param {string} repoRoot
 */
export function runMcpRepoScanApi(server, repoRoot) {
  return apiRequest("/api/evaluations/repo-scan", {
    method: "POST",
    body: JSON.stringify({ server, repoRoot }),
  });
}

/**
 * 執行基於真實 repo evidence 的 QA agent 評估
 * @param {string} server
 * @param {string} repoRoot
 * @param {string} query
 */
export function runGroundedQaApi(server, repoRoot, query) {
  return apiRequest("/api/evaluations/grounded-qa", {
    method: "POST",
    body: JSON.stringify({ server, repoRoot, query }),
  });
}

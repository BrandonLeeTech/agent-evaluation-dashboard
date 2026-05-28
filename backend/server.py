#!/usr/bin/env python3
"""
檔案用途：HTTP 伺服器 + MCP 客戶端
功能：
  - 提供儀表板的 HTTP API 端點
  - 管理 MCP 伺服器連接（透過 stdio）
  - 處理工具探索和執行請求
  - 支援執行時期切換 repo 路徑
"""

import json
import os
import queue
import sqlite3
import subprocess
import threading
import time
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent  # 指向專案根目錄
CONFIG_PATH = ROOT / "config" / "mcp.config.json"
FRONTEND_DIR = ROOT / "frontend"
HISTORY_DB_PATH = ROOT / "data" / "eval_history.sqlite3"
HISTORY_LIMIT = 100
HISTORY_LOCK = threading.RLock()
HOST = "127.0.0.1"
PORT = int(os.environ.get("PORT", "5173"))


class MCPError(RuntimeError):
    pass


def _ensure_history_schema(connection):
    connection.execute("""
        CREATE TABLE IF NOT EXISTS runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id TEXT UNIQUE NOT NULL,
            created_at TEXT NOT NULL,
            payload TEXT NOT NULL
        )
    """)
    connection.execute("""
        CREATE INDEX IF NOT EXISTS idx_runs_created_at
        ON runs(created_at DESC, id DESC)
    """)


def _open_history_db():
    HISTORY_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(HISTORY_DB_PATH, timeout=30)
    connection.row_factory = sqlite3.Row
    _ensure_history_schema(connection)
    return connection


def load_history(limit=HISTORY_LIMIT):
    if limit <= 0 or not HISTORY_DB_PATH.exists():
        return []

    connection = None
    try:
        with HISTORY_LOCK:
            connection = sqlite3.connect(HISTORY_DB_PATH, timeout=30)
            connection.row_factory = sqlite3.Row
            rows = connection.execute(
                "SELECT payload FROM runs ORDER BY created_at DESC, id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        history = []
        for row in rows:
            try:
                history.append(json.loads(row["payload"]))
            except json.JSONDecodeError:
                continue
        return history
    except Exception:
        return []
    finally:
        if connection is not None:
            connection.close()


def save_history(run):
    if not isinstance(run, dict):
        raise ValueError("run is required")

    run_id = run.get("id")
    if not run_id:
        raise ValueError("run.id is required")

    created_at = run.get("createdAt") or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    payload = json.dumps(run, ensure_ascii=False)

    connection = None
    with HISTORY_LOCK:
        try:
            connection = _open_history_db()
            connection.execute("""
                INSERT INTO runs (run_id, created_at, payload)
                VALUES (?, ?, ?)
                ON CONFLICT(run_id) DO UPDATE SET
                    created_at = excluded.created_at,
                    payload = excluded.payload
            """, (str(run_id), created_at, payload))
            connection.execute("""
                DELETE FROM runs
                WHERE id NOT IN (
                    SELECT id
                    FROM runs
                    ORDER BY created_at DESC, id DESC
                    LIMIT ?
                )
            """, (HISTORY_LIMIT,))
            connection.commit()
        finally:
            if connection is not None:
                connection.close()

    return run


class StdioMCPClient:
    def __init__(self, name, config):
        self.name = name
        self.config = config
        self.process = None
        self.next_id = 1
        self.lock = threading.RLock()
        self.messages = queue.Queue()
        self.stderr_lines = []

    def ensure_started(self):
        with self.lock:
            if self.process and self.process.poll() is None:
                return

            command = self.config["command"]
            args = [self._resolve_arg(arg) for arg in self.config.get("args", [])]
            env = os.environ.copy()
            for key, value in self.config.get("env", {}).items():
                env[key] = str((ROOT / value).resolve()) if value == "." else value

            self.process = subprocess.Popen(
                [command, *args],
                cwd=ROOT,
                env=env,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )
            self.messages = queue.Queue()
            self.stderr_lines = []
            threading.Thread(target=self._read_stdout, daemon=True).start()
            threading.Thread(target=self._read_stderr, daemon=True).start()

            self._request_started("initialize", {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": {"name": "agent-evaluation-dashboard", "version": "0.2.0"},
            })
            self._notify_started("notifications/initialized", {})

    def list_tools(self):
        self.ensure_started()
        result = self._request_started("tools/list", {})
        return result.get("tools", [])

    def call_tool(self, name, arguments=None):
        self.ensure_started()
        return self._request_started("tools/call", {
            "name": name,
            "arguments": arguments or {},
        })

    def status(self):
        running = self.process is not None and self.process.poll() is None
        return {
            "name": self.name,
            "running": running,
            "command": self.config.get("command"),
            "args": self.config.get("args", []),
            "stderr": self.stderr_lines[-5:],
        }

    def _resolve_arg(self, arg):
        candidate = ROOT / arg
        return str(candidate) if candidate.exists() else arg

    def _read_stdout(self):
        if not self.process or not self.process.stdout:
            return
        for line in self.process.stdout:
            try:
                self.messages.put(json.loads(line))
            except json.JSONDecodeError:
                self.messages.put({"jsonrpc": "2.0", "error": {"message": line.strip()}})

    def _read_stderr(self):
        if not self.process or not self.process.stderr:
            return
        for line in self.process.stderr:
            self.stderr_lines.append(line.strip())
            self.stderr_lines = self.stderr_lines[-40:]

    def _request_started(self, method, params, timeout=10):
        with self.lock:
            if not self.process or self.process.poll() is not None:
                raise MCPError(f"MCP server {self.name} is not running")

            request_id = self.next_id
            self.next_id += 1
            payload = {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params}
            self._write(payload)

            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline:
                remaining = max(0.01, deadline - time.monotonic())
                try:
                    message = self.messages.get(timeout=remaining)
                except queue.Empty as exc:
                    raise MCPError(f"MCP request timed out: {method}") from exc

                if message.get("id") != request_id:
                    continue
                if "error" in message:
                    raise MCPError(message["error"].get("message", "Unknown MCP error"))
                return message.get("result", {})

            raise MCPError(f"MCP request timed out: {method}")

    def _notify_started(self, method, params):
        with self.lock:
            self._write({"jsonrpc": "2.0", "method": method, "params": params})

    def _write(self, payload):
        if not self.process or not self.process.stdin:
            raise MCPError(f"MCP server {self.name} stdin is not available")
        try:
            self.process.stdin.write(json.dumps(payload, separators=(",", ":")) + "\n")
            self.process.stdin.flush()
        except BrokenPipeError as exc:
            raise MCPError(f"MCP server {self.name} closed the pipe") from exc


class MCPRegistry:
    def __init__(self, config_path):
        self.config_path = config_path
        self.config = self._load_config()
        self.clients = {
            name: StdioMCPClient(name, server_config)
            for name, server_config in self.config.get("servers", {}).items()
        }

    def _load_config(self):
        with self.config_path.open("r", encoding="utf-8") as file:
            return json.load(file)

    @property
    def default_server(self):
        return self.config.get("defaultServer") or next(iter(self.clients), None)

    def get(self, name=None):
        server_name = name or self.default_server
        if server_name not in self.clients:
            raise MCPError(f"Unknown MCP server: {server_name}")
        return self.clients[server_name]

    def status(self):
        return {
            "defaultServer": self.default_server,
            "servers": [client.status() for client in self.clients.values()],
        }


registry = MCPRegistry(CONFIG_PATH)


def resolve_repo_path(repo_root):
    if not repo_root:
        return None

    candidate = Path(str(repo_root)).expanduser()
    if not candidate.is_absolute():
        candidate = ROOT / candidate
    candidate = candidate.resolve()

    if not candidate.exists() or not candidate.is_dir():
        raise MCPError(f"Repo path does not exist or is not a directory: {candidate}")

    return str(candidate)


def structured_content(result):
    if "structuredContent" in result:
        return result["structuredContent"]

    content = result.get("content") or []
    if content and content[0].get("type") == "text":
        try:
            return json.loads(content[0].get("text", "{}"))
        except json.JSONDecodeError:
            return {"text": content[0].get("text", "")}
    return result


def make_result(task_id, title, passed, score, reason, latency, tags=None):
    return {
        "taskId": task_id,
        "category": "mcp",
        "title": title,
        "risk": reason,
        "score": score,
        "passed": passed,
        "hallucinated": False,
        "fallbackTriggered": False,
        "retryCount": 0,
        "tokens": 0,
        "latency": latency,
        "reason": "Validated" if passed else reason,
        "tags": tags or [],
    }


def calculate_metrics(results, threshold=80):
    total = len(results) or 1
    passed = len([item for item in results if item["passed"]])
    latency = sum(item["latency"] for item in results) / total
    success_rate = round(passed / total * 100)
    return {
        "total": total,
        "passed": passed,
        "failed": total - passed,
        "successRate": success_rate,
        "hallucinationRate": 0,
        "fallbackRate": 0,
        "tokens": 0,
        "avgLatency": round(latency),
        "avgScore": round(sum(item["score"] for item in results) / total, 3),
        "cost": 0,
        "gatePassed": success_rate >= threshold,
    }


def run_repo_scan(server_name=None, repo_root=None):
    started = time.monotonic()
    client = registry.get(server_name)
    resolved_root = resolve_repo_path(repo_root)
    root_change = None
    if resolved_root:
        root_change = structured_content(client.call_tool("set_repo_root", {"path": resolved_root}))

    tools = client.list_tools()
    summary = structured_content(client.call_tool("repo_summary", {}))
    quality = structured_content(client.call_tool("scan_repo_quality", {}))
    elapsed = max(60, round((time.monotonic() - started) * 1000))
    latency = max(40, round(elapsed / 5))
    issues = quality.get("issues", [])
    high_issues = [issue for issue in issues if issue.get("severity") == "high"]
    medium_issues = [issue for issue in issues if issue.get("severity") == "medium"]
    target_root = quality.get("root") or summary.get("root")

    results = [
        make_result(
            "MCP-001",
            "Initialize MCP server and discover tools",
            len(tools) >= 5,
            0.96 if len(tools) >= 5 else 0.35,
            "Tool discovery failed",
            latency,
            [f"{len(tools)} tools"],
        ),
        make_result(
            "MCP-002",
            "Resolve target repository path",
            bool(target_root) and Path(target_root).exists(),
            0.94 if bool(target_root) and Path(target_root).exists() else 0.35,
            "Target repository path could not be resolved",
            latency,
            [Path(target_root).name if target_root else "unknown"],
        ),
        make_result(
            "MCP-003",
            "Check repo documentation and dependencies",
            bool(quality.get("readme_files")) and bool(quality.get("dependency_files")),
            0.9 if quality.get("readme_files") and quality.get("dependency_files") else 0.56,
            "Missing README or dependency manifest",
            latency,
        ),
        make_result(
            "MCP-004",
            "Detect test coverage signal",
            bool(quality.get("test_files")),
            0.9 if quality.get("test_files") else 0.44,
            "No test files or test directories detected",
            latency,
            [f"{len(quality.get('test_files', []))} tests"],
        ),
        make_result(
            "MCP-005",
            "Detect CI and environment hygiene",
            bool(quality.get("ci_files")),
            0.86 if quality.get("ci_files") else 0.52,
            "No CI workflow detected",
            latency,
            [f"{len(quality.get('ci_files', []))} ci"],
        ),
        make_result(
            "MCP-006",
            "Evaluate repo risk level",
            not high_issues and len(medium_issues) <= 2,
            0.88 if not high_issues and len(medium_issues) <= 2 else 0.58,
            "; ".join(issue.get("message", "Unknown issue") for issue in issues[:3]) or "Risk scan clean",
            latency,
            [f"{len(issues)} issues"],
        ),
    ]

    run = {
        "id": f"mcp-{round(time.time() * 1000)}",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "config": {
            "workflow": "mcpRepo",
            "prompt": "mcp",
            "model": "local",
            "fallback": False,
            "strictJudge": False,
            "threshold": 80,
            "categories": ["mcp"],
        },
        "metrics": calculate_metrics(results),
        "results": results,
    }

    return {
        "run": run,
        "evidence": {
            "server": client.status(),
            "rootChange": root_change,
            "tools": tools,
            "summary": summary,
            "quality": quality,
        },
    }


class DashboardHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # 設定靜態檔案服務目錄為 frontend/
        super().__init__(*args, directory=str(FRONTEND_DIR), **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/health":
            self.send_json({"status": "ok"})
            return
        if parsed.path == "/api/history":
            self.send_json(load_history())
            return
        if parsed.path == "/api/mcp/status":
            self.send_json(registry.status())
            return
        if parsed.path == "/api/mcp/tools":
            query = urllib.parse.parse_qs(parsed.query)
            server_name = query.get("server", [None])[0]
            tools = registry.get(server_name).list_tools()
            self.send_json({"server": server_name or registry.default_server, "tools": tools})
            return
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        try:
            body = self.read_json_body()
            if parsed.path == "/api/history":
                run = body.get("run")
                save_history(run)
                self.send_json({"status": "ok", "run": run})
                return
            if parsed.path == "/api/mcp/connect":
                server_name = body.get("server")
                client = registry.get(server_name)
                resolved_root = resolve_repo_path(body.get("repoRoot"))
                root_change = None
                if resolved_root:
                    root_change = structured_content(client.call_tool("set_repo_root", {"path": resolved_root}))
                tools = client.list_tools()
                self.send_json({
                    "server": server_name or registry.default_server,
                    "tools": tools,
                    "root": root_change.get("root") if root_change else None,
                    "rootChange": root_change,
                })
                return
            if parsed.path == "/api/mcp/call":
                server_name = body.get("server")
                tool_name = body.get("name")
                arguments = body.get("arguments") or {}
                result = registry.get(server_name).call_tool(tool_name, arguments)
                self.send_json({"server": server_name or registry.default_server, "result": result})
                return
            if parsed.path == "/api/evaluations/repo-scan":
                self.send_json(run_repo_scan(body.get("server"), body.get("repoRoot")))
                return
            self.send_error(404, "API endpoint not found")
        except ValueError as exc:
            self.send_json({"error": str(exc)}, status=400)
        except Exception as exc:
            self.send_json({"error": str(exc)}, status=500)

    def read_json_body(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length == 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        try:
            return json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ValueError("Invalid JSON body") from exc

    def send_json(self, payload, status=200):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main():
    _open_history_db().close()
    server = ThreadingHTTPServer((HOST, PORT), DashboardHandler)
    print(f"Dashboard running at http://{HOST}:{PORT}")
    print("Press Ctrl+C to stop.")
    server.serve_forever()


if __name__ == "__main__":
    main()

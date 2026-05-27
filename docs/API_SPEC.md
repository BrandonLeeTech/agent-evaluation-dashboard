# API Specification - Agent Evaluation Dashboard

This document details the HTTP API endpoints exposed by `backend/server.py` and consumed by the frontend client.

All request and response payloads are in JSON format. The base URL is `http://127.0.0.1:5173`.

---

## Endpoint Index

| Method | Endpoint | Description | Authentication |
|---|---|---|---|
| **GET** | [`/api/health`](#/api/health) | Retrieve backend health status | None |
| **GET** | [`/api/mcp/status`](#/api/mcp/status) | Retrieve status of all configured MCP servers | None |
| **GET** | [`/api/mcp/tools`](#/api/mcp/tools) | Retrieve the list of tools available on a specific MCP server | None |
| **POST** | [`/api/mcp/connect`](#/api/mcp/connect) | Initialize/connect to an MCP server and set its repository root | None |
| **POST** | [`/api/mcp/call`](#/api/mcp/call) | Invoke a tool on a specific MCP server | None |
| **POST** | [`/api/evaluations/repo-scan`](#/api/evaluations/repo-scan) | Run a complete static repository scan and generate metrics | None |

---

## GET Endpoints

### `/api/health`

Checks if the HTTP backend is running and healthy.

- **Request Query**: None
- **Response Status**: `200 OK`
- **Response Body**:
  ```json
  {
    "status": "ok"
  }
  ```

---

### `/api/mcp/status`

Gets the status (running/not running, startup command, arguments, and recent stderr logs) of all registered MCP servers.

- **Request Query**: None
- **Response Status**: `200 OK`
- **Response Body**:
  ```json
  {
    "defaultServer": "local-repo",
    "servers": [
      {
        "name": "local-repo",
        "running": true,
        "command": "python3",
        "args": ["backend/mcp_servers/local_repo_server.py"],
        "stderr": [
          "Starting Local Repo MCP Server...",
          "Server initialized."
        ]
      }
    ]
  }
  ```

---

### `/api/mcp/tools`

Retrieves the list of discovered tools for the specified MCP server.

- **Request Query**:
  * `server` (string, optional): The name of the target MCP server. Defaults to the registry's default server.
- **Response Status**: `200 OK`
- **Response Body**:
  ```json
  {
    "server": "local-repo",
    "tools": [
      {
        "name": "repo_summary",
        "description": "Get high-level summary of the repository",
        "inputSchema": {
          "type": "object",
          "properties": {}
        }
      },
      {
        "name": "read_file",
        "description": "Read file content with optional line limits",
        "inputSchema": {
          "type": "object",
          "properties": {
            "path": { "type": "string" },
            "offset": { "type": "number" },
            "limit": { "type": "number" }
          },
          "required": ["path"]
        }
      }
    ]
  }
  ```

---

## POST Endpoints

### `/api/mcp/connect`

Ensures the specified MCP server is started, dynamically updates its working repository root path, and returns the tool registry.

- **Request Body**:
  ```json
  {
    "server": "local-repo",
    "repoRoot": "."
  }
  ```
- **Response Status**: `200 OK`
- **Response Body**:
  ```json
  {
    "server": "local-repo",
    "tools": [ ... ],
    "root": "/Users/brandonlee/dev/Agent_Evaluation_Dashboard",
    "rootChange": {
      "status": "ok",
      "root": "/Users/brandonlee/dev/Agent_Evaluation_Dashboard"
    }
  }
  ```

---

### `/api/mcp/call`

Executes a tool on the selected MCP server with the provided arguments.

- **Request Body**:
  ```json
  {
    "server": "local-repo",
    "name": "read_file",
    "arguments": {
      "path": "frontend/index.html",
      "offset": 1,
      "limit": 10
    }
  }
  ```
- **Response Status**: `200 OK`
- **Response Body**:
  ```json
  {
    "server": "local-repo",
    "result": {
      "content": [
        {
          "type": "text",
          "text": "..."
        }
      ]
    }
  }
  ```

---

### `/api/evaluations/repo-scan`

Instructs the backend to run multiple MCP tools (`set_repo_root`, `repo_summary`, and `scan_repo_quality`) sequentially to evaluate the repository configuration and health status.

- **Request Body**:
  ```json
  {
    "server": "local-repo",
    "repoRoot": "."
  }
  ```
- **Response Status**: `200 OK`
- **Response Body**:
  ```json
  {
    "run": {
      "id": "mcp-1716800000000",
      "createdAt": "2026-05-27T09:00:00Z",
      "config": {
        "workflow": "mcpRepo",
        "prompt": "mcp",
        "model": "local",
        "fallback": false,
        "strictJudge": false,
        "threshold": 80,
        "categories": ["mcp"]
      },
      "metrics": {
        "total": 6,
        "passed": 5,
        "failed": 1,
        "successRate": 83.3,
        "avgLatency": 250,
        "avgScore": 0.85,
        "cost": 0,
        "gatePassed": true
      },
      "results": [
        {
          "taskId": "MCP-001",
          "title": "Initialize MCP server and discover tools",
          "passed": true,
          "score": 0.96,
          "reason": "Success",
          "latency": 250,
          "tags": ["6 tools"]
        }
      ]
    },
    "evidence": {
      "server": {
        "name": "local-repo",
        "running": true,
        "command": "python3",
        "args": ["backend/mcp_servers/local_repo_server.py"],
        "stderr": []
      },
      "rootChange": { "status": "ok", "root": "/path/to/repo" },
      "tools": [ ... ],
      "summary": { ... },
      "quality": { ... }
    }
  }
  ```

---

## Error Handling

If an exception occurs during POST processing, the API returns a structured JSON error response.

- **Response Status**: `500 Internal Server Error` (or other appropriate code)
- **Response Body**:
  ```json
  {
    "error": "Human-readable error description or exception message"
  }
  ```

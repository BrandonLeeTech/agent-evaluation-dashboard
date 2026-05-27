# Claude AI Collaboration Guide

## Project Overview

**Agent Evaluation Dashboard** — MVP for AI workflow reliability testing.

This is a lightweight dashboard for evaluating AI agent workflows. It runs simulated benchmarks in the browser and includes an MCP (Model Context Protocol) integration for repository scanning.

**Core Purpose:**
- Measure AI workflow reliability (success rate, hallucination rate, latency, token cost)
- Test different model presets and prompt versions
- Scan repositories through MCP tools
- Provide regression testing gates

---

## Quick Start

### Static Mode (Browser Only)
```bash
open frontend/index.html
```

### MCP Mode (Full Features)
```bash
python3 backend/server.py
# Then open: http://127.0.0.1:5173
```

---

## Architecture

```
Browser Dashboard (frontend/index.html + frontend/app.js + frontend/styles.css)
    ↓ HTTP API
backend/server.py (Flask-like HTTP server)
    ↓ JSON-RPC over stdio
StdioMCPClient
    ↓
backend/mcp_servers/local_repo_server.py
    ↓
Repo tools: repo_summary, read_file, search_files, scan_repo_quality
```

**Key Files:**
- `frontend/index.html` — Dashboard UI
- `frontend/app.js` — Frontend logic, simulated workflow runner
- `backend/server.py` — HTTP server + MCP client
- `backend/mcp_servers/local_repo_server.py` — MCP server with repo scanning tools
- `config/mcp.config.json` — MCP server configuration

---

## MCP (Model Context Protocol)

**What is MCP?**
MCP is a protocol for connecting AI models to external tools and data sources. Think of it like an API that AI agents can discover and call.

**In This Project:**
- MCP server provides tools: `repo_summary`, `read_file`, `search_files`, `scan_repo_quality`, `set_repo_root`
- Dashboard connects to MCP server via HTTP → stdio transport
- Allows dynamic repository scanning without hardcoded paths

**MCP Flow:**
1. Dashboard sends HTTP POST to `/api/mcp/connect` with `repoRoot` path
2. `backend/server.py` spawns MCP server subprocess (`backend/mcp_servers/local_repo_server.py`)
3. MCP server exposes tools via JSON-RPC
4. Dashboard calls tools via `/api/mcp/call` endpoint
5. Results return as structured JSON

---

## Token-Efficient AI Collaboration

### ⚠️ CRITICAL: Minimize Token Waste

When working with AI on this project, follow these rules to avoid burning tokens:

### 1. **Never Paste Entire Files in Chat**

❌ **BAD:**
```
User: "Here's the code [pastes 500 lines of frontend/app.js]"
AI: "I see the code..."
```

✅ **GOOD:**
```
User: "Check the benchmark runner in frontend/app.js lines 150-200"
AI: Uses read_file(path="frontend/app.js", offset=150, limit=50)
```

### 2. **Use File Tools, Not Copy-Paste**

The AI can read files directly:
```python
# AI should use these tools:
read_file(path="frontend/app.js", offset=1, limit=100)  # Read specific sections
search_files(pattern="function runBenchmark", target="content")  # Find code
patch(path="frontend/app.js", old_string="...", new_string="...")  # Edit directly
```

### 3. **Ask Specific Questions**

❌ **BAD (wastes tokens):**
```
"Review my entire codebase and tell me everything"
```

✅ **GOOD (targeted):**
```
"Check if the MCP connection error handling in backend/server.py is robust"
"Add input validation to the /api/evaluations/repo-scan endpoint"
```

### 4. **Use Session Management**

- Start new session (`/new`) for different tasks
- Don't accumulate 50+ exchanges in one conversation
- Use `session_search` to recall past solutions instead of re-asking

### 5. **Delegate Complex Tasks**

For multi-step work:
```python
delegate_task(
    goal="Refactor the MCP client to support WebSocket transport",
    context="Current implementation is in backend/server.py lines 23-146",
    toolsets=["file", "terminal"]
)
```

The subagent's internal tool calls won't pollute your context.

### 6. **Reference by Location, Not Content**

❌ **BAD:**
```
"Here's the function: [pastes 50 lines]"
"Change this: [pastes 50 lines]"
```

✅ **GOOD:**
```
"The runBenchmark function in frontend/app.js around line 180"
"The MCPRegistry class in backend/server.py"
```

---

## Common Tasks & Token-Efficient Patterns

### Adding a New MCP Tool

**Instead of:**
```
User: [pastes entire local_repo_server.py]
User: "Add a new tool that does X"
```

**Do this:**
```
User: "Add a 'search_by_regex' tool to backend/mcp_servers/local_repo_server.py"
AI: read_file("backend/mcp_servers/local_repo_server.py", offset=200, limit=100)
AI: patch(...) to add the new tool
```

### Debugging MCP Connection Issues

**Instead of:**
```
User: "It doesn't work" [pastes logs, code, everything]
```

**Do this:**
```
User: "MCP connection fails with timeout. Check error handling in backend/server.py StdioMCPClient._request_started"
AI: read_file("backend/server.py", offset=108, limit=30)
```

### Refactoring Frontend Code

**Instead of:**
```
User: [pastes entire frontend/app.js 600 lines]
User: "Make it cleaner"
```

**Do this:**
```
User: "Extract the benchmark result rendering logic in frontend/app.js into a separate function"
AI: search_files("function.*results", "frontend/app.js")
AI: patch(old_string="...", new_string="...")
```

---

## Development Workflow

### Frontend Changes
```bash
# Edit frontend/index.html, frontend/app.js, or frontend/styles.css
# Refresh browser (no build step needed)
open frontend/index.html
```

### Backend Changes
```bash
# Edit backend/server.py or backend/mcp_servers/*.py
# Restart server
python3 backend/server.py
```

### MCP Server Development
```bash
# Test MCP server directly (stdio mode)
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | python3 backend/mcp_servers/local_repo_server.py
```

---

## Project Conventions

### Code Style
- **Python:** PEP 8, 4-space indent
- **JavaScript:** 2-space indent, camelCase
- **JSON:** 2-space indent

### File Organization
```
/
├── frontend/index.html          # Main UI
├── frontend/app.js              # Frontend logic
├── frontend/styles.css          # Styling
├── backend/server.py           # HTTP + MCP gateway
├── config/mcp.config.json     # MCP server config
├── backend/mcp_servers/
│   └── local_repo_server.py   # MCP server implementation
└── README.md           # User documentation
```

### Error Handling
- Always validate user input (repo paths, tool arguments)
- Return structured JSON errors: `{"error": "message"}`
- Log stderr from MCP servers (see `StdioMCPClient._read_stderr`)

### Testing Strategy
- Manual testing via dashboard UI
- MCP tools can be tested via direct stdio calls
- No automated test suite yet (good future addition)

---

## Common Pitfalls

### 1. **Path Resolution Issues**
MCP server resolves paths relative to `ROOT`. Always use:
```python
safe_path(relative_path)  # Prevents path traversal
```

### 2. **MCP Timeout Issues**
Default timeout is 10s. For slow operations:
```python
self._request_started(method, params, timeout=30)
```

### 3. **Stderr Output Lost**
MCP stderr is captured but limited to last 40 lines. Check:
```python
client.status()["stderr"]
```

### 4. **Race Conditions in MCP Client**
Always use `with self.lock:` when accessing process state.

---

## Future Enhancements

Good next steps (low token cost to implement):

1. **Add GitHub MCP server** — scan remote repos
2. **Real LLM integration** — replace simulated benchmarks
3. **JSON benchmark files** — load test cases from files
4. **CI gate mode** — exit with non-zero on failure
5. **Export results** — JSON/CSV download
6. **Automated tests** — pytest for MCP tools

---

## Token Usage Estimates

| Task | Token Cost (approx) |
|------|---------------------|
| Add new MCP tool | 500-1000 |
| Fix bug in backend/server.py | 300-800 |
| Refactor frontend component | 600-1500 |
| Add new API endpoint | 400-1000 |
| Full codebase review | 5000-10000 ❌ |

**Golden Rule:** Never exceed 2000 tokens for a single task. If you do, you're doing it wrong.

---

## Questions to Ask Before Starting

Before engaging AI, ask yourself:

1. **Can I point to a specific file/function/line?** (If no, search first)
2. **Do I need the AI to see the whole file?** (Usually no, use offset/limit)
3. **Is this a multi-step task?** (If yes, use delegate_task)
4. **Have I solved this before?** (If yes, use session_search)

---

## Emergency: Context Too Large

If conversation context grows too large:

```bash
/new          # Start fresh session
/compress     # Manually trigger compression
```

Or use execute_code for bulk operations:
```python
execute_code(code="""
from hermes_tools import read_file, patch
# Do many file operations here
# Only final result returns to context
print('Done')
""")
```

---

## Summary

- **This is a lightweight MCP-based dashboard**
- **MCP = tool discovery + dynamic repo scanning**
- **Always use file tools instead of pasting code**
- **Keep conversations focused and short**
- **Delegate complex multi-step tasks**

Following these rules will keep your token costs low and your development fast.

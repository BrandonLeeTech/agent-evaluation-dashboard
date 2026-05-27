# AI Agent Collaboration Guide

## For Autonomous AI Agents Working on This Project

This file provides context for AI agents (Claude Code, Codex, Hermes, OpenCode, etc.) working on the Agent Evaluation Dashboard.

---

## Project Identity

**Name:** Agent Evaluation Dashboard  
**Type:** AI workflow reliability testing MVP  
**Stack:** Vanilla JS frontend + Python HTTP server + MCP integration  
**Purpose:** Measure AI agent performance (success rate, latency, token cost, hallucinations)

---

## Critical Context

### What This Project Does

1. **Simulated Benchmarks** — Run fake AI workflow evaluations in browser (no tokens used)
2. **MCP Integration** — Scan real repositories using Model Context Protocol
3. **Metrics Dashboard** — Display success rate, latency, token cost, failure analysis
4. **Regression Gates** — Pass/fail based on configurable thresholds

### What This Project Does NOT Do

- ❌ Train models
- ❌ Call OpenAI/Anthropic APIs (yet — future feature)
- ❌ Store data in database (uses localStorage)
- ❌ Require authentication
- ❌ Have a build step (plain HTML/JS/CSS)

---

## Architecture Overview

```
┌──────────────────────────────────────┐
│  Browser (frontend/index.html)       │
│  ├─ frontend/app.js                  │
│  └─ frontend/styles.css              │
└─────────────┬────────────────────────┘
              │ HTTP (fetch)
              ↓
┌──────────────────────────────────────┐
│  backend/server.py                   │
│  ├─ MCPRegistry                      │
│  ├─ StdioMCPClient                   │
│  └─ API endpoints                    │
└─────────────┬────────────────────────┘
              │ JSON-RPC over stdio
              ↓
┌──────────────────────────────────────┐
│  backend/mcp_servers/local_repo...   │
│  ├─ repo_summary                     │
│  ├─ read_file                        │
│  ├─ search_files                     │
│  ├─ scan_repo_quality                │
│  └─ set_repo_root                    │
└──────────────────────────────────────┘
```

---

## Key Technical Decisions

### Why MCP?

MCP (Model Context Protocol) allows:
- **Dynamic tool discovery** — dashboard doesn't need to know tools in advance
- **Runtime repo switching** — scan different repos without restarting
- **Extensibility** — add GitHub/Jira/etc. MCP servers later

### Why Vanilla JS?

- Zero build step → faster iteration
- No framework lock-in
- Tiny bundle size
- Easy for AI agents to understand (no JSX/Vue/React complexity)

### Why Simulated Benchmarks?

- MVP can demo functionality without API keys
- No token costs during development
- Easy to replace with real LLM calls later

---

## File Reference

| File | Purpose | Lines | Complexity |
|------|---------|-------|------------|
| `frontend/index.html` | UI structure | ~200 | Low |
| `frontend/app.js` | Frontend logic | ~600 | Medium |
| `frontend/styles.css` | Styling | ~300 | Low |
| `backend/server.py` | HTTP + MCP client | ~430 | Medium |
| `backend/mcp_servers/local_repo_server.py` | MCP server | ~390 | Medium |
| `config/mcp.config.json` | MCP config | ~12 | Low |
| `README.md` | User docs | ~130 | Low |

---

## Development Constraints

### Token Budget

**CRITICAL:** This project is designed to minimize token usage. When working on it:

- ✅ Read specific file sections with `read_file(offset=X, limit=Y)`
- ✅ Use `search_files()` to locate code
- ✅ Use `patch()` for targeted edits
- ❌ Never read entire files unless absolutely necessary
- ❌ Never paste full file contents in conversation

### Code Style

**Python:**
- PEP 8
- 4-space indent
- Type hints optional
- Docstrings for public functions

**JavaScript:**
- 2-space indent
- camelCase for variables/functions
- No semicolons (ASI-compliant)
- Vanilla ES6+ (no transpilation)

**JSON:**
- 2-space indent
- No trailing commas

### Error Handling

**Always validate:**
- File paths (prevent traversal attacks)
- JSON payloads
- MCP server responses

**Return structured errors:**
```python
{"error": "Human-readable message"}
```

---

## Common Agent Tasks

### Adding a New MCP Tool

**Location:** `backend/mcp_servers/local_repo_server.py`

**Pattern:**
```python
def my_new_tool(arguments):
    # Validate arguments
    param = arguments.get("param")
    if not param:
        raise ValueError("param is required")
    
    # Do work
    result = {"data": "..."}
    
    # Return in MCP format
    return tool_result(result)
```

**Register in tool list:**
Search for `"tools/list"` handler and add to schema.

### Adding a New API Endpoint

**Location:** `backend/server.py`

**Pattern:**
```python
# In DashboardHandler.do_POST()
if parsed.path == "/api/my-endpoint":
    # Parse body
    data = body.get("key")
    
    # Process
    result = process_data(data)
    
    # Return JSON
    self.send_json(result)
    return
```

### Adding a New Benchmark Workflow

**Location:** `frontend/app.js`

**Pattern:**
1. Add workflow to `WORKFLOWS` constant
2. Add tasks to `TASK_TEMPLATES`
3. Update `runBenchmark()` to handle new workflow
4. Add UI elements in `frontend/index.html` if needed

### Debugging MCP Issues

**Symptoms:**
- "MCP server is not running"
- "MCP request timed out"
- Tools not appearing

**Check:**
1. `backend/server.py` stderr capture: `client.stderr_lines`
2. MCP server stdout format (must be JSON-RPC)
3. Timeout values in `_request_started()`
4. Process spawn in `ensure_started()`

**Test MCP server directly:**
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | python3 backend/mcp_servers/local_repo_server.py
```

---

## Agent-Specific Guidance

### For Code Generation Agents

When generating new code:
- Match existing code style (see samples below)
- Add error handling (never crash silently)
- Return structured results (JSON)
- Add to appropriate section (don't mix concerns)

### For Debugging Agents

When debugging issues:
1. Read error logs first (`stderr_lines`, browser console)
2. Locate relevant code with `search_files()`
3. Read only affected sections with `read_file(offset=...)`
4. Apply minimal fix with `patch()`

### For Refactoring Agents

When refactoring:
- Make incremental changes (one concept per patch)
- Preserve public APIs (don't break frontend/backend contract)
- Test after each change (manual testing via browser)
- Update this file if architecture changes

---

## Code Samples (Reference Only)

### MCP Tool Pattern
```python
def example_tool(arguments):
    # Validate
    path = arguments.get("path", "")
    if not path:
        raise ValueError("path is required")
    
    # Work
    result = {"status": "ok", "data": "..."}
    
    # Return
    return tool_result(result)
```

### API Endpoint Pattern
```python
if parsed.path == "/api/example":
    param = body.get("param")
    result = do_work(param)
    self.send_json(result)
    return
```

### Frontend API Call Pattern
```javascript
async function callApi(endpoint, body) {
  const response = await fetch(`/api/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return response.json()
}
```

---

## Testing Strategy

### Manual Testing Checklist

**Before committing changes:**

1. **Static mode works:**
   ```bash
   open frontend/index.html
   # Click "Run Benchmark" → see results
   ```

2. **MCP mode works:**
   ```bash
   python3 backend/server.py
   # Open http://127.0.0.1:5173
   # Connect MCP → see tools
   # Run Repo Scan → see results
   ```

3. **No errors in browser console**

4. **No Python exceptions in terminal**

### Automated Testing (Future)

Not implemented yet. Good targets:
- `pytest` for MCP tools
- `pytest` for API endpoints
- Playwright for frontend

---

## Known Issues & Limitations

### Current Limitations

1. **No authentication** — anyone with URL can access
2. **No persistence** — localStorage only (lost on cache clear)
3. **No rate limiting** — MCP calls can spam server
4. **No input sanitization** — XSS risk in frontend
5. **No concurrent request handling** — one MCP call at a time per server

### Technical Debt

1. **MCP client should pool connections** — currently spawns process per request
2. **Frontend state management is ad-hoc** — consider Zustand/Jotai if it grows
3. **No error boundaries** — one crash can break entire UI
4. **Hard-coded timeouts** — should be configurable
5. **No logging framework** — just prints to stderr

---

## Security Considerations

### Path Traversal

**Always use:**
```python
safe_path(relative_path)  # In MCP server
resolve_repo_path(repo_root)  # In HTTP server
```

Never trust user input for file paths.

### Command Injection

**Never:**
```python
os.system(f"git clone {user_input}")  # NO!
```

**Always:**
```python
subprocess.run(["git", "clone", user_input], ...)  # YES
```

### JSON Injection

MCP responses are trusted. If adding external data sources (GitHub API, etc.), sanitize JSON.

---

## Performance Considerations

### MCP Overhead

- Process spawn: ~100ms
- Tool call: ~50-200ms
- Repo scan (small repo): ~500ms
- Repo scan (large repo): ~2-5s

### Frontend Performance

- Dashboard renders instantly (<50ms)
- Simulated benchmarks: ~1-2s (artificial delay)
- MCP benchmarks: ~3-10s (real I/O)

### Optimization Opportunities

1. **Connection pooling** — reuse MCP server processes
2. **Caching** — cache `repo_summary` results
3. **Lazy loading** — don't scan until needed
4. **Web Workers** — offload heavy JSON parsing

---

## Future Architecture Decisions

### When to Add a Build Step

**Wait until:**
- Need TypeScript
- Need React/Vue
- Bundle size > 500KB
- Using npm packages

**Current bundle size:** ~50KB (no build needed yet)

### When to Add a Database

**Wait until:**
- Multiple users need shared state
- Run history needs to persist across sessions
- Need complex queries
- localStorage limit exceeded (~5MB)

**Current approach:** localStorage is fine for MVP

### When to Add Real LLM Integration

**Consider when:**
- Ready to spend tokens
- Need real hallucination detection
- Testing actual agent workflows
- Have benchmarks to run

**Replacement points:**
- `runBenchmark()` in frontend/app.js → real API calls
- `simulateTask()` → actual LLM invocation
- `evaluateResponse()` → real judge model

---

## Agent Workflow Patterns

### Pattern 1: Investigative Read

```
1. search_files(pattern="class MCPRegistry")
2. read_file(path="backend/server.py", offset=148, limit=50)
3. Analyze → Propose change
```

### Pattern 2: Targeted Fix

```
1. Locate issue with search_files()
2. Read context with read_file(offset=X-10, limit=30)
3. Apply fix with patch(old_string="...", new_string="...")
4. Verify with read_file() again
```

### Pattern 3: Multi-File Refactor

```
1. Use execute_code() to analyze multiple files
2. Generate patch for each file
3. Apply in dependency order (backend → frontend)
```

---

## Questions to Ask Before Acting

1. **What file contains the relevant code?**  
   → Use `search_files()` if unsure

2. **What are the exact line numbers?**  
   → Use `read_file()` with narrow range

3. **Will this change break existing functionality?**  
   → Check API contracts, frontend expectations

4. **Is this the minimal change needed?**  
   → Avoid over-engineering for MVP

5. **Can I test this manually?**  
   → If no easy test path, reconsider approach

---

## Communication Protocol

### When Reporting Results

**Good:**
```
✅ Added set_repo_root tool to MCP server (lines 39-60)
✅ Updated API endpoint to call new tool (backend/server.py:376-380)
✅ Tested: http://127.0.0.1:5173 → Connect MCP → works
```

**Bad:**
```
❌ I added the feature
❌ It works now
❌ Done
```

### When Encountering Errors

**Good:**
```
❌ MCP timeout in _request_started (backend/server.py:132)
   Cause: default 10s timeout too short for large repos
   Fix: Add timeout parameter to run_repo_scan()
   Applied patch to increase to 30s
```

**Bad:**
```
❌ It doesn't work
❌ Error
```

---

## Emergency Recovery

### If MCP Server Crashes

```bash
# Check process
ps aux | grep local_repo_server.py

# Kill if stuck
pkill -f local_repo_server.py

# Restart backend/server.py
python3 backend/server.py
```

### If Frontend Breaks

```bash
# Check browser console (Cmd+Option+I on macOS)
# Common fix: clear localStorage
localStorage.clear()
location.reload()
```

### If Token Context Explodes

```
# In chat with orchestrating agent:
/new          # Start fresh session
/compress     # Compress context

# Use execute_code for bulk operations
```

---

## Success Metrics

**An agent has succeeded when:**

1. ✅ Feature works manually in browser
2. ✅ No errors in browser console
3. ✅ No Python exceptions in terminal
4. ✅ Code matches project style
5. ✅ Token usage < 2000 for the task
6. ✅ Changes are minimal and focused

---

## Final Notes

- **This is an MVP** — favor simplicity over perfection
- **No users yet** — breaking changes are OK
- **Token efficiency matters** — this project tests AI workflows, so it should use them well
- **MCP is the future** — invest in good MCP patterns
- **Document as you go** — update this file if architecture changes

Good luck, agent. Build something great. 🚀

# Contributing to Agent Evaluation Dashboard

Thank you for considering contributing to the Agent Evaluation Dashboard!

## Development Setup

1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd Agent_Evaluation_Dashboard
   ```

2. No dependencies to install! This project uses Python standard library only.

3. Run the dashboard:
   ```bash
   # Static mode
   open frontend/index.html
   
   # MCP mode
   python3 backend/server.py
   ```

## Running Tests

```bash
# Run tests
python3 -m unittest discover tests -v

# Optional: install pytest if you prefer its runner
pip install pytest pytest-cov
python3 -m pytest tests/ -v
```

## Project Structure

```
.
├── frontend/               # Dashboard UI, frontend logic, styling
├── backend/                # HTTP server + MCP server implementation
│   ├── server.py
│   └── mcp_servers/local_repo_server.py
├── config/                 # MCP config and dependency manifest
├── tests/                  # Test suite
└── .github/workflows/      # CI configuration
```

## Code Style

- **Python**: PEP 8, 4-space indentation
- **JavaScript**: 2-space indentation, camelCase
- **Comments**: Explain why, not what

## Adding Features

1. **New MCP Tool**: Add to `backend/mcp_servers/local_repo_server.py`
2. **New API Endpoint**: Add to `backend/server.py` in `DashboardHandler`
3. **New Workflow**: Add to `frontend/app.js` in the benchmark task definitions

## Security

- Always validate user input (paths, JSON payloads)
- Use `safe_path()` for file operations in MCP server
- Use `subprocess.run([...])`, never `os.system()`

## Submitting Changes

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes
3. Run tests: `python3 -m unittest discover tests -v`
4. Commit: `git commit -m "Add feature: description"`
5. Push and create a Pull Request

## Questions?

See CLAUDE.md, AGENTS.md, or open an issue.

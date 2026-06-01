#!/usr/bin/env python3
"""
檔案用途：本地 Repository MCP 伺服器
功能：
  - 實作 Model Context Protocol (MCP) 標準
  - 提供 repo_summary、read_file、search_files 等工具
  - 支援程式碼品質掃描（scan_repo_quality）
  - 允許執行時期設定 repo 根目錄
協定：JSON-RPC 2.0 over stdio
"""

import json
import os
import re
import sys
from pathlib import Path


PROTOCOL_VERSION = "2025-06-18"
ROOT = Path(os.environ.get("MCP_REPO_ROOT", ".")).expanduser().resolve()
SKIP_DIRS = {".git", ".venv", "__pycache__", "node_modules", "dist", "build"}
MAX_FILE_BYTES = 900_000
QA_STOPWORDS = {
    "the", "and", "for", "with", "from", "into", "that", "this", "test",
    "case", "cases", "flow", "find", "missing", "edge", "qa",
}


def send(payload):
    sys.stdout.write(json.dumps(payload, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def error_response(message_id, code, message):
    send({
        "jsonrpc": "2.0",
        "id": message_id,
        "error": {"code": code, "message": message},
    })


def result_response(message_id, result):
    send({"jsonrpc": "2.0", "id": message_id, "result": result})


def safe_path(relative_path):
    candidate = (ROOT / relative_path).resolve()
    if candidate != ROOT and ROOT not in candidate.parents:
        raise ValueError("Path escapes repository root")
    return candidate


def set_repo_root(arguments):
    global ROOT

    raw_path = str(arguments.get("path", "")).strip()
    if not raw_path:
        raise ValueError("path is required")

    candidate = Path(raw_path).expanduser()
    if not candidate.is_absolute():
        candidate = ROOT / candidate
    candidate = candidate.resolve()

    if not candidate.exists() or not candidate.is_dir():
        raise ValueError("Repository path must be an existing directory")

    old_root = ROOT
    ROOT = candidate
    return {
        "old_root": str(old_root),
        "root": str(ROOT),
        "summary": repo_summary({}),
    }


def iter_files():
    for path in ROOT.rglob("*"):
        if any(part in SKIP_DIRS for part in path.relative_to(ROOT).parts):
            continue
        if path.is_file():
            yield path


def read_text(path, max_chars=12000):
    raw = path.read_bytes()[:MAX_FILE_BYTES]
    text = raw.decode("utf-8", errors="ignore")
    return text[:max_chars]


def tool_result(data):
    text = json.dumps(data, indent=2, ensure_ascii=False)
    return {
        "content": [{"type": "text", "text": text}],
        "structuredContent": data,
    }


def repo_summary(_arguments):
    files = list(iter_files())
    by_extension = {}
    total_bytes = 0
    for path in files:
        suffix = path.suffix or "[none]"
        by_extension[suffix] = by_extension.get(suffix, 0) + 1
        total_bytes += path.stat().st_size

    return {
        "root": str(ROOT),
        "file_count": len(files),
        "total_bytes": total_bytes,
        "extensions": dict(sorted(by_extension.items())),
        "top_level_files": sorted(path.name for path in ROOT.iterdir() if path.is_file()),
        "top_level_dirs": sorted(path.name for path in ROOT.iterdir() if path.is_dir()),
    }


def read_file(arguments):
    path = safe_path(arguments.get("path", "README.md"))
    max_chars = int(arguments.get("max_chars", 12000))
    if not path.exists() or not path.is_file():
        raise ValueError("File not found")

    return {
        "path": str(path.relative_to(ROOT)),
        "content": read_text(path, max_chars),
        "size": path.stat().st_size,
    }


def search_files(arguments):
    query = str(arguments.get("query", "")).strip()
    limit = max(1, min(int(arguments.get("limit", 20)), 50))
    if not query:
        raise ValueError("Query is required")

    matches = []
    lowered_query = query.lower()
    for path in iter_files():
        relative = str(path.relative_to(ROOT))
        path_hit = lowered_query in relative.lower()
        text_hit = False
        line_number = None
        preview = ""

        try:
            text = read_text(path, 60000)
        except OSError:
            text = ""

        for index, line in enumerate(text.splitlines(), start=1):
            if lowered_query in line.lower():
                text_hit = True
                line_number = index
                preview = line.strip()[:180]
                break

        if path_hit or text_hit:
            matches.append({
                "path": relative,
                "line": line_number,
                "preview": preview,
                "match_type": "path" if path_hit and not text_hit else "content",
            })

        if len(matches) >= limit:
            break

    return {"query": query, "count": len(matches), "matches": matches}


def is_test_path(relative_path):
    name = relative_path.lower()
    return bool(
        re.search(r"(^|/)(__tests__|tests?|spec)(/|$)", name)
        or re.search(r"(^|/)(test_|.*_test\.|.*\.test\.|.*\.spec\.)", name)
    )


def extract_qa_keywords(query):
    tokens = [
        token.lower()
        for token in re.findall(r"[a-zA-Z][a-zA-Z0-9_]{2,}", query)
        if token.lower() not in QA_STOPWORDS
    ]
    keywords = []
    for token in tokens + ["auth", "login", "error", "validation"]:
        if token not in keywords:
            keywords.append(token)
    return keywords[:8]


def inspect_qa_context(arguments):
    query = str(arguments.get("query", "")).strip() or "Find missing edge cases in authentication flow"
    keywords = extract_qa_keywords(query)
    seen_paths = set()
    source_matches = []
    test_matches = []

    for keyword in keywords:
        search_result = search_files({"query": keyword, "limit": 12})
        for match in search_result["matches"]:
            path = match["path"]
            if path in seen_paths:
                continue
            seen_paths.add(path)
            enriched = {**match, "keyword": keyword}
            if is_test_path(path):
                test_matches.append(enriched)
            else:
                source_matches.append(enriched)

    inspected_files = []
    for match in (source_matches[:4] + test_matches[:3]):
        try:
            path = safe_path(match["path"])
            content = read_text(path, 2200)
        except (OSError, ValueError):
            continue
        inspected_files.append({
            "path": match["path"],
            "kind": "test" if is_test_path(match["path"]) else "source",
            "keyword": match["keyword"],
            "preview": match.get("preview", ""),
            "content_excerpt": content,
        })

    findings = []
    if not source_matches:
        findings.append({
            "severity": "high",
            "message": "No implementation evidence found for the QA task keywords.",
            "evidence": [],
        })
    if not test_matches:
        findings.append({
            "severity": "high",
            "message": "No existing test evidence found for the QA task keywords.",
            "evidence": [match["path"] for match in source_matches[:3]],
        })
    if source_matches and test_matches and len(test_matches) < max(1, len(source_matches) // 3):
        findings.append({
            "severity": "medium",
            "message": "Relevant implementation evidence appears broader than matching test evidence.",
            "evidence": [match["path"] for match in (source_matches[:2] + test_matches[:2])],
        })
    if not inspected_files:
        findings.append({
            "severity": "medium",
            "message": "No files could be read for grounded QA analysis.",
            "evidence": [],
        })

    return {
        "root": str(ROOT),
        "query": query,
        "keywords": keywords,
        "source_matches": source_matches[:20],
        "test_matches": test_matches[:20],
        "inspected_files": inspected_files,
        "findings": findings,
        "grounding": {
            "source_match_count": len(source_matches),
            "test_match_count": len(test_matches),
            "inspected_file_count": len(inspected_files),
        },
    }


def scan_static_app(_arguments):
    required_files = {
        "index.html": ["frontend/index.html", "index.html"],
        "styles.css": ["frontend/styles.css", "styles.css"],
        "app.js": ["frontend/app.js", "app.js"],
        "README.md": ["README.md"],
        "server.py": ["backend/server.py", "server.py"],
        "mcp.config.json": ["config/mcp.config.json", "mcp.config.json"],
    }
    files = {}
    for name, candidates in required_files.items():
        resolved = [safe_path(candidate) for candidate in candidates]
        files[name] = next((path for path in resolved if path.exists()), resolved[0])

    app_js = read_text(files["app.js"], 60000) if files["app.js"].exists() else ""
    index_html = read_text(files["index.html"], 60000) if files["index.html"].exists() else ""
    readme = read_text(files["README.md"], 60000) if files["README.md"].exists() else ""
    issues = []

    missing = [name for name, path in files.items() if not path.exists()]
    for name in missing:
        issues.append({"severity": "high", "message": f"Missing {name}"})

    if "fetch(" not in app_js:
        issues.append({"severity": "medium", "message": "Frontend has no API fetch integration"})
    if "/api/mcp" not in app_js:
        issues.append({"severity": "medium", "message": "Frontend is not wired to MCP API endpoints"})
    if "mcp" not in readme.lower():
        issues.append({"severity": "low", "message": "README does not document MCP usage"})
    if "<main" not in index_html:
        issues.append({"severity": "medium", "message": "Dashboard main layout not detected"})

    return {
        "required_files": {name: path.exists() for name, path in files.items()},
        "resolved_files": {
            name: str(path.relative_to(ROOT)) if path.exists() else None
            for name, path in files.items()
        },
        "js_function_count": len(re.findall(r"function\s+[a-zA-Z0-9_]+", app_js)),
        "api_fetch_detected": "fetch(" in app_js,
        "mcp_api_detected": "/api/mcp" in app_js,
        "issues": issues,
    }


def scan_repo_quality(_arguments):
    files = list(iter_files())
    relative_files = [str(path.relative_to(ROOT)) for path in files]
    lower_files = [name.lower() for name in relative_files]
    file_names = {Path(name).name.lower() for name in relative_files}
    issues = []

    readme_files = [name for name in lower_files if Path(name).name in {"readme.md", "readme.txt", "readme"}]
    dependency_files = sorted(file_names.intersection({
        "package.json",
        "pyproject.toml",
        "requirements.txt",
        "poetry.lock",
        "go.mod",
        "cargo.toml",
        "pom.xml",
        "build.gradle",
        "gemfile",
    }))
    env_examples = sorted(file_names.intersection({".env.example", ".env.sample", "example.env"}))
    ci_files = [
        name for name in lower_files
        if name.startswith(".github/workflows/")
        or Path(name).name in {".gitlab-ci.yml", "azure-pipelines.yml", "circle.yml"}
    ]
    test_files = [
        name for name in lower_files
        if re.search(r"(^|/)(__tests__|tests?|spec)(/|$)", name)
        or re.search(r"(^|/)(test_|.*_test\.|.*\.test\.|.*\.spec\.)", name)
    ]

    todo_hits = []
    for path in files:
        if path.stat().st_size > MAX_FILE_BYTES:
            continue
        try:
            text = read_text(path, 100000)
        except OSError:
            continue
        for index, line in enumerate(text.splitlines(), start=1):
            if re.search(r"\b(TODO|FIXME|HACK|XXX)\b", line, re.IGNORECASE):
                todo_hits.append({
                    "path": str(path.relative_to(ROOT)),
                    "line": index,
                    "text": line.strip()[:160],
                })
                break

    large_files = [
        {"path": str(path.relative_to(ROOT)), "size": path.stat().st_size}
        for path in files
        if path.stat().st_size > 1_000_000
    ]

    if not readme_files:
        issues.append({"severity": "medium", "message": "Missing README"})
    if not dependency_files:
        issues.append({"severity": "medium", "message": "No common dependency manifest found"})
    if not test_files:
        issues.append({"severity": "high", "message": "No test files or test directories detected"})
    if not ci_files:
        issues.append({"severity": "medium", "message": "No CI workflow detected"})
    if not env_examples:
        issues.append({"severity": "low", "message": "No environment example file detected"})
    if len(todo_hits) > 20:
        issues.append({"severity": "low", "message": "High TODO/FIXME count"})
    if large_files:
        issues.append({"severity": "low", "message": "Large files detected"})

    return {
        "root": str(ROOT),
        "file_count": len(files),
        "readme_files": readme_files,
        "dependency_files": dependency_files,
        "env_examples": env_examples,
        "ci_files": ci_files[:20],
        "test_files": test_files[:50],
        "todo_count": len(todo_hits),
        "todo_samples": todo_hits[:10],
        "large_files": large_files[:10],
        "issues": issues,
    }


TOOLS = {
    "set_repo_root": {
        "description": "Change the repository root used by the local repo tools.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
            },
            "required": ["path"],
        },
        "handler": set_repo_root,
    },
    "repo_summary": {
        "description": "Summarize the local repository structure.",
        "inputSchema": {"type": "object", "properties": {}},
        "handler": repo_summary,
    },
    "read_file": {
        "description": "Read a file inside the repository root.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "max_chars": {"type": "number"},
            },
            "required": ["path"],
        },
        "handler": read_file,
    },
    "search_files": {
        "description": "Search filenames and text inside repository files.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "limit": {"type": "number"},
            },
            "required": ["query"],
        },
        "handler": search_files,
    },
    "scan_static_app": {
        "description": "Evaluate whether the dashboard app has the expected static and MCP files.",
        "inputSchema": {"type": "object", "properties": {}},
        "handler": scan_static_app,
    },
    "scan_repo_quality": {
        "description": "Evaluate general repository quality signals such as README, tests, CI, dependency files, and TODO risk.",
        "inputSchema": {"type": "object", "properties": {}},
        "handler": scan_repo_quality,
    },
    "inspect_qa_context": {
        "description": "Collect real repository evidence for a QA agent evaluation task without running tests.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
            },
        },
        "handler": inspect_qa_context,
    },
}


def list_tools():
    return {
        "tools": [
            {
                "name": name,
                "description": spec["description"],
                "inputSchema": spec["inputSchema"],
            }
            for name, spec in TOOLS.items()
        ]
    }


def call_tool(params):
    name = params.get("name")
    arguments = params.get("arguments") or {}
    if name not in TOOLS:
        raise ValueError(f"Unknown tool: {name}")
    return tool_result(TOOLS[name]["handler"](arguments))


def handle_request(message):
    method = message.get("method")
    message_id = message.get("id")
    params = message.get("params") or {}

    if method == "initialize":
        result_response(message_id, {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": {"name": "local-repo", "version": "0.1.0"},
        })
        return

    if method == "notifications/initialized":
        return

    try:
        if method == "tools/list":
            result_response(message_id, list_tools())
        elif method == "tools/call":
            result_response(message_id, call_tool(params))
        else:
            error_response(message_id, -32601, f"Method not found: {method}")
    except Exception as exc:
        result_response(message_id, {
            "content": [{"type": "text", "text": str(exc)}],
            "isError": True,
        })


def main():
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            continue
        handle_request(message)


if __name__ == "__main__":
    main()

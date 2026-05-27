---
name: pr-review-repo
description: Repository-specific PR review for Agent_Evaluation_Dashboard.
---

# Repository-specific PR Review Skill

This is a standalone repository-specific PR review skill for Agent_Evaluation_Dashboard.
Use it when repository-specific checks are needed in addition to the global pr-review workflow.

## Repo-specific checks

When reviewing changes in this repository, also check:

- If backend MCP server files changed:
  - Review `backend/mcp_servers/local_repo_server.py`
  - Run relevant Python unit tests if available

- If frontend files changed:
  - Review `frontend/index.html`
  - Review `frontend/app.js`
  - Review `frontend/styles.css`

- If CI files changed:
  - Review `.github/workflows/ci.yml`
  - Check whether test and lint jobs still match project commands

- If tests changed:
  - Run:
    ```bash
    python3 -m unittest discover
    ```

- If config changed:
  - Review `config/mcp.config.json`
  - Check for hardcoded local paths or secrets


## Relationship with global skills

This repo skill does not require a local `.agents/skills/pr-review` skill.

The generic `$pr-review` skill may exist globally under `~/.codex/skills/pr-review`, but this repo-specific skill must work independently and must not assume a local `.agents/skills/pr-review` directory exists.
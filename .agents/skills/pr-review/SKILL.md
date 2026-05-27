---
name: pr-review
description: Use when reviewing current git changes before commit, push, or pull request. Review only changed files by default, verify real issues, and suggest a concise conventional commit message.
---

# PR Review Skill

Review only the current git changes before commit, push, or pull request.

## Core rule

Focus on the current working tree changes only.

Do not scan the whole repository by default.

Only read unchanged related files when needed to verify a concrete risk from the diff, such as:
- changed function call requires understanding its definition
- changed test depends on helper behavior
- changed config affects runtime behavior
- changed import/export may break another file

Avoid speculative findings.

## Workflow

1. Inspect current changes.
   - Run `git status --short`
   - Run `git diff --stat`
   - Run `git diff`
   - If staged changes exist, also run `git diff --cached`

2. Identify review scope.
   - List changed files.
   - Separate tracked changes from untracked files.
   - Do not review unrelated files.
   - For untracked files, inspect only filenames first, then read them only if they are part of the requested review.

3. Understand the intent.
   - Summarize what changed.
   - Classify the change type:
     - fix
     - feat
     - refactor
     - test
     - docs
     - ci
     - chore
     - style

4. Review for real issues only.
   Look for:
   - real bugs
   - regression risk
   - missing validation
   - missing tests
   - security risk
   - breaking changes
   - poor error handling
   - hardcoded secrets
   - accidental debug code
   - unnecessary dependency changes

5. Verify each finding.
   - Do not report purely speculative issues.
   - If evidence is weak, mark it as "needs verification" instead of a confirmed finding.
   - Prefer evidence from:
     - changed diff
     - nearby code context
     - existing tests
     - command output

6. Run targeted validation when safe.
   - Prefer the smallest relevant command.
   - Do not run expensive full-suite commands unless needed.
   - Examples:
     - `python3 -m unittest tests.test_server`
     - `python3 -m unittest discover`
     - `pytest path/to/test.py`
     - `npm test`
     - `npm run lint`
     - `npm run build`

7. Decide commit readiness.
   - Recommend "ready to commit" only if no blocking issues are found.
   - Recommend "do not commit yet" if there are failing tests, high-risk bugs, secrets, broken build, or incomplete changes.
   - If validation was not run, clearly say what still needs to be checked.

8. Suggest a concise commit message.
   - Use conventional commit format.
   - Keep it one line.
   - Base it only on the reviewed diff.
   - Do not mention unrelated files.
   - Examples:
     - `fix: handle missing repo root`
     - `test: update server metrics expectations`
     - `ci: add lint and test workflow`
     - `docs: clarify local setup steps`
     - `style: normalize test whitespace`

## Output format

Always use highly visual output formatting.

Use clear separators, icons, status markers, and grouped sections.

Use this exact structure:

════════════════════════════════════════
🚦 PR REVIEW RESULT
════════════════════════════════════════

STATUS            : ✅ PASS / ❌ FAIL / ⚠️ NEEDS VERIFICATION
COMMIT READINESS  : ✅ READY / ❌ DO NOT COMMIT / ⚠️ VERIFY FIRST
OVERALL RISK      : 🟢 LOW / 🟡 MEDIUM / 🔴 HIGH

────────────────────────────────────────
📋 SUMMARY
────────────────────────────────────────

• What changed:
  <summary>

• Change type:
  fix / feat / refactor / test / docs / ci / style / chore

• Overall assessment:
  <short assessment>

────────────────────────────────────────
📁 FILES REVIEWED
────────────────────────────────────────

| Risk | File | Reason |
|------|------|------|
| 🟢 LOW | `path/to/file.py` | why reviewed |
| 🟡 MEDIUM | `path/to/file.py` | why reviewed |
| 🔴 HIGH | `path/to/file.py` | why reviewed |

────────────────────────────────────────
🔍 FINDINGS
────────────────────────────────────────

If no findings:

✅ No blocking findings found.

Otherwise:

╭───────────────────────────────────────╮
│ 🔴 HIGH — Missing null validation     │
╰───────────────────────────────────────╯

FILE:
`src/server.py`

LOCATION:
`calculate_metrics()`

PROBLEM:
Null values can reach division logic.

IMPACT:
May crash API endpoint under empty input.

EVIDENCE:
<short code evidence>

SUGGESTED FIX:
Add guard clause before division.

VALIDATION:
pytest tests/test_server.py

────────────────────────────────────────
🧪 VALIDATION
────────────────────────────────────────

| Command | Status | Result |
|------|------|------|
| `pytest` | ✅ PASS | 24 passed |
| `npm run lint` | ❌ FAIL | 3 lint errors |
| `git diff` | ✅ PASS | reviewed successfully |

────────────────────────────────────────
🛠 FINAL ACTION LIST
────────────────────────────────────────

If ready:

✅ READY TO COMMIT

Otherwise:

- [ ] `src/server.py` → add null check
- [ ] `tests/test_server.py` → add regression test
- [ ] rerun `pytest`

────────────────────────────────────────
📝 SUGGESTED COMMIT MESSAGE
────────────────────────────────────────

```bash
fix: handle missing metrics input validation
```

## Important constraints

- Review changed files only by default.
- Do not perform full repository scans unless necessary to verify a concrete risk.
- Do not invent issues.
- Do not report style-only opinions unless they create real maintainability or consistency risk.
- If the diff only contains whitespace, formatting, comments, or documentation changes, explicitly state that functional risk is minimal.
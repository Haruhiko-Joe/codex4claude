---
name: codex-delegation
description: Submit coding, codebase investigation, algorithm, and review tasks to Codex CLI from Claude Code with `codex exec`. Use when the user requests Codex, wants to check its setup or recent runs, or a bounded task benefits from a separate model's execution or review. Covers permissions, reasoning effort, background runs, session continuation, code review, and verification.
compatibility: Claude Code with Bash and an authenticated Codex CLI 0.165.0 or later on PATH.
license: MIT
metadata:
  author: Joe
  version: "1.0.0"
---

# Codex Delegation

Call the Codex CLI directly with Bash. Codex supplies the model's system prompt, tools, project instructions (AGENTS.md), and session history; this skill decides what to send, with which permissions, and how to verify the result. Run the shell in the task workspace: `codex exec` treats the current directory as the workspace unless `-C <dir>` is given.

Follow the user's request and explicit constraints over this skill's defaults.

## Setup

For `/codex-delegation setup`, an environment-check request, or before the first Codex task in a session:

```bash
codex --version && codex login status && codex doctor
```

Require version 0.165.0 or later and "Logged in". `codex doctor` reports sandbox, config, and runtime health without calling the model. The configured model and reasoning effort appear in the header of every run log. Report a failure with its fix: install or `codex update`, or `codex login`.

## Decide what to submit

Submit a bounded task whose result you can review: a code change, a repository question, an algorithm, or an independent review. Keep evolving requirements and decisions with the user. Handle the work locally when the handoff would cost more than the task itself.

Read-only tasks can run in parallel. Run one writing task per workspace at a time; `--worktree` runs a task in a managed Git worktree when parallel writes are needed. Never widen permissions to get past a failure without the user's authorization.

## Write the task

Include only what changes the result:

- Goal: the behavior or answer needed.
- Context: relevant paths, reproduction steps, prior decisions, useful evidence. Codex finds other files itself.
- Boundaries: authorized edits, interfaces to preserve, actions that need a new decision.
- Acceptance: the checks or evidence that establish completion.

State the execution contract: complete the authorized work and its relevant verification, make reasonable assumptions for routine gaps, and report. If information or permission is missing, finish the independent parts and name the exact blocker; do not add an approval step for work the user already authorized. Ask for the conclusion first, then evidence: changes or findings, commands actually run with their outcomes, and open issues. Use the task's language. Tests should cover the change's actual risks, not restate the code.

## Run a task

Always pass `-s` explicitly: the user's Codex config may default to a wider sandbox. Send the task through stdin with a quoted heredoc whose delimiter does not occur in the task; never interpolate task text into the command. Redirect stderr to a log file so the transcript stays out of the conversation; stdout carries only Codex's final message.

```bash
mkdir -p ~/.claude/codex4claude/logs; LOG=~/.claude/codex4claude/logs/$(date +%Y%m%d-%H%M%S)-$$.log
codex exec -s read-only --skip-git-repo-check - <<'CODEX_TASK' 2>"$LOG"
Explain how authentication works. Start at src/auth and locate its callers.
Cite the code supporting the conclusion and identify unresolved questions.
CODEX_TASK
echo "exit=$? log=$LOG"; grep -m1 'session id:' "$LOG"
```

Permissions, one per run:

| Flag | Effect |
|---|---|
| `-s read-only` | Default. Inspect only. |
| `-s workspace-write` | Edit files inside the workspace; `--add-dir <dir>` adds other writable directories. |
| `--approve-for-me` | Workspace-write plus automatic review of escalation requests such as network access or paths outside the workspace. Used instead of `-s`. |
| `-s danger-full-access` | No filesystem isolation. Only with explicit user authorization. |

Options:

- `-c model_reasoning_effort="<level>"`: `low`, `medium`, `high`, `xhigh`, `max`, or `ultra` (maximum reasoning plus Codex's automatic task delegation). Omit to keep the user's configured default. Use low for lookups and mechanical edits, medium for routine work, high for complex implementation or debugging, xhigh or max for tightly coupled problems.
- `-c service_tier="priority"`: Fast mode at higher usage; `"default"` turns it off for one run. Omit to keep the user's setting.
- `-m <model>`: override the configured model only when the user asks for one.
- `-i <image>`: attach a screenshot or diagram (repeatable).
- `--ephemeral`: no persisted session, so no continuation.
- `--output-schema <file>`: constrain the final message to a JSON Schema when a later step parses it.
- `--json` with `-o <file>`: JSONL events on stdout and the final message in the file, for mechanical checks of commands and exit codes instead of the human transcript.

Foreground runs: set the Bash timeout to 600000 ms. For anything that may take longer, run the same command with `run_in_background: true`; Claude Code notifies you when it exits. Meanwhile `tail -n 20 "$LOG"` shows progress. Stop a background run with the TaskStop tool when the user asks. Do not poll in a loop.

## Review code

`codex exec review` runs Codex's built-in reviewer over a diff. A prompt is optional and scopes the review.

```bash
codex exec review --uncommitted - <<'CODEX_TASK' 2>"$LOG"
Focus on concurrency and error handling in the payment module.
CODEX_TASK
```

Targets: `--uncommitted`, `--base <branch>`, or `--commit <sha>` (with optional `--title`). The review runs in the current directory.

## Continue a session

The log header contains `session id: <uuid>`. Resume it for rework so Codex keeps its context. `exec resume` has no `-s` or `-C`: set the sandbox with `-c` and run from the workspace.

```bash
codex exec resume <session-id> --skip-git-repo-check -c sandbox_mode="workspace-write" - <<'CODEX_TASK' 2>"$LOG"
The acceptance check failed for the empty-input case. Fix it and rerun the relevant check.
CODEX_TASK
```

`codex exec fork <session-id> "<prompt>"` tries an alternative from the same starting point in a new session. Resumed sessions keep their earlier instructions; start a fresh task when that framing no longer fits.

## Verify

The log is the evidence: a header (model, sandbox, effort, session id), then one `exec` block per command with its working directory, result, and output, then the final message and tokens used. Compare Codex's claims with those blocks; `grep -n -A3 '^exec' "$LOG"` lists the commands. For write runs, inspect `git status` and `git diff`. For consequential changes, rerun the key acceptance check yourself or request an independent review in a fresh session.

A non-zero exit or an empty final message means the turn failed. Read the end of the log before retrying, and continue the session with targeted instructions rather than resubmitting a task that may already have changed files.

Recent runs: `ls -t ~/.claude/codex4claude/logs | head`. Each file's header identifies the run.

## References

Checked on 2026-10-28 against Codex CLI 0.165.0: [non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode), [config reference](https://learn.chatgpt.com/codex/config-file/config-reference), [changelog](https://learn.chatgpt.com/docs/changelog).

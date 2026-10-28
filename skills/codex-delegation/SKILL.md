---
name: codex-delegation
description: Submit coding, codebase investigation, algorithm, and review tasks to Codex from Claude Code. Use when the user requests Codex, wants to check its setup or manage its runs, or a bounded task benefits from a separate model's execution or review. Supports explicit permissions, background runs, session continuation, and verification.
compatibility: Claude Code with Bash, Node.js 18 or later, and an authenticated Codex CLI 0.153.4 or later.
license: MIT
metadata:
  author: Joe
  version: "0.5.0"
---

# Codex Delegation

Use this skill in Claude Code. Call the bundled engine with Bash:

`node "${CLAUDE_SKILL_DIR}/scripts/codex4claude.mjs"`

Claude Code substitutes `${CLAUDE_SKILL_DIR}` in the skill text; it is not a shell environment variable. Quote the resulting path as literal text, escaping any shell metacharacters it contains. Keep the shell in the user's project and pass its absolute path with `--cd` for task and run-management commands. The skill's installation directory is not the task workspace.

Codex CLI supplies the model's system instructions, tools, project instructions, and session history. Send the task requirements without inventing a role or reproducing the CLI's system prompt. Use the current user's request and explicit task constraints over this skill's defaults, while respecting higher-priority instructions and runtime permissions.

## Setup and run management

For `/codex-delegation setup`, an environment-check request, or the first Codex task in a session, check `node --version` (18 or later), then run:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/codex4claude.mjs" doctor
```

Report a missing or outdated Node/Codex CLI, or an unwritable data directory, with the relevant fix. Codex must be on PATH or configured with `CODEX_BIN` and logged in with `codex login`. The doctor checks the CLI version, configured model, and data directory; it does not call the model or verify login or model access. Actual authentication and model failures appear in the run report and logs.

Route management requests to the corresponding engine command instead of submitting them as tasks:

| Request after `/codex-delegation`, or its natural-language equivalent | Engine command |
|---|---|
| `setup` | `doctor` |
| `status [run-id]` | `status [run-id] --cd <workspace>` |
| `result <run-id>` | `result <run-id> --cd <workspace>` |
| `log <run-id>` | `log <run-id> --cd <workspace>` |
| `cancel <run-id>` | `cancel <run-id> --cd <workspace>` |

Without a run ID, `status` lists recent runs in the workspace. With an ID, it shows progress or the completed report. Relay the result concisely. Submit actual coding, investigation, or review requests with `run` as described below.

## Decide what to submit

Submit a bounded task whose result you can review: a code change, a repository question, an algorithm, or an independent review. Keep evolving requirements and decisions with the user. Handle work locally when the handoff would cost more than the task itself.

Read-only tasks can run in parallel. Run only one writing task per workspace; if the engine reports an active writer, wait for that run or report the conflict. Do not disable the permission boundary to bypass a failure.

## Write the task

Include only the context that changes the result:

- Goal: the behavior or answer needed.
- Context: relevant paths, reproduction steps, prior decisions, and useful evidence. Codex can locate additional files itself.
- Boundaries: authorized edits, interfaces to preserve, and actions requiring a new decision.
- Acceptance: the checks or evidence that would establish completion.

Make the execution contract explicit in the submitted task: complete the authorized work and its relevant verification, make reasonable assumptions for routine gaps, and report the result. If necessary information or permission is missing, finish independent work and identify the exact blocker. Do not add a fresh approval step for work the user already authorized.

If a skill or project instruction blocks completion, request the exact file path, the relevant instruction, and why it applies. The report should distinguish an explicit requirement from the model's interpretation.

Ask for a conclusion first, followed by useful evidence: changes or findings, commands actually run and their outcomes, and unresolved issues. Use the task's language and a format appropriate to the result. Tests should cover the change's actual risks; don't demand unrelated suites, repeated successful checks, or tests that merely restate the code.

## Run the task

Use a quoted heredoc with a delimiter absent from the task, or `--prompt-file`; never interpolate task text into a shell command. For example:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/codex4claude.mjs" run --cd "/path/to/workspace" --read-only --effort medium <<'CODEX_TASK'
Explain how authentication works. Start at src/auth and locate its callers.
Cite the code supporting the conclusion and identify unresolved questions.
CODEX_TASK
```

For authorized edits, use `--write`. The default is `--read-only`; the three permission flags (`--read-only`, `--write`, `--dangerous`) are mutually exclusive. Use `--dangerous` only with explicit authorization for full filesystem access.

The default model is `gpt-6-astra`; `CODEX4CLAUDE_MODEL` can override it. No `--effort` means Codex keeps its configured or model default. Choose a level when the task warrants it:

| Effort | Typical use |
|---|---|
| low | Targeted lookup or a mechanical task |
| medium | Routine investigation or coding |
| high | Complex implementation, debugging, or review |
| xhigh / max | Especially difficult, tightly coupled problems |
| ultra | Maximum reasoning with Codex's automatic task delegation |

These are Codex CLI levels; `ultra` is not an API reasoning parameter. `--fast` requests `service_tier=priority` and increases usage. Choose it for turnaround independently of reasoning depth; availability depends on the active model and account.

Foreground runs: set Bash's timeout to 600000 ms so it outlasts the engine's default 540 seconds. `--timeout <seconds>` applies to both foreground and background runs; `0` disables the engine timeout.

Long tasks: use `--background --timeout 0`. Capture the run ID, then check with `status <run-id>` and fetch `result <run-id>` when finished. Pass the same `--cd <workspace>` to each command. Space status checks about 30 seconds apart, send meaningful user updates, and continue supervising until the task finishes or a user decision is required. Use `cancel <run-id>` when asked to stop.

## Continue and verify

Every report includes a `CODEX RUN` header, the final message, a `── run info ──` footer, and a `LOG:` path. The session ID in the header identifies Codex's conversation; the run ID identifies this invocation's logs. Rework uses the explicit session:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/codex4claude.mjs" run --cd "/path/to/workspace" --session <session-id> --write <<'CODEX_TASK'
The acceptance check failed for the empty-input case. Fix that case and rerun the relevant check.
CODEX_TASK
```

Use the generated `NEXT` command to preserve the workspace and permissions. `--ephemeral` produces a temporary session and no continuation command. Old sessions can retain their historical role instructions; start a new task when that framing no longer fits.

Compare verification claims with the recorded commands and exit codes. The footer summarizes observed activity; missing entries do not prove that an action never happened. For consequential changes, inspect the relevant code and rerun the key acceptance check or request an independent review in a fresh session. Resolve outstanding questions before declaring the overall task complete.

On failure or timeout, inspect `log <run-id>` and the report first. Continue the known session with targeted instructions instead of blindly repeating a task that may have already changed files. Progress messages alone are not completion, and a successful run does not establish that every acceptance criterion passed.

## References

Guidance checked on 2026-09-06: [Astra prompting](https://developers.openai.com/api/docs/guides/latest-model#prompting-best-practices), [Codex Cookbook](https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide), [non-interactive execution](https://learn.chatgpt.com/docs/non-interactive-mode). Use the Cookbook's general integration advice; Astra behavior follows its newer model guide.

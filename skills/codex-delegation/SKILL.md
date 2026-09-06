---
name: codex-delegation
description: Submit coding, codebase investigation, algorithm, and review tasks directly to Codex (gpt-6-astra). Use when the user requests Codex or a bounded task benefits from a separate model's execution or review. Covers task instructions, permissions, reasoning effort, background runs, explicit session continuation, and verification. No predefined agents or custom agent registry.
---

# Codex Delegation

Call the engine directly with Bash:

`node "${CLAUDE_PLUGIN_ROOT}/scripts/codex4claude.mjs"`

Codex CLI supplies the model's system instructions, tools, project instructions, and session history. Send the task requirements without inventing a role or reproducing the CLI's system prompt. Use the current user's request and explicit task constraints over this skill's defaults, while respecting higher-priority instructions and runtime permissions.

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
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex4claude.mjs" run --read-only --effort medium <<'CODEX_TASK'
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

Long tasks: use `--background --timeout 0`. Capture the run ID, then check with `status <run-id>` and fetch `result <run-id>` when finished. Include `--cd <workspace>` if the shell's working directory differs. Space status checks about 30 seconds apart, send meaningful user updates, and continue supervising until the task finishes or a user decision is required. Use `cancel <run-id>` when asked to stop.

## Continue and verify

Every report includes a `CODEX RUN` header, the final message, a `── run info ──` footer, and a `LOG:` path. The session ID in the header identifies Codex's conversation; the run ID identifies this invocation's logs. Rework uses the explicit session:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex4claude.mjs" run --session <session-id> --write <<'CODEX_TASK'
The acceptance check failed for the empty-input case. Fix that case and rerun the relevant check.
CODEX_TASK
```

Use the generated `NEXT` command to preserve the workspace and permissions. `--ephemeral` produces a temporary session and no continuation command. Old sessions can retain their historical role instructions; start a new task when that framing no longer fits.

Compare verification claims with the recorded commands and exit codes. The footer summarizes observed activity; missing entries do not prove that an action never happened. For consequential changes, inspect the relevant code and rerun the key acceptance check or request an independent review in a fresh session. Resolve outstanding questions before declaring the overall task complete.

On failure or timeout, inspect `log <run-id>` and the report first. Continue the known session with targeted instructions instead of blindly repeating a task that may have already changed files. Progress messages alone are not completion, and a successful run does not establish that every acceptance criterion passed.

## Setup and references

`/codex4claude:setup` checks CLI compatibility and the data directory; `/codex4claude:status` lists recent runs. Agent definitions and `--continue` were removed in 0.4.0.

Guidance checked on 2026-09-06: [Astra prompting](https://developers.openai.com/api/docs/guides/latest-model#prompting-best-practices), [Codex Cookbook](https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide), [non-interactive execution](https://learn.chatgpt.com/docs/non-interactive-mode). Use the Cookbook's general integration advice; Astra behavior follows its newer model guide.

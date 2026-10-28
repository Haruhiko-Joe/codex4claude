---
name: codex-delegation-cowork
description: Submit bounded coding, file analysis, algorithm, and review tasks to Codex from Claude Cowork. Use when the user requests Codex in Cowork, wants to check its execution environment, or needs to inspect, continue, or cancel a Codex run.
compatibility: Claude Cowork with shell execution, Node.js 18 or later, an authenticated Codex CLI 0.153.4 or later, network access to Codex, and permission to run its sandbox in the execution environment.
license: MIT
metadata:
  author: Joe
  version: "0.5.0"
---

# Codex Delegation for Cowork

Use the bundled engine to submit tasks to Codex and review its results. Cowork owns the conversation and task decisions; Codex executes a bounded task using its own tools, project instructions, and session history.

## Locate the engine and workspace

Find the actual location of this loaded `SKILL.md` from the skill context. The engine is [scripts/codex4claude.mjs](scripts/codex4claude.mjs), relative to that file. Resolve it to an absolute path and use Cowork's available shell execution tool. Replace the example paths below with the observed paths and quote them as literal shell arguments.

Use a workspace that Cowork's execution environment can actually access, based on the user's selected folder or task files. Pass its absolute path with `--cd` on every task and management command. Keep the skill installation directory separate from the workspace. If a required file is unavailable, identify the file and the missing access.

The Codex executable, login state, network connection, and workspace must all be usable inside Cowork's execution environment. A CLI installed on the user's computer is not automatically available there. This skill uses the available CLI directly.

## Check the environment

For a setup request or the first Codex task in a session:

1. Run `node --version` and require version 18 or later. If Node is unavailable, report that prerequisite before trying the engine.
2. Run the engine's compatibility check:

   ```bash
   node "/absolute/skill/path/scripts/codex4claude.mjs" doctor
   ```

3. Check login with the same executable reported by the doctor: `codex login status`, or the executable configured with `CODEX_BIN`. Report the login status without reading or displaying credential files.

The doctor checks CLI version, configured model, and writable data directory. Login status is a separate check; neither check proves model access or a successful network request. If a prerequisite fails, name the missing requirement or exact error. Use the existing environment setup process to make Node and a compatible, logged-in Codex CLI available; do not retry a task until its blocker is resolved.

Use the configured `CODEX4CLAUDE_DATA` directory, or the engine default under the execution environment's home directory. If that location is unwritable, use a writable state directory within the user's task workspace. Apply the chosen `CODEX4CLAUDE_DATA` value to every invocation, including generated `NEXT` commands. Apply any `CODEX_BIN` or `CODEX4CLAUDE_MODEL` override the same way; shell variables may not persist between tool calls. Keep run data outside the installed skill. Cross-session history also requires the same data directory, workspace path, and Codex session storage to remain available.

## Submit a task

Include the goal, relevant file paths and evidence, authorized edits, interfaces to preserve, and acceptance checks. Ask Codex to complete the authorized work and relevant verification, then report the conclusion, evidence, commands actually run, and exact blockers. Do not add another approval step for work the user already authorized. If a project or skill instruction blocks completion, request its path, relevant text, and why it applies.

The default permission is read-only. Use `--write` for authorized workspace edits. Only one writing task may run in a workspace at a time; read-only tasks may run alongside it. Permission flags control Codex within Cowork's available access. If sandbox initialization or workspace access is denied, report the error rather than automatically retrying with `--dangerous`.

Use a quoted heredoc or `--prompt-file` to preserve literal task text. For example:

```bash
node "/absolute/skill/path/scripts/codex4claude.mjs" run --cd "/absolute/workspace" --read-only --background --timeout 540 <<'CODEX_TASK'
Inspect the supplied calculation code and explain its rounding behavior.
Cite file locations and report any assumptions or missing inputs.
CODEX_TASK
```

Choose foreground execution only when the shell tool can wait longer than the engine's requested timeout. Otherwise use a background run with a finite timeout, capture its run ID, and supervise it as described below. Use `--timeout 0` only when an unlimited run is requested and the execution environment can keep it alive.

The model defaults to `gpt-6-astra`; `CODEX4CLAUDE_MODEL` can override it. Without `--effort`, Codex keeps its configured or model default. Supported levels are `low`, `medium`, `high`, `xhigh`, `max`, and `ultra`. `--fast` requests priority service and increases usage; leave it off unless the task warrants that choice. `--ephemeral` avoids persisting a Codex session, while the engine still records this run's report and logs.

## Monitor, continue, and review

Use natural-language requests such as "check the Codex environment", "show recent Codex runs", or "continue session …" to choose the matching command:

| Intent | Engine command |
|---|---|
| Environment check | `doctor` |
| Recent runs or one run's status | `status [run-id] --cd <workspace>` |
| Completed report | `result <run-id> --cd <workspace>` |
| Failure details | `log <run-id> --cd <workspace> --grep <text>` |
| Stop a run | `cancel <run-id> --cd <workspace>` |
| Continue a known session | `run --session <session-id> --cd <workspace>` plus the authorized permission and task text |

Space background status checks about 30 seconds apart and provide meaningful progress updates. Continue supervising until completion or a concrete blocker. Background execution does not guarantee that a process survives the execution environment being stopped or replaced. After an interruption, inspect the recorded status and logs before continuing or submitting more work.

The `CODEX RUN` header contains the run ID and session ID. A run ID locates one invocation's logs; a session ID identifies the Codex conversation. `ok` requires a successful process exit, a completion event, and a final report. Progress messages alone are not completion, and a successful run still needs acceptance review.

Review the final report against the recorded commands, exit codes, and actual output files. The report's `LOG:` path points to full evidence, including `last-message.txt`. Use the generated `NEXT` command for continuation, preserving its workspace and permissions and reapplying any environment overrides. An ephemeral run cannot be resumed. On failure, timeout, or cancellation, inspect the evidence before retrying work that might already have changed files.

Return the conclusion, useful evidence, and accessible output paths in the user's language. When a generated file needs to be delivered through Cowork, use the session's supported file-delivery mechanism for that file.

## References

- [Cowork execution environment](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)
- [Installing custom skills](https://support.claude.com/en/articles/12512180-use-skills-in-claude)

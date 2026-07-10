# codex4claude

A Claude Code plugin that turns Codex (`gpt-5.6-sol`) into a persistent team of delegate agents. Claude acts as the manager: it defines agents, writes specs, dispatches tasks, reviews the reports, and escalates decision points to you. Codex does the heavy lifting — implementation, broad codebase reading, hard algorithms, independent review.

## Why

- The main model's tokens are expensive; Codex quota is cheap. Delegate the heavy work, keep the judgment.
- Two models have non-overlapping blind spots: cross-model review catches what self-review misses. Codex is notably strong on competitive-programming-level algorithms.
- Agents and workflows persist on disk, so a team you build once is reusable across sessions and projects.

## Requirements

- Codex CLI ≥ 0.144.0 on PATH (or `CODEX_BIN`), logged in
- Node ≥ 18 (zero npm dependencies)

## Install / develop

```bash
claude --plugin-dir /path/to/codex4claude
```

Then in a session: `/codex4claude:setup` to health-check. Claude uses the plugin automatically via the `codex-delegation` skill whenever delegation makes sense.

## What's inside

| Piece | Purpose |
|---|---|
| `scripts/codex4claude.mjs` | Zero-dependency CLI runtime: `agent define/list/show/rm`, `run` (with `--continue`, `--background`), `status/result/log/cancel`, `workflow list/show`, `doctor` |
| `templates/agents/` | Built-in agents: `implementer`, `explorer`, `algorithm-solver`, `reviewer` |
| `templates/workflows/` | Playbooks: `feature-dev`, `parallel-explore`, `fix-with-review` |
| `skills/codex-delegation` | Teaches Claude when/how to delegate, review discipline, escalation rules |
| `agents/codex-runner.md` | Cheap relay subagent for background polling and fan-out harvest |

## What comes back

Every run returns Codex's report plus a compact `── run info ──` footer (files touched, commands run with exit codes) and a LOG path. Full event logs land in `~/.claude/codex4claude/state/<workspace>/runs/<run-id>/` and can be inspected on demand (`log <run-id> --grep …`); they are never dumped into the conversation.

## Persistence layout

- Agents: `.claude/codex-agents/` (project, committable) → `~/.claude/codex4claude/agents/` (user) → built-ins; higher layers shadow lower.
- Workflows: same three layers under `codex-workflows/` / `workflows/`.
- Sessions: per-workspace state in `~/.claude/codex4claude/state/`; `run <agent> --continue` resumes the agent's latest Codex session with full context.

Model is pinned to `gpt-5.6-sol` (override with `CODEX4CLAUDE_MODEL`).

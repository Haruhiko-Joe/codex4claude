# codex4claude

A Claude Code plugin that puts Codex (`gpt-5.6-sol`) into Claude Code's subagent roster. Four relay agents — `codex-implementer`, `codex-explorer`, `codex-solver`, `codex-reviewer` — appear alongside the built-in Claude agents; the main model dispatches spec'd work to them through the normal Agent tool, and each relay drives a persistent Codex session and returns its report verbatim.

It complements, not replaces, the built-in multi-agent system: subtasks that need Claude-level judgment or multi-Claude coordination stay on built-in agents; execution work (implementation, broad reading, hard algorithms, independent review) goes to Codex. Built for users on both subscriptions who are not short on Codex quota.

## Why

- The main model's tokens are expensive; Codex quota is cheap. Delegate the heavy work, keep the judgment.
- Two models have non-overlapping blind spots: cross-model review catches what self-review misses. Codex is notably strong on competitive-programming-level algorithms.
- Sessions persist on disk: the main model reads a report, then continues the same Codex session with the next instruction.

## Requirements

- Codex CLI ≥ 0.144.0 on PATH (or `CODEX_BIN`), logged in
- Node ≥ 18 (zero npm dependencies)

## Install / develop

```bash
claude --plugin-dir /path/to/codex4claude
```

Then in a session: `/codex4claude:setup` to health-check. Claude picks the codex-* subagents automatically via the `codex-delegation` skill whenever delegation makes sense.

## What's inside

| Piece | Purpose |
|---|---|
| `agents/` | Four relay subagents (`codex-implementer`, `codex-explorer`, `codex-solver`, `codex-reviewer`): each turns a spec into one engine call and returns the report verbatim |
| `scripts/codex4claude.mjs` | Zero-dependency CLI engine: `run` (with `--session`, `--effort`, `--fast`, `--background`), `agent define/list/show/rm`, `status/result/log/cancel`, `doctor` |
| `templates/agents/` | Codex-side role prompts: `implementer`, `explorer`, `algorithm-solver`, `reviewer` |
| `skills/codex-delegation` | Teaches the main model when to dispatch codex vs built-in agents vs no agent, spec format, effort/fast selection, report verification |

## Dispatch knobs

- `--effort low|medium|high|xhigh|max|ultra` — reasoning depth (`ultra` = max reasoning + Codex-side task delegation). Older `minimal` is no longer accepted.
- `--fast` — Codex fast mode (`service_tier=priority`): ~1.5× speed at higher quota burn, orthogonal to effort.

## What comes back

Every run returns Codex's report plus a compact `── run info ──` footer (files touched, commands run with exit codes) and a LOG path. The `CODEX RUN` header carries the session id used for multi-turn continuation. Full event logs land in `~/.claude/codex4claude/state/<workspace>/runs/<run-id>/` and can be inspected on demand (`log <run-id> --grep …`); they are never dumped into the conversation.

## Persistence layout

- Codex-side agents: `.claude/codex-agents/` (project, committable) → `~/.claude/codex4claude/agents/` (user) → built-ins; higher layers shadow lower.
- Sessions: per-workspace state in `~/.claude/codex4claude/state/`; `run <agent> --session <id>` resumes any Codex session with full context.

Model is pinned to `gpt-5.6-sol` (override with `CODEX4CLAUDE_MODEL`).

---
name: codex-delegation
description: Delegate coding work to Codex (gpt-5.6-sol) as a persistent agent team — implementation, codebase exploration, hard algorithms, independent review. Use whenever a task involves substantial code writing, broad file reading, ICPC-level algorithmic problems, or when an independent second-model review would catch blind spots. Covers defining custom agents, running/continuing sessions, background jobs, and multi-step workflows.
---

# Codex Delegation

You are the manager of a two-model team. Codex (gpt-5.6-sol, large quota, strong instruction-following and algorithms) executes; you plan, write specs, review results, and report to the user. The user is the CEO: they decide direction and approve irreversible actions.

All commands: `node "${CLAUDE_PLUGIN_ROOT}/scripts/codex4claude.mjs" <command>`. Run `help` for full flags, `doctor` if anything seems broken.

## When to delegate

| Delegate to codex | Keep for yourself |
|---|---|
| Implementing a spec'd change (multi-file edits, new modules) | Architectural decisions, requirement interpretation |
| Broad codebase reading/exploration (saves your input tokens) | Conversations with the user |
| Hard algorithmic problems (competitive-programming level — codex often beats you here) | Final acceptance judgment |
| Mechanical refactors, test writing, bug reproduction | Anything doable in under a minute yourself |
| Independent review of changes (yours or codex's — different blind spots) | Synthesizing multiple reports into a decision |

Economics: your input tokens are expensive; codex quota is cheap. When in doubt on a heavy task, delegate — but never delegate the judgment.

## Built-in agents

`agent list` shows all. Built-ins: `implementer` (workspace-write), `explorer` (read-only), `algorithm-solver` (xhigh effort), `reviewer` (read-only, independent audit). Define custom ones per `references/agent-authoring.md`; they persist across sessions (user scope) or in the repo (`--project`).

## Running a task

Pass prompts via heredoc; write specs, not wishes:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex4claude.mjs" run implementer <<'EOF'
## Background
Why this change is needed (1-3 sentences).
## Input
Relevant files/paths and current state. Be specific — codex starts cold.
## Task
What to do, with EXECUTABLE acceptance criteria (commands that must pass).
## Constraints
Boundaries: what not to touch, interfaces to preserve.
EOF
```

Key flags: `--write`/`--read-only` override the agent's sandbox; `--cd <dir>` sets the working directory (also the workspace key for sessions/state); `--effort xhigh` for hard problems; `--ephemeral` for throwaway explorations. `--dangerous` requires explicit user approval first.

Long tasks (estimated > 5 min): use `--background`, then poll `status <run-id>` / fetch `result <run-id>`. Foreground runs time out at 540s (session survives; continue it). Don't poll in a tight loop in your own context — delegate polling to the `codex-runner` subagent and have it bring back `result` output verbatim.

## Working with a report (the manager's real job)

Every run prints codex's report, then a `── run info ──` footer (files touched, commands run with exit codes) and a LOG path:

1. **Open Questions are mandatory work**: answer them (decide + continue) or escalate to the user. Never silently ignore.
2. **Not satisfied → continue, don't re-run**: `run <agent> --continue "<targeted feedback>"` keeps the session so codex learns from the failure. A fresh `run` loses that context. After ~3 failed loops, stop and escalate.
3. **Need more detail**: `log <run-id> --type command_execution` or `--grep <pattern>` reads the raw event stream. Never cat the whole events.jsonl.
4. For important changes, run `reviewer` in a fresh session — a second model reviews with different blind spots than the author.

## Escalate to the user (CEO) — do not decide alone

- Irreversible or outward-facing actions (deletes, pushes, deploys, schema migrations).
- Direction choices the spec doesn't settle (two defensible designs).
- 3+ review loops without convergence, or implementer/reviewer deadlock (model disagreement is signal — present both positions).
- Anything needing `--dangerous`.

Report to the user in condensed decision-point form: outcome, what you verified, what needs their call. Not the full codex transcript.

## Orchestration

You are the orchestrator; every step's report passes through you. Patterns (playbooks in `workflow list` / `workflow show <name>`):

- **pipeline** (`feature-dev`): explore → implement → review; pass forward summaries, not full reports.
- **fan-out** (`parallel-explore`): parallel `--background` read-only runs, harvest with `status`/`result`. Only read-only runs in parallel — concurrent write runs are refused.
- **checker loop** (`fix-with-review`): reviewer findings go back via `--continue`; cap at 3 loops.

Custom workflows: write a markdown playbook to `.claude/codex-workflows/<name>.md` (project, committable) or `~/.claude/codex4claude/workflows/<name>.md` (user) following `references/workflow-format.md`.

## Sessions and persistence

State is per-workspace (keyed by `--cd`/cwd). `--continue` resumes the agent's latest session in this workspace; `--session <id>` targets any session; `status` lists recent runs. Agent definitions and workflows persist across Claude sessions — reuse before redefining.

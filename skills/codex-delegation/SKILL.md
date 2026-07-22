---
name: codex-delegation
description: Dispatch execution work to Codex (gpt-5.6-sol) through the codex-implementer / codex-explorer / codex-solver / codex-reviewer subagents — implementation, broad codebase reading, hard algorithms, independent second-model review. Use whenever a task involves substantial code writing or reading and you only need the result, not the process. Covers spec writing, effort/fast selection, multi-turn sessions, and report verification.
---

# Codex Delegation

Codex (gpt-5.6-sol, large quota, strong at agentic coding and algorithms) is your execution tier, exposed as four subagents in the Agent tool: `codex-implementer`, `codex-explorer`, `codex-solver`, `codex-reviewer`. Each relays your spec to a persistent Codex session and returns its report verbatim. You plan, write specs, and judge results; the user decides direction and approves irreversible actions.

## Choosing the worker

Necessary condition for dispatching anything: you need the task's **result, not its process**. If you will need the intermediate reasoning or the decisions made along the way, do it yourself.

| Route | When |
|---|---|
| codex-* subagent | Execution against a writable spec: implementing a spec'd change, broad codebase reading (saves your input tokens), ICPC-level algorithms (codex often beats you here), independent review (different blind spots). |
| Built-in Claude agents (Explore / Plan / general-purpose) | The subtask needs your own model's judgment: requirement interpretation, architecture tradeoffs, work entangled with the live conversation, or coordinating several Claude agents. |
| No agent | The task is smaller than its handoff cost (roughly: you'd finish it yourself in under a minute), or the decisions are still evolving while you work. |

Parallel discipline: read-only dispatches (explorer, reviewer) fan out freely — send them in one message. Write dispatches are serial per workspace: the engine refuses a second concurrent write run, so never dispatch two writers to the same repo at once.

## Writing the spec

Codex executes aggressively and follows instructions well, but expands scope when the task is loosely defined — the spec's Constraints are what keep it in bounds. It starts cold: name every file it needs.

```
## Goal
The outcome, in one or two sentences.
## Context
Relevant files/paths and current state. Decisions already made.
## Constraints
What not to touch; interfaces to preserve; where the scope ends.
## Done-when
Executable acceptance criteria (commands that must pass).
```

Optional dispatch hints above the spec: `effort: xhigh`, `fast`, `long` (expected > 8 min), `session: <id>` (continue earlier work).

## Effort and speed

| effort | Use for |
|---|---|
| low (+ fast) | Targeted lookups, mechanical edits |
| medium | Routine exploration, ordinary changes |
| high | Implementation, review, tricky bugs (implementer/reviewer default) |
| xhigh | Cross-module work, large refactors, hard debugging |
| max | Solver default; a single very hard, tightly coupled problem |
| ultra | Competition-hard problems; background only |

`fast` is orthogonal (~1.5× speed, more quota): worth it in interactive loops at effort ≤ high; pointless on long background runs.

## Multi-turn: you drive the rounds

The `CODEX RUN` header of every report carries the session id. To iterate, SendMessage the **same relay subagent** with targeted feedback plus that session id — the resumed session keeps Codex's memory of what failed, which beats a cold re-dispatch. After ~3 rounds without convergence, stop and escalate to the user.

## Reading the report

1. Verification claims are checked, not trusted: the `── run info ──` footer records the commands actually run and their exit codes — compare it against what the report claims. For load-bearing changes, rerun the key acceptance command yourself or dispatch `codex-reviewer` in a fresh session.
2. Open Questions are mandatory work: decide and continue, or escalate. Never silently drop them.
3. When chaining dispatches, pass forward summaries, not full reports.

## Escalate to the user

Irreversible or outward-facing actions (deletes, pushes, deploys, migrations); direction choices the spec doesn't settle; 3+ rounds without convergence (model disagreement is signal — present both positions); anything needing danger-full-access.

## Diagnostics and custom agents

`/codex4claude:setup` checks the runtime; `/codex4claude:status` lists recent runs. The four built-in engine roles cover nearly everything — express one-off needs in the spec, not in a new agent definition. Define a custom engine agent (`references/agent-authoring.md`) only when the same task shape has recurred across sessions with stable constraints.

---
name: codex
description: Delegate heavy coding work to Codex (gpt-5.6-sol) via the codex MCP tools — implementation against a spec, broad codebase reading, hard algorithmic problems, or an independent second-model review. Use whenever a task involves substantial code writing or reading, or ICPC-level algorithms.
---

# Codex as a tool

Each call to the `codex` MCP tool hires one independent Codex instance: it works inside the repo and returns `{threadId, content}`. Treat it like a gig worker — describe the job precisely, review the result, reply if needed, move on. There is no team to manage.

## When to use it

- Implementing a spec'd change, mechanical refactors, test writing
- Broad codebase reading ("how does X work here") — saves your own input tokens
- Hard algorithmic problems — Codex at high effort is extremely strong when the problem statement is precise
- Independent review of a change (a second model has different blind spots)

Keep for yourself: design decisions, conversations with the user, final acceptance. Your leverage is planning — distill each stage into key, well-specified jobs and hand them off; the quality ceiling of a delegation is set by your description, not by Codex.

## How to call

Tool `codex`:

- `prompt` — the job. Codex starts cold: include background (why), relevant file paths and current state, the task itself, executable acceptance criteria, and constraints (what not to touch).
- `sandbox` — `"read-only"` for investigation/review, `"workspace-write"` for implementation. `"danger-full-access"` only with the user's explicit approval.
- `cwd` — absolute path of the repo to work in.
- `config` — `{"model_reasoning_effort": "xhigh"}` for key or genuinely hard tasks; precise specs make high effort pay for itself.

`content` is Codex's final message. Keep the `threadId` when follow-up is plausible.

## Iterating and parallelism

- Not satisfied → `codex-reply` with the `threadId` and targeted feedback. The session keeps its full context, so a reply beats re-hiring. After ~3 unproductive rounds, stop and rethink the spec or escalate to the user.
- Independent read-only jobs can run as parallel `codex` calls — every call is its own session/threadId. Don't run two write jobs in the same repo simultaneously.

Model is pinned to `gpt-5.6-sol` by the server registration.

# Authoring a custom Codex agent

Creating an agent is the exception, not the default. Almost every need is met by writing a better spec for a built-in agent; one-off requirements, project context, and acceptance criteria all belong in the spec. Define a new agent only when the same specialized task shape keeps recurring across sessions, its role and constraints are stable, and the built-ins' framing actively gets in the way. If in doubt, don't — a growing zoo of narrow agents fragments the work and drifts the task.

Persist user-scope by default, `--project` to commit it with the repo:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex4claude.mjs" agent define <name> [--project] <<'EOF'
---
description: One line, shown in agent list
sandbox: read-only            # read-only | workspace-write | danger-full-access
effort: high                  # low | medium | high | xhigh | max | ultra (optional)
---
# <Name>
...body...
EOF
```

Model is fixed (gpt-5.6-sol); it cannot be set per agent.

## Body structure

gpt-5.6-sol works best with lean prompts: state each rule exactly once, cut anything that repeats or hedges. Use this shape (the built-ins are the reference implementations — `agent show implementer`):

1. **Role paragraph** — one paragraph: what the agent is in the two-model system, and the fact that the orchestrator reads only its final message and may continue the session.
2. **Goal** — what "done" means, including how missing inputs are handled (e.g. "derive acceptance criteria and state them").
3. **Autonomy** — one concentrated paragraph drawing the action boundary: what it may do to completion without pausing, and where the scope edge is. This is the guard against 5.6's scope-expansion tendency; be explicit that out-of-scope discoveries go to Open Questions, not fixed in passing.
4. **Constraints** — a short numbered list of domain rules, each stated once. Always include "reply in the language of the task prompt".
5. **Report** — open with "Lead with the conclusion" (never a bare "be concise" — it shortens answers instead of sharpening them), then one concrete example of the final message ending in the shared sections `## Summary`, `## Files Changed` / `## Findings`, `## Verification`, `## Risks`, `## Open Questions` (omit inapplicable ones). Verification entries are the command plus its actual output — this convention is what makes reports reviewable; keep it in every agent.

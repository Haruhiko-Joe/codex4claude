# Authoring a custom Codex agent

Define when a recurring task type doesn't fit the built-ins. Persist user-scope by default, `--project` to commit it with the repo:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex4claude.mjs" agent define <name> [--project] <<'EOF'
---
description: One line, shown in agent list
sandbox: read-only            # read-only | workspace-write | danger-full-access
effort: high                  # minimal | low | medium | high | xhigh (optional)
---
# SYSTEM PROMPT for <Name>
...body...
EOF
```

Model is fixed (gpt-5.6-sol); it cannot be set per agent.

## The seven-section body template

Write the body with these sections. The reasoning behind each matters more than the headings:

1. **ROLE DEFINITION** — what the agent is AND is not responsible for. Boundaries prevent scope creep ("you implement; you do not decide requirements").
2. **Task Background** — where it sits in the system: "a Claude orchestrator reads only your final message, reviews it, and may send follow-up feedback in the same session." An agent that understands the why handles edge cases better than one following rigid MUSTs.
3. **ABOUT THE TASK** — what "done" means; how the output is consumed downstream.
4. **INPUT** — the format it will receive (our task blocks: Background / Input / Task / Constraints).
5. **CONSTRAINTS** — domain rules. Always include "reply in the language of the task prompt".
6. **SOP** — numbered steps from receiving the task to reporting.
7. **Output Example** — one concrete example of the final message. Show, don't tell: end with report sections `## Summary`, `## Files Changed`, `## Verification`, `## Risks`, `## Open Questions` (omit inapplicable ones). This convention is what makes reports reviewable — keep it in every agent.

Study the built-ins first (`agent show implementer`) — they are the reference implementations of this template.

---
description: Check the codex4claude runtime (codex CLI, model, data dir)
---

Run this and report the outcome to the user:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex4claude.mjs" doctor
```

If it reports problems, explain what's missing (codex CLI installation, login via `codex login`, or data-dir permissions) and how to fix it. If OK, briefly list the available agents (`agent list`) so the user knows what's ready to use.

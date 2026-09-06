---
description: Check codex4claude compatibility (Codex CLI >= 0.153.4, configured model, data directory)
---

Run this and report the outcome to the user:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex4claude.mjs" doctor
```

If it reports problems, explain the missing CLI, unsupported version, or data-directory permissions and the relevant fix. If OK, explain that tasks use `run [PROMPT]` directly, default to read-only, and use `--write` for authorized edits or `--session <id>` to continue. This check does not call the model or establish account access; authentication uses the existing Codex login.

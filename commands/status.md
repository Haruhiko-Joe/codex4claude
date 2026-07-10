---
description: Show recent codex4claude runs in this workspace
---

Run this and relay the output to the user in a compact form:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex4claude.mjs" status
```

If arguments were given ($ARGUMENTS), treat the first as a run id: `status <run-id>`, and if it is finished, show `result <run-id>` instead.

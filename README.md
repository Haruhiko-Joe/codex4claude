# codex4claude

A minimal Claude Code plugin that puts Codex (`gpt-5.6-sol`) at Claude's fingertips as an on-demand delegate tool. Each call hires one independent Codex instance — like a gig worker: Claude describes the job precisely, reviews the result, replies to iterate, and moves on. No agent zoo, no orchestration framework.

## What it is

- **`.mcp.json`** registers Codex's own MCP server (`codex mcp-server`), which exposes exactly two tools:
  - `codex` — start a session: `{prompt, sandbox, cwd, config}` → `{threadId, content}`
  - `codex-reply` — continue one: `{threadId, prompt}` → `{threadId, content}`
- **One short skill** (`skills/codex/SKILL.md`) that tells Claude when to delegate (implementation, broad reading, hard algorithms, second-model review), how to write the job description, and how to iterate via `codex-reply`.

Model is pinned to `gpt-5.6-sol` in the server registration. Sessions are multi and independent — parallel read-only jobs are fine, each with its own `threadId`.

## Requirements

- Codex CLI ≥ 0.144.0 on PATH, logged in (`codex login`)

## Install

```
/plugin marketplace add Haruhiko-Joe/codex4claude
/plugin install codex4claude@codex4claude
```

Or for local development: `claude --plugin-dir /path/to/codex4claude`.

Long-running jobs: Codex tool calls can take minutes; if they hit your MCP tool timeout, raise `MCP_TOOL_TIMEOUT` in your environment.

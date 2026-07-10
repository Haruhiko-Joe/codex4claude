---
name: parallel-explore
description: Fan out several read-only investigations in parallel, then synthesize
agents: explorer
---
# Workflow: parallel-explore

For questions that decompose into independent investigations (e.g. "how do auth, caching, and logging each work here").

## Step 1 — fan out
Split the question into independent sub-questions. For each, start a background run:
`run explorer --background "<sub-question>"` (read-only runs are safe to parallelize).
Note each returned run id.

## Step 2 — harvest
Poll `status` until all finish, then `result <run-id>` for each.
For long waits, delegate polling to the `codex-runner` subagent instead of polling in your own context.

## Step 3 — synthesize
You merge the reports yourself: reconcile contradictions (spot-check via `log <id> --grep` if two reports disagree), then answer the original question. Do not delegate the synthesis.

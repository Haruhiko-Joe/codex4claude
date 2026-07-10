---
name: feature-dev
description: Explore → implement → review loop for a feature or nontrivial change
agents: explorer, implementer, reviewer
max_review_loops: 3
---
# Workflow: feature-dev

You (the orchestrator) run each step, review its report, and decide progression. Never skip the gate checks.

## Step 1 — explore (read-only, fresh session)
Run `explorer` with the feature request: what code is involved, where changes go, risks.
**Gate**: if Open Questions touch requirements, escalate to the user before implementing. Otherwise decide the spec yourself and record it in the Step 2 prompt.

## Step 2 — implement (workspace-write)
Run `implementer`. Prompt = background (why) + explorer's conclusions (summarize; don't paste its full report) + concrete spec + executable acceptance criteria.
**Gate**: the Verification section must pass. If it doesn't, send targeted feedback via `--continue` before any review.

## Step 3 — review (read-only, fresh session)
Run `reviewer` with: the changed file list (from run info), the spec, and the implementer's summary.
**Gate**:
- verdict pass → present the result to the user.
- verdict fail → forward the findings verbatim as feedback: `run implementer --continue`, then re-run Step 3.
- More than {max_review_loops} loops → stop and escalate to the user with both sides' latest reports.

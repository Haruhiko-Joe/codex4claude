---
name: fix-with-review
description: Bug fix with independent verification — implement ↔ review checker loop
agents: implementer, reviewer
max_review_loops: 3
---
# Workflow: fix-with-review

For bug fixes where a wrong fix is expensive. The reviewer is the checker; retries keep the implementer's session so it learns from feedback.

## Step 1 — fix (workspace-write)
Run `implementer` with: reproduction steps or failing test, expected behavior, and the constraint "add a regression test that fails before the fix and passes after".
**Gate**: the regression test passes (see run info).

## Step 2 — independent review (read-only, fresh session)
Run `reviewer` with the changed files and the bug description. Ask specifically: does the fix address the cause or mask the symptom, and does the regression test really pin the bug?
**Gate**:
- pass → report to user.
- fail → `run implementer --continue` with the findings, back to Step 2.
- More than {max_review_loops} loops or reviewer/implementer deadlock on approach → escalate to the user; a disagreement between the two models is signal, not noise. Include both positions.

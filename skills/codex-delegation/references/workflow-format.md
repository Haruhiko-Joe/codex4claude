# Workflow playbook format

A workflow is a markdown playbook YOU execute step by step — there is no engine. Every step's report passes through you; that's the point (no step may be hidden from the orchestrator or the user).

Location: `.claude/codex-workflows/<name>.md` (project, committable) or `~/.claude/codex4claude/workflows/<name>.md` (user). Discover with `workflow list`, read with `workflow show <name>`.

```markdown
---
name: my-workflow
description: One line for workflow list
agents: implementer, reviewer        # which agents it uses (informational)
max_review_loops: 3                  # any parameters your steps reference
---
# Workflow: my-workflow

One paragraph: when to use this.

## Step 1 — <label> (<sandbox>, fresh|continue)
Which agent to run; how to build its prompt (what context to pass forward —
summaries of prior reports, never full transcripts).
**Gate**: the check YOU perform on the report before advancing, and what to do
on failure (continue with feedback / escalate to user).

## Step 2 — ...
```

Rules of thumb:
- Every step has a **Gate** — a pass/fail check the orchestrator applies. No gate, no step.
- Retries use `--continue` (session keeps the failure context); cap loops and escalate past the cap.
- Parallel steps: read-only `--background` runs only.
- Escalation paths to the user are part of the workflow, not an afterthought.

Built-ins to crib from: `feature-dev` (pipeline), `parallel-explore` (fan-out), `fix-with-review` (checker loop).

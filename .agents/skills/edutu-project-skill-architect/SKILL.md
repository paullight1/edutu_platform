---
name: edutu-project-skill-architect
description: "Use when choosing or creating Edutu project skills or agents, onboarding an unfamiliar subsystem, or a task is not covered by the existing registry."
---

# Edutu Project Skill Architect

Read `agent-system/README.md` for the operating contract. This workflow is a
repository-aware assessor, not permission to install or activate arbitrary code.

## Workflow

1. Load `AGENTS.md`, applicable nested instructions, `agent-system/PROJECT_CONTEXT.md`,
   and `agent-system/registry.json`. Use `$edutu-repository-evidence` to inspect
   the current task's implementation, requirements, tests, and dependencies.
2. Run `python agent-system/scripts/edutu_agents.py inspect` and `recommend`
   with the task and changed paths. Treat output as advisory. Trace real call
   sites before concluding a capability exists or a specialist is needed.
3. Reuse existing workflows first, including the four reviewers registered
   from `code-review-agents/`. Read those files by path; their directory is not
   itself a promise of automatic skill discovery. Do not duplicate them.
4. Classify a gap: a one-off defect needs a regression test; a stable project
   rule belongs in instructions and automation; a recurring procedure may
   need a skill; independent work or permissions may justify an agent.
5. Propose the smallest useful addition. Specify trigger and non-trigger,
   exact evidence, protected rule, existing alternative, owner, tool permissions,
   expected cost, tests, and activation criteria. A bug is not a new convention.
6. For approved creation, use `$edutu-skill-maintenance`. Draft on a feature
   branch, evaluate, and obtain independent review. Never approve the creator's
   own permission expansion, tests removal, or production activation.

## Evidence

Return Observed / Inferred / Unknown, recommended existing skills, gaps,
proposed changes, relevant file paths and commit/blob identifiers, and checks
not run. Use `agent-system/templates/task-record.md` for a durable handoff.

## Stop conditions

Do not invent paths, integrations, agent availability, or test results. Missing
credentials block the affected check, not unrelated safe work. Do not purchase
services, provision API keys, call paid models, or silently install third-party
skills. A new skill remains a candidate until its stated evaluation is complete.

---
name: edutu-change-delivery
description: "Use when implementing an approved Edutu feature, bug fix, or focused refactor. Not for read-only analysis or release approval."
---

# Edutu Bounded Change Delivery

## Workflow

1. Read `agent-system/README.md`. Obtain the requirement, acceptance criteria,
   current evidence, authorized files, and constraints from the coordinator.
   Use `$edutu-repository-evidence`; do not start from memory alone.
2. Write a small task record with behavior, non-goals, tests, dependencies,
   risks, and rollback considerations. Preserve the current UI, navigation,
   legacy records, and disabled rollout flags unless the approved task changes them.
3. Work on an isolated feature branch or assigned worktree. Keep one writer
   per file set. Agree shared API/state contracts before parallel implementation;
   never revert another worker's edits or force-push a shared branch.
4. Add a regression or behavior test first. Observe its relevant failure,
   implement the smallest fix, and rerun. Test boundary cases and failure paths,
   not just mock call counts. Do not rewrite tests to accept broken behavior.
5. Read affected package scripts before execution. Inspect install lifecycle
   scripts before installing dependencies. Never run migrations, seeding,
   cleanup, live provider smoke tests, or deployment as routine validation.
6. Keep business rules in the API/domain layer and use existing components and
   shared contracts. Route auth/data work to `$edutu-api-data-safety`, opportunity
   work to `$edutu-opportunity-integrity`, and AI work to `$edutu-ai-evaluation`.
7. Hand the actual diff and acceptance criteria to the independent verifier.
   The implementer does not certify its own change or merge it.

## Evidence

Report changed files, requirement-to-test mapping, initial failure, commands
actually run with exit codes, final diff identity, residual risks, and explicit
PASS / FAIL / NOT_RUN / BLOCKED statuses.

## Stop conditions

Do not expand scope to fix unrelated baseline failures. Do not bypass security,
weaken acceptance criteria, remove failing gates, expose credentials, migrate
production data, or claim a feature is complete when its required check is blocked.

---
name: edutu-skill-maintenance
description: "Use when an Edutu workflow repeatedly fails, evidence anchors drift, skills conflict, or a new skill or agent needs evaluation, revision, or retirement."
---

# Edutu Skill Maintenance

## Workflow

1. Read `agent-system/README.md`, the registry, affected source evidence, and
   existing skills. Reproduce the gap with a concrete task; do not turn every
   one-off bug or preference into another workflow.
2. Write positive, negative, and adversarial cases before changing guidance.
   Use `agent-system/evals/scenarios.json` as a starting evaluation set.
   Compare no-skill/current-skill behavior with the candidate on equivalent
   inputs. Record actual failures, not imagined rationalizations.
3. Draft one focused change with clear trigger, workflow, evidence output, and
   stop conditions. Put project facts in `PROJECT_CONTEXT.md`; use automated
   checks for mechanical constraints. Reuse the four existing reviewer skills.
4. Run static validation and tooling tests. Separately run live-agent behavior
   cases in an authorized harness, with repeated trials and held-out cases.
   Structural PASS must never be recorded as agent-behavior PASS.
5. Have a reviewer assess trigger conflicts, correctness, cost, permissions,
   and regressions. Candidate -> evaluated -> maintainer-approved -> active.
   If no harness is available, mark behavior evaluation NOT_RUN and retain
   supervised candidate status. Do not self-approve activation.
6. When anchors change, inspect the code and update supported statements first;
   only then propose updated blob fingerprints. Never refresh hashes simply to
   silence CI. Keep versions and a reasoned retirement/replacement record.

## Evidence

Return the gap, source references, baseline/candidate results, held-out outcomes,
permission delta, change rationale, status, and rollback path. Save no raw user
profiles, CVs, production secrets, or sensitive prompts in evaluation artifacts.

## Stop conditions

Do not auto-install remote skills, escalate tools, enable production writes,
weaken tests, manufacture benchmark scores, or delete a useful skill without
review. An agent instruction cannot grant authority over runtime permissions.

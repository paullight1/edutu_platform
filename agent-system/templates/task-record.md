# Edutu task evidence record

Copy this template into the task's review artifact; never commit secrets or user data.
Replace every bracketed field. Unresolved fields stay explicitly Unknown/NOT_RUN.

## Task and identity

Task: [goal and acceptance criteria]
Authorized scope and non-goals: [boundaries]
Target branch: [approved review branch]
Source commit: [full SHA]
Working-tree identity: [clean, or diff hash plus untracked-file hashes]
Owned files and other workers: [one writer per file set]
Required reviewers: [roles selected with reasons]

## Evidence and requirements

Observed: [file, symbol/line, commit/blob, inspected behavior]
Inferred: [interpretation and supporting evidence]
Unknown: [missing facts and which conclusions they block]
Approved requirements: [requirement source, distinct from observed implementation]
Acceptance-to-test mapping: [criterion -> concrete test/check]

## Execution

| Check | Directory and exact command | Tested identity | Exit code | Status | Artifact/gap |
| --- | --- | --- | --- | --- | --- |
| [check] | [command actually run, or proposed only] | [SHA/diff] | [number or not run] | [PASS/FAIL/NOT_RUN/BLOCKED] | [evidence] |

Initial failing behavior: [actual result]
Implemented changes: [files and behavior]
Independent review: [reviewer evidence, not an invented endorsement]
Baseline failures versus new regressions: [comparison or unknown]
After-check modifications and retests: [record]

## Handoff

Implemented: [scope]
Verified: [scope]
Failed / not run / blocked: [distinct items]
Release verdict and reason: [ready/not ready; no automatic merge]
Risks and rollback/repair path: [specific]
Next bounded task: [one actionable task]
Context/skill changes proposed: [reviewed changes only]

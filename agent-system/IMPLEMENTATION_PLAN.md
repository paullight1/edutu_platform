# Edutu repository intelligence implementation plan

Approved scope: create project-aware skills and agents and publish them to
`paullight1/edutu_platform`. Baseline: `develop` at
`f5598344e68ac1afa315edb6149b030a60946378`.

## Design and constraints

Add nine repo-scoped skills, eight Codex role configurations, an evidence-backed
context map, an advisory router, a structural validator, source-drift checks,
and adversarial evaluation cases. Reuse the four existing `code-review-agents/`
reviewers. Keep application code, production data, credentials, feature flags,
existing workflows, and existing reviewer files unchanged. Publish a feature
branch and a draft PR to `develop`; do not merge or deploy.

The deterministic tooling uses Python 3.11+ standard library only. It must never
execute package scripts, call an AI provider, install skills, update evidence,
follow symlinks outside the checkout, or modify the repository. Skill prose is
not a security boundary. Runtime and connector permissions remain separately
controlled. Model-behavior evaluation must be distinguished from static tests.

## Task 1: Fail-first tooling tests

Create `agent-system/tests/test_edutu_agents.py`. Exercise CLI absence first,
then routing, malformed inputs, unsafe paths, missing references, source drift,
CRLF-preserving Git hashes, and manifest-only inspection using temporary
fixtures. Run `python -m unittest discover -s agent-system/tests -v` and capture
the missing-entrypoint failure before creating the implementation.

## Task 2: Deterministic support tooling

Create `agent-system/scripts/edutu_agents.py` with `validate`, `recommend`,
`inspect`, and `drift` subcommands. Inputs are a checked registry and repository
paths. Outputs are JSON with explicit scope and errors; invalid inputs return
nonzero. Routing is advisory, not proof of code behavior. Drift is read-only;
`--strict` fails on changed or missing anchored files.

## Task 3: Project workflows and roles

Create `.agents/skills/edutu-*/SKILL.md`, `.codex/agents/edutu-*.toml`, and
`.codex/config.toml`. Use explicit intake, workflow, evidence, stop conditions,
and handoffs. Keep agents model-neutral. Limit concurrently spawned agents to
three. Six roles default to read-only; implementation and verification may
write in the workspace, with verification writes limited by instructions to
isolated test artifacts. Do not claim that role prose restricts connector tools.

## Task 4: Evidence and maintenance

Create `agent-system/registry.json`, `evidence.json`, `PROJECT_CONTEXT.md`,
`README.md`, `templates/task-record.md`, and `evals/scenarios.json`. Record only
observations supported by inspected manifests, module registration, the
opportunities-controller excerpt, and existing reviewer contracts. Separate
approved target rules from observed implementation. Define draft/review/eval/
activation/retirement without automatic self-approval or invented eval results.

## Task 5: Integration and publication

Add a concise routing addendum to `AGENTS.md` without deleting existing guidance.
Add `.github/workflows/agent-system.yml` with read-only GitHub permissions and no
secrets. Run tool tests and pack validation locally. Check remote source hashes
against the inspected commit; do not label a partial local fixture as a full
checkout. Create one commit from the exact base tree, advance only the new
branch, create a draft PR to `develop`, and inspect remote files and checks.
Document actual commands/results and anything not run in `VERIFICATION.md`.

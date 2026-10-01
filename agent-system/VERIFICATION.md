# Authoring verification record

Date: 2026-09-06. Repository baseline: `paullight1/edutu_platform`, `develop`,
`f5598344e68ac1afa315edb6149b030a60946378`.

## Executed locally

Environment: Python 3.13.5, isolated exported package, no application checkout,
no credentials, no provider calls, no dependency installation.

| Check | Result | Evidence and scope |
| --- | --- | --- |
| Missing-entrypoint baseline | Expected FAIL | A CLI availability test failed before implementation; unittest exit 1. |
| `python -m unittest discover -s agent-system/tests -v` | PASS | 38 tests, 25.905 seconds, exit 0. Temporary-fixture safety tests plus five integration tests against the shipped registry. |
| `python agent-system/scripts/edutu_agents.py validate --pack-only` | PASS | Exit 0; nine skills, eight TOML roles, registry, and concurrency configuration structurally checked. Eight external checks explicitly skipped. |
| Original `AGENTS.md` preservation | PASS | Original bytes matched Git blob `1a8d8ec555a55134c5fbc9e6dfd386691070a572` before appending the routing/correction section. |

The symlink regression originally expected drift exit 1 for a registered manifest.
Registry input validation correctly rejects that earlier with exit 2. The test
was corrected to the declared invalid-input contract, and a separate anchor-only
symlink case verifies the unreadable drift result and exit 1. Safety was not relaxed.

Covered: advisory routing, existing reviewer reuse, unknown domains, deduplication,
malformed and duplicate JSON, invalid references, bounded agent configurations,
missing files, secret/traversal/symlink rejection, exact CRLF Git blob hashes,
changed/deleted evidence, and ensuring task text and manifest commands are not
executed. These are deterministic tool tests, not model-output evaluations.

## Repository evidence

The GitHub connector inspected the exact baseline and returned blob identities
for the 11 anchors in `evidence.json`. Scope distinguishes read contents, the
controller excerpt (lines 1-160), and two reviewer paths identified from the tree.
The context map deliberately makes no claim of a complete runtime-flow audit.
The final source tree is based on the baseline tree; original application files
and existing reviewers are not part of the changes.

The local package lacks four app manifests and four reused reviewer files;
pack-only validation lists these eight skips. A full clone was unavailable in
this environment. Full-checkout validation and strict evidence drift are
configured in the new GitHub workflow, but a workflow definition is not proof
of a passing remote run. Read the actual PR checks for their current results.

## Not run / not certified

- Native Codex discovery, spawning, and sandbox behavior: NOT_RUN; Codex was not
  available in the authoring container. TOML syntax was checked, runtime behavior was not.
- Baseline-versus-candidate LLM trials: NOT_RUN. All 13 cases in
  `evals/scenarios.json` retain NOT_RUN. No hallucination-reduction score is claimed.
- Independent second-agent review: NOT_RUN; the author performed a self-review.
- Whole-application tests, lint, builds, architecture boundary commands, staging
  smoke tests, and production verification: NOT_RUN. Application code was not changed.
- Production deployment, migrations, live billing, and branch-protection changes:
  NOT_PERFORMED and outside this contribution's scope.

The package is ready for supervised use and maintainer review, not a declaration
that eight live agents are continuously running or that autonomous behavior is
proven safe. Evaluate on the target coding runtime before autonomous promotion.

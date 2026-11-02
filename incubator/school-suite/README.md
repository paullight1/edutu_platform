# SchoolSuite — white-label school platform incubator

This is an **isolated experimental product** within a dedicated development branch. It is not connected to Edutu production routes or databases. No changes here should be merged or deployed before product, licensing and security reviews.

## Pinned upstream codebases

- `upstream/skuul`: [Skuul](https://github.com/yungifez/skuul), MIT, tag `v3.1.2`, pinned commit `ad3736307b338ee2b0c3a06086444cb55239c57b`. Selected as the prospective school ERP foundation; validate migrations and staging before adoption.
- `upstream/gegok12`: [GegoK12](https://github.com/Gego-K12/gegok12), MIT, tag `v1.1`, pinned commit `9e1f818a9188d403d6dcf8be533348f869bcdf67`. Maintained separately for comparison and selective *compatible* feature adaptation, not merged into Skuul source.

Both upstreams are tracked as Git submodules, rather than copying their source and losing provenance. To retrieve both repositories locally after checking out this branch:

```sh
git submodule update --init --recursive -- incubator/school-suite/upstream/skuul incubator/school-suite/upstream/gegok12
```

Do not run Skuul V3 development migrations on an existing V2 production database; upstream warns of destructive changes. Do not leave GegoK12's web installer accessible after setup. Preserve upstream MIT license/copyright notices. Independently review all dependencies and deployment permissions.

## Product direction

White-label operator portal, per-school branding, role-specific navigation, tenant-safe APIs, human-reviewed AI teacher assistance, configurable Nigerian school terms/fee formats, payment reconciliation and audit trail.

Only synthetic preview data is allowed at this stage. No parent or pupil personal data, payment keys, or credentials belong in this branch.

## Current working foundation

- Responsive, role-specific, multi-school UI preview in portal/ (run python3 -m http.server 4173 --directory incubator/school-suite/portal).
- Change sample institution and role; inspect demonstration dashboards, student search and fee statements. Preview data only; not live student records.
- AI teacher drafting service in services/ai-gateway/ (server-only access; no pupil data). Model credentials are optional and not committed.
- Syntax and offline integration tests in scripts/verify.sh (Node.js 20+).
- GitHub Actions checks run on this development branch without pulling the full upstream submodules.

Use Skuul as the first integration candidate and GegoK12 as a separate comparison baseline. Actual source folders are retrieved with git submodule update --init; no production rollout or modification of Edutu main has occurred.

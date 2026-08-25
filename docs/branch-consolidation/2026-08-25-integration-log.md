# Edutu Branch Consolidation Integration Log

**Baseline:** `fea6259d6d6ade688009bea0e29b16665d328b93`  
**Worktree:** `/Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder-integration-20260825`  
**Branch:** `integration/branch-consolidation-20260825`

## Baseline verification

| Surface | Command | Result |
|---|---|---|
| Architecture | `npm run check:architecture` | PASS — 8 critical-file budgets |
| Admin | `npm test` | PASS — 5 suites, 14 tests |
| Web | `npm test` | PASS — 61 suites, 336 tests |
| Mobile | `npm test -- --runInBand` | PASS — 110 suites, 796 tests |
| Backend | `npm run test -- --runInBand` plus cache-disabled retry of `main.spec.ts` | PASS evidence — 180 suites/1,994 tests completed in the full run; the only suite blocked by ENOSPC passed separately with 15/15 tests |
| Repository | `git status --short --branch` | PASS — clean after plan/design commit |

The backend full run encountered `ENOSPC` while writing Jest transform cache for `main.spec.ts`. The exact suite passed with `--no-cache`; this is recorded as an environmental disk-pressure event, not a source failure.

## Integration events

| Order | Source | Source SHA/commits | Method | Conflicts | Tests | Resulting SHA | Outcome |
|---:|---|---|---|---|---|---|---|
| 0 | consolidation plan/design | `fea6259d6d6ade688009bea0e29b16665d328b93` baseline | documentation commit | none | architecture + baseline suites above | `a2106b4a` | accepted |

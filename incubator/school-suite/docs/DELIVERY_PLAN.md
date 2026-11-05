# Product implementation plan and acceptance gates

## Completed on isolated foundation branch

- Two independently pinned MIT-licensed school ERP source submodules (Skuul and GegoK12), with provenance.
- Branded, responsive, synthetic-only role-based school portal preview.
- Example school themes and role navigation.
- Read-only example fee ledger and student search.
- Server-only AI teacher lesson draft gateway with input restrictions and explicit teacher review.
- Offline Node syntax checks and unit-test harness (execution status must be checked in CI).

## Next development milestones (not yet implemented)

1. Boot both ERP candidates in separate disposable environments. Capture install, permissions, feature, migration and performance findings.
2. Select a single ERP core; avoid running or merging competing data models in one database.
3. Implement trusted auth, tenant registry, RBAC, guardianship verification and read-only connectors.
4. Add academic term configuration, records, attendance and timetable operations.
5. Add fees, signed processor webhooks, idempotency and reconciliation.
6. Add teacher lessons, exams, results, review workflows and notifications.
7. Create independent brand deployment artifacts per school and run privacy/security tests with synthetic data.
8. Pilot with an approved institution; no real minors’ data before audit, data protection review and access testing.

**No production claim:** registration of source repos and a demonstration portal is not the same as an installed, tested or production-ready school management product.

## Definition of done for a paid school pilot

- Authorized parents can only access their linked child's records.
- A teacher cannot see another teacher's restricted class data.
- Every payment is verified by signed webhook and reconciles once.
- Student enrollment, attendance, exams, fees and reports reconcile end to end.
- School A cannot read or mutate School B's data, caches, uploads or AI transcripts.
- AI does not finalize grades or make irreversible decisions without staff approval.
- Automated unit, browser, integration, load and backup/restore tests pass.
- License notices preserved and dependency/security audits clear.

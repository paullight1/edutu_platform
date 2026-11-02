# White-label architecture and implementation decisions

## Separate the systems

- **Skuul v3.1.2**: candidate system of record for enrollment, classes, attendance, fee schedules and staff. Its upstream schema and code should remain clearly attributable and updateable.
- **GegoK12 v1.1**: reference implementation for comparative functionality and separately deployable pilot. It is NOT installed in the same database or merged into Skuul.
- **SchoolSuite portal**: configurable experience on top of verified server-side school APIs. Only sample fixtures are included.
- **AI gateway**: a separate service that accepts general curriculum topics and produces *drafts* for teacher approval. It never receives pupil records.
- **Future integration**: a backend-for-frontend (BFF) that signs in to school-specific ERP APIs using server-held credentials, applies authorization, logs changes and returns minimally necessary fields.

## Tenant separation

Use distinct per-school DBs and storage buckets during pilot. For multi-tenant SaaS later, choose explicit row-level tenant ownership or database-per-tenant with migration orchestration. Any cache or queue keys must include verified tenant ID. Never accept tenant IDs or school roles directly from untrusted requests as authorization.

A school configuration record should contain name, monogram, school domain, timezone, currency, palette, verified logo asset and allowed modules. Store tenant registry and secrets on the backend; the current portal/tenants.js exists for *public demo themes only*.

## Roles

- Super admin: platform health, tenant provisioning, licensing, audit, not unrestricted routine access to children’s records.
- Principal: academic operations and school-wide approved reports.
- Admin: admissions, student lifecycle, timetables and communications.
- Bursar: invoicing, reconciliation, refunds and audited adjustments.
- Teacher: assigned classes, attendance, lessons and assessments.
- Guardian: only verified linked learners’ information and fee statements.
- Learner: only their own authorized academic view.

Enforce these on the ERP/BFF server, including row-level scoping. The preview role switch is **not** enforcement.

## Funds and records

Invoice -> verified payment processor webhook (signature, amount, invoice/tenant match, idempotency) -> immutable ledger entry -> receipt -> reconciliation -> audit log. Never trust a client-side "paid" status. Use decimal monetary values at the application boundary and integer minor units in transfers.

## AI guardrails

Only send generic lesson topics, year/class level and objective to the gateway. Do not send child names, contact details, discipline notes, health records, evaluations, grades or unredacted submissions. AI output remains a suggestion; teacher explicitly approves any material used for instruction. Implement quotas, abuse prevention, output reviews and model/provider DPA before production.

## Delivery stages

1. Install and run Skuul/GegoK12 in distinct disposable development environments and compare support for required Nigerian school workflows.
2. Choose **one** ERP as the production core; maintain the other as a separate research/pilot source.
3. Connect one real school tenant through a secure BFF and implement role-scoped read-only student directory.
4. Attendance -> fees -> admissions -> academic records, with automated tests for isolation and audits.
5. Add teacher-reviewed AI, notifications, reporting, accessibility and load testing.
6. Conduct an external security assessment before processing minors’ real information.

No production release is implied by the demo or submodule registration.

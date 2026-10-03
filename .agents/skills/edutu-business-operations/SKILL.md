---
name: edutu-business-operations
description: Support Edutu billing operations, payment reconciliation, refunds, provider records, creator-payment controls, and operational reporting.
---

# Edutu Business Operations

Use for operational analysis and process design around money. Do not initiate refunds, change live pricing, grant entitlements, or alter production records unless the user explicitly requests the specific action.

## Workflow

- Reconcile provider events against Edutu's durable transactions, user/creator identity, currency, amount, status, and entitlement/credit state.
- Distinguish pending, failed, reversed, duplicated, disputed, and settled transactions. Preserve idempotency and an audit trail; never resolve a discrepancy by manually inflating a balance.
- Check web and mobile billing behavior, Paystack/RevenueCat webhook ownership, refund path, and user communication before recommending an action.
- Escalate code or data-integrity issues through `edutu-backend-engineering` and `edutu-security-privacy`; keep finance review distinct from implementation.
- Report the reconciled facts, discrepancy, safe next step, and unresolved provider evidence.

## References

- `docs/API.md` (billing routes)
- `docs/ARCHITECTURE.md` (marketplace and entitlements)
- `docs/OPERATIONS.md`

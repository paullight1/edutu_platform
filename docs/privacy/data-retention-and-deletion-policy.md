# Edutu data retention and account deletion policy

Status: proposed operational policy, 1 November 2026. This policy must be implemented and checked against applicable law, payment-provider contracts, and actual backup and processor settings before it is published or represented as current practice.

## Principles

Keep identifiable information only for a documented purpose and no longer than necessary. Restrict access, minimise retained fields, review retention at least annually, and record the reason and expiry for any exception. A legal hold suspends deletion only for the relevant records and duration. The privacy lead records and reviews holds and instructs processors when they end.

## Proposed retention schedule

| Data | Proposed rule |
| --- | --- |
| Account profile, goals, saved opportunities, CVs, documents, AI memories, uploads and private content | Keep while the account is active; delete on a verified account-deletion request, subject to the exceptions below. |
| Shared conversations and community contributions | Remove the departing person's identifying profile and replace their author reference with a non-identifying deleted-user marker where technically possible. Preserve other people's content and conversation structure. Remove material where anonymisation cannot be achieved safely or a valid removal request requires it. Do not delete other users' replies merely because a parent account is deleted. |
| Purchases, invoices and payment disputes | Keep only the minimum records needed for tax, accounting, fraud prevention, disputes and legally required retention. Restrict access and separate them from the active profile; establish jurisdiction-specific expiry dates with the finance/privacy owner rather than assume a universal period. Do not retain payment card details. |
| Security, abuse and support records | Keep only what is needed to resolve an incident, protect users or meet a legal obligation; document the reason and review date. Redact unrelated content and restrict access. |
| Backups | Remove deleted data when backups expire under a documented backup rotation schedule. Prevent restoration from making a deleted account active again; reapply deletion records after restoration. Confirm actual backup schedules and processor practices before promising a deadline. |
| Third-party processors | Request deletion or apply the processor's documented deletion process where Edutu controls the data. Record each processor's handling and retention exceptions, including identity, AI, payments and error monitoring. |

## Requests and controls

Accept requests through the in-app account deletion flow and a publicly accessible web route. Verify account ownership without demanding unnecessary identity documents. Record receipt, scope, progress, exceptions and completion; respond within the applicable legal period. If processing fails, keep the request pending and retry without falsely reporting success. Delete or anonymise all mapped stores, including local caches and storage objects, before marking the relevant step complete. Cancel or revoke sessions and prevent delayed provider events from recreating a deleted account. Keep a minimal deletion tombstone only as needed for this purpose and give it a documented expiry.

Implementation targets, not current service commitments: acknowledge verified requests within 7 days, complete ordinary deletion within 30 days, and expire backup copies within 90 days. A shorter applicable legal deadline takes precedence. The privacy lead must document and notify the requester about an authorised exception or delay. These targets cannot be published as operational promises until staffing, automation, backups and processor contracts have been verified against them.

Inventory each table, storage prefix, shared-content relationship, provider and backup; establish deletion ownership, ordering, idempotency and verification for each. Test with disposable accounts, shared conversations, payment records, retries, partial failures and restored backups before enabling automated production deletion. Never run destructive validation on real user accounts.

## Public disclosure and review

The public privacy and deletion pages must explain the request process, categories deleted or retained, reasons for retention and verified retention periods. Do not claim that the mobile flow removes billing records or that requests are completed within a fixed time until the process can deliver those claims. Review the schedule with qualified privacy and finance advisers for Edutu's operating jurisdictions and provider contracts.

References: [Nigeria Data Protection Commission privacy principles](https://ndpc.gov.ng/our-data-privacy-policy/); [Google Play account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111).

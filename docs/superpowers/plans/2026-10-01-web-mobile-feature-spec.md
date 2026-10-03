# Web feature expansion scope

The requested web additions are AI coach with voice mode; CV builder and AI tools; application copilot; My Documents; saved searches and matching alerts; goals; and finally payment.

Build browser-native interfaces in edutu-web-app using the existing mobile behavior as the reference. Reuse the NestJS backend at backend/services/services/api and existing account data wherever contracts allow. All new client data access goes through the backend with Clerk authentication.

Payment scope is assumed to mean end-user Pro access, AI credit purchases, balance and transaction history, with entitlements shared between web and mobile. Trace API-branded products to fulfillment and spending before deciding whether credits share a ledger or require distinct products/balances. Preserve Lite/Pro/Scholar distinctions. Prices, quotas, and the supported payment-provider routing must come from the existing backend configuration; this request does not establish new prices or promise unlimited use.

Roadmap catalogs, Creator Studio, referrals, and native widgets are outside this request. Goals are personal goals with optional links to opportunity preparation; the existing My Plan experience remains the place for opportunity journeys.

This is a source-grounded implementation proposal, not confirmation of deployed API behavior. Validate existing contracts and persistence before implementing each subsystem.

First delivery includes all requested feature categories; incremental milestones do not redefine completion. Full CV parity also includes LinkedIn file import and the shipped mobile template/section set. Do not silently overwrite cross-device CV/essay edits. Saved-search delivery follows the existing digest policy. Local-only mobile files appear on web only after mobile sync. New binary-upload transport requires an explicit architecture decision under the backend-only convention.

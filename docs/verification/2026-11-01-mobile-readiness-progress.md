# Edutu mobile readiness progress — 1 November 2026

This is a work-in-progress record, not a production approval.

- Google Play production remains inactive. The existing internal-test release (version code 5) was built with retired service addresses and must be replaced before meaningful testing.
- EAS production settings now point new builds to the self-hosted Edutu API and Supabase. Android validation build 8 completed using those settings; it predates subsequent local fixes and is not the final release candidate.
- The self-hosted `delete-account` function was not available during verification. The local replacement deliberately returns an error until shared-content anonymisation, financial retention, identity deletion and retry safety are implemented. Do not deploy it as a completed deletion solution.
- A proposed retention policy is in `docs/privacy/data-retention-and-deletion-policy.md`. Its implementation targets and legal/processor requirements must be verified before publication.
- Local changes add account-scoped CV access and cleanup, a support-email fallback on deletion failure, a server-confirmed subscription restore, and fractional-second iOS call-expiry parsing. A physical iPhone test is still required for PushKit behavior.
- Remaining launch work includes comprehensive deletion and webhooks, AI-data disclosure and consent, child-safety review for the selected teenage audience, store data-safety and content-rating forms, real device screenshots, verified app links, paid purchase/restore flows, and Android device testing.
- A revised privacy page is local only. Its deletion-process language must be checked against the actual operational process before deployment.

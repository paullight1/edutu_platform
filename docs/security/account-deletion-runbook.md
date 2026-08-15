# Account deletion security runbook

The canonical deletion function is
`edutumobile/supabase/functions/delete-account/index.ts`. It authenticates the
Clerk subject, rejects a mismatched body user ID, uses a fixed server-owned
deletion target list, removes known private storage prefixes, and returns only
stable generic responses. It never accepts a table, column, bucket, or object
path from the caller.

Before production enablement, operators must reconcile the fixed target list
against the live schema and retention/legal requirements. The function treats
missing optional legacy tables as absent, but any other database or storage
failure aborts the operation with a generic service error. Auth-provider
session invalidation must be verified separately because the current Clerk
integration does not expose a repository-local deletion API.

Required live verification:

- confirm the production Supabase project and deployed function revision;
- verify all user-owned tables, private storage buckets, and retention rows;
- run an authenticated own-account deletion and a mismatched-user negative test;
- verify a repeated deletion is harmless and no user-owned storage remains;
- run Security and Performance Advisors for the identified project and record
  UTC timestamps/results before release.

`report-ai-content` uses the same issuer-authenticated boundary, bounded input,
exact configured origins, generic error responses, and PII-safe server logs.

# Secret Rotation and Exposure-Response Runbook

This runbook covers credentials that may have appeared in repository history or were identified by prior security reviews. Removing a value from the current tree, adding it to `.gitignore`, or rewriting code does **not** invalidate a credential that was previously exposed. Production security sign-off requires provider-side rotation or revocation plus evidence that the replacement is in use.

Never place secret values, screenshots containing values, or copied provider responses in this document, issues, pull requests, or CI logs.

## Credentials in scope

At minimum, inventory and rotate any historically exposed or uncertain values in these groups:

- Supabase service-role credentials;
- PostgreSQL passwords and direct `DATABASE_URL` credentials;
- AI-provider credentials, including any Gemini, OpenRouter, or legacy DeepSeek keys still configured;
- `API_KEY_PEPPER` and other API-key hashing material;
- n8n/webhook authentication keys;
- payment or subscription-provider secrets if repository history or audit evidence indicates exposure.

The provider dashboard or secret manager is the source of truth for whether a credential is active. Do not infer safety from the current Git tree alone.

## Rotation order

1. **Create an inventory.** Record each credential owner, provider, environments using it, deployment destinations, edge functions, scheduled jobs, and rollback contact. Record identifiers only, never values.
2. **Assess compatibility.** Determine whether the provider supports overlapping old/new credentials. For non-overlapping rotations, prepare an approved maintenance and rollback sequence.
3. **Create the replacement at the provider.** Use a least-privileged credential where supported. Do not revoke the old value until all required destinations can be updated, unless active abuse requires immediate revocation.
4. **Update every runtime destination.** This may include backend hosting, Supabase Edge Function secrets, Vercel projects, automation services, mobile/web build environments, CI secrets, and approved local secret managers.
5. **Redeploy affected runtimes.** A secret-store update alone does not prove a running process has reloaded the replacement.
6. **Verify the replacement before revocation.** Use the checks below and retain timestamps, deployment IDs, and operator names.
7. **Revoke or invalidate the old credential at the provider.** Confirm the old value can no longer authenticate.
8. **Monitor after rotation.** Review authentication failures, provider audit logs, billing anomalies, webhook failures, and application error rates.

## Service-specific precautions

### Supabase service role and PostgreSQL

- Update every service-role consumer and every direct database connection.
- Verify `GET /health/live` succeeds independently of storage.
- Verify `GET /health/ready` returns HTTP 200 and reports the database as `up`.
- Execute one authenticated, non-destructive learner read and one authorized server-side operation that proves the privileged path works.
- Confirm the previous service-role key/password is rejected after revocation.

### AI providers

- Rotate every provider key that may have been exposed, not only the currently preferred provider.
- Verify a low-risk AI request through the server-side routing layer.
- Confirm usage accounting, timeout policy, and provider attribution remain correct.
- Revoke the old key and review provider usage logs for activity after the suspected exposure date.

### `API_KEY_PEPPER`

Rotating the pepper can invalidate all issued `/v1` API keys because stored hashes can no longer be reproduced. Before rotation:

- query the authoritative consumer/key inventory;
- prepare a re-issuance and partner-notification plan;
- rotate during an approved window;
- issue replacement keys through the normal secure channel;
- verify old keys fail and new keys pass metering and rate-limit checks.

Never assume the consumer table is empty based on an old review.

### Webhooks and payment providers

- Rotate signing or API secrets through the provider dashboard.
- Update every receiving runtime before revoking the old value where overlapping secrets are supported.
- Replay only provider-approved test events.
- Verify signature rejection for an invalid or retired secret and idempotent acceptance for a valid test event.

## Required evidence

Use a private operational record with one row per credential:

| Field | Required evidence |
| --- | --- |
| Credential identifier | Provider/project/environment and secret name; no value |
| Exposure basis | Audit finding, commit reference, or uncertainty requiring precautionary rotation |
| Replacement created | Provider audit timestamp and operator |
| Destinations updated | Secret-manager/deployment identifiers |
| Runtime redeployed | Deployment ID and timestamp |
| Positive verification | Health/request/test-event evidence |
| Old credential revoked | Provider audit timestamp |
| Negative verification | Evidence that the old credential is rejected |
| Monitoring review | Error, usage, and billing review result |

## Completion gate

Rotation is complete only when every in-scope credential has positive replacement verification, provider-side invalidation of the old value, negative verification that the old value fails, and a post-rotation monitoring review. A merged pull request or green CI run is not sufficient evidence.

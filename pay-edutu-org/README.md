# Legacy pay.edutu.org compatibility app

New Edutu web and mobile purchases use a server-created Bachs session and open
the validated Bachs-hosted checkout directly. Bachs returns the browser to the
Edutu wallet, which verifies the owner-scoped intent through the Nest API.
Neither checkout nor subscription management requires this Next.js app or a
separate Dokploy payment service.

This app retains the former single-use handoff and result/account pages for
compatibility. Do not configure its shared secret as a prerequisite for new
checkout. Production deployment work is managed through Dokploy.

## Legacy app configuration

If the compatibility app is still deployed, it needs:

- `DEPLOYMENT_PLATFORM=docploy`
- `EDUTU_BILLING_API_URL`: canonical HTTPS Nest API origin without a path.
- `PAY_SHELL_ORIGIN=https://pay.edutu.org`.
- `BILLING_PAY_SHELL_API_KEY`: a dedicated server secret of at least 32
  characters, identical to the legacy API setting. Never use a `NEXT_PUBLIC`
  name.

The legacy flow uses the pay-shell session migrations. New Bachs purchases
instead require a valid server-side Bachs catalog and API configuration, a
verified signed webhook, and successful provider price checks. Do not enable
live purchases until sandbox lifecycle and reconciliation checks pass.

## Commands

```bash
npm test
npm run typecheck
npm run build
```

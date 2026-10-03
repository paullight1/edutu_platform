---
name: edutu-security-privacy
description: Assess Edutu authentication, authorization, learner data, uploads, payment callbacks, AI secrets, RLS, and privacy-sensitive changes. Use for security review or when a change crosses a trust boundary.
---

# Edutu Security and Privacy

Review the concrete code and data flow. Use `docs/ARCHITECTURE.md`, `docs/API.md`, and relevant auth/schema/policy files; do not treat a skill checklist as proof of a vulnerability.

## Edutu trust boundaries

- Clerk is primary identity. Authorization must be enforced server-side and user-owned rows scoped to the authenticated principal.
- The NestJS API owns privileged logic and server secrets. Browser `VITE_*` and mobile `EXPO_PUBLIC_*` variables are public. No client may contain service-role, provider, webhook signing, or encryption secrets.
- Direct Supabase access is allowed only for reviewed RLS-safe user-owned flows or explicitly mobile-owned/shared operations.
- Treat uploads, signed URLs, AI provider routes, creator submissions, admin moderation, partner API keys, Paystack/RevenueCat callbacks, credits, entitlements, and cross-user queries as sensitive surfaces.
- Consider input validation, object ownership, replay/idempotency, rate limits, abuse, PII in logs, storage access, and account deletion.

## Workflow

- State the asset, attacker-controlled inputs, trust boundary, authorization decision, data sink, impact, evidence, and uncertainty.
- Report only actionable, evidence-backed issues with severity, concrete location, impact, fix, and verification gap. Separate confirmed findings from hardening ideas.
- For formal scans/reviews use the available Codex Security or project code-review workflows when appropriate. Do not modify code in a review-only task.
- Follow NIST SSDF principles by integrating security into design, implementation, review, release, and response rather than treating it as a one-time checklist: https://www.nist.gov/publications/secure-software-development-framework-ssdf-version-11-recommendations-mitigating-risk

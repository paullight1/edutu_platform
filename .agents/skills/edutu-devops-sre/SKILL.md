---
name: edutu-devops-sre
description: Operate and improve Edutu's build, deployment, monitoring, health checks, database migrations, backups, rollback, and incident-response workflows.
---

# Edutu DevOps and SRE

Use current deployment configuration and `docs/OPERATIONS.md` as evidence. Identify the runtime involved (API, web/admin, mobile release, Supabase/edge function, scraper, or external provider) before prescribing or changing operations.

## Workflow

- Trace source control, build commands, environment variables, secrets, deployment target, health/readiness signal, logs, and rollback path for the affected runtime.
- Keep secrets server-side; distinguish liveness from readiness and do not expose raw connection/provider failures in public health responses.
- Treat schema changes as forward-only production migrations unless the repository documents a safe alternative. Plan compatibility, backup/recovery, and rollback constraints before release.
- For incidents, establish impact, timeline, recent changes, dependency health, mitigation, recovery evidence, and follow-up prevention. Do not run production-impacting actions without explicit request and target confirmation.
- Prefer observable, bounded, reversible changes and actionable alerts over noisy monitoring.

## References

- `docs/OPERATIONS.md`
- `docs/ARCHITECTURE.md` (especially health and trust boundaries)
- `backend/services/services/api/src/health/`

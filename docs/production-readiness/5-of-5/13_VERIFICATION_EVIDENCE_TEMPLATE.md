# 5/5 Verification Evidence Template

Copy this section into a feature PR/review record. A checkbox without evidence is not a pass.

## Feature

- **Name:**
- **Plan file:**
- **Owner:**
- **Baseline score:**
- **Candidate score:** 5/5
- **Commit/PR:**
- **Environment verified:**

## 1. UI Completeness

- [ ] Desktop layout verified.
- [ ] Mobile layout verified.
- [ ] Loading state verified.
- [ ] Empty state verified.
- [ ] Filtered-empty state verified where applicable.
- [ ] Network/server/auth-expired error states verified.
- [ ] Success/confirmation state verified.
- [ ] Destructive-action confirmation/undo verified where applicable.

**Evidence:** screenshots/test names/URLs or automated visual report.

## 2. UX Completeness

- [ ] Primary user journey completes without dead-end.
- [ ] Back/forward/deep-link behavior verified.
- [ ] Retry behavior verified.
- [ ] Cross-session persistence verified.
- [ ] Cross-device behavior verified where applicable.
- [ ] Copy accurately describes real product behavior.

**Evidence:** browser/E2E test names and results.

## 3. Functionality

- [ ] Business state machine tests pass.
- [ ] Duplicate/retry operations are safe.
- [ ] Concurrent operations are safe where relevant.
- [ ] Server is source of truth for privileged/business-critical state.
- [ ] No mock/synthetic-success production path remains.

**Evidence:** focused unit/integration/E2E command output and test names.

## 4. Security

- [ ] Authentication required where intended.
- [ ] Horizontal authorization tests pass.
- [ ] Vertical/role authorization tests pass.
- [ ] Input/file/URL validation tested.
- [ ] Rate/abuse controls verified.
- [ ] RLS/table/function ACLs verified against the target database where relevant.
- [ ] Logs contain no secrets/sensitive payloads.
- [ ] Dependency audit has no unapproved High/Critical findings.

**Evidence:** security test output, ACL query results, dependency report.

## 5. Maintainability

- [ ] API/data contracts are typed and canonical.
- [ ] Ownership/module boundary is documented.
- [ ] No duplicate source-of-truth path introduced.
- [ ] Errors use shared typed handling.
- [ ] Complex state has tests rather than comments-only guarantees.
- [ ] Legacy compatibility code has an explicit removal condition/date when retained.

**Evidence:** file list, architecture notes, contract tests.

## 6. Efficiency & Performance

- [ ] Critical API p95 is within the feature budget.
- [ ] Page Web Vitals/bundle budget is within threshold where applicable.
- [ ] Large lists use bounded pagination/querying.
- [ ] Network requests are deduplicated/cancellable where appropriate.
- [ ] Load test passes for scale-sensitive features.
- [ ] Poor-network/mobile profile verified for learner-facing flows.

**Evidence:** benchmark/load/Web Vitals output.

## 7. Accessibility

- [ ] Keyboard-only journey passes.
- [ ] Focus order/dialog focus management passes.
- [ ] Screen-reader labels/status announcements verified.
- [ ] Contrast/touch targets meet WCAG 2.1 AA/product standards.
- [ ] Reduced motion behavior verified.

**Evidence:** axe/accessibility report plus manual notes for critical journey.

## 8. Observability

- [ ] Success/failure events are emitted.
- [ ] Request ID/correlation works across relevant services.
- [ ] Dashboard/query can find failures.
- [ ] Alert exists for user-impacting systemic failure.
- [ ] Alert has threshold, owner and runbook.
- [ ] Telemetry is real rather than a no-op success façade.

**Evidence:** dashboard panel/query/alert/runbook links or screenshots.

## 9. Deployment & Rollback

- [ ] Production build passes.
- [ ] Required CI checks pass.
- [ ] Migration drift is understood/zero unexplained drift.
- [ ] Preview/staging smoke passes.
- [ ] Feature flag/canary used for high-risk change where applicable.
- [ ] Rollback steps tested.
- [ ] Post-deploy production smoke passes.

**Evidence:** deployment IDs, CI run, smoke results, rollback test.

## 10. Final Gate

- [ ] No open P0 finding.
- [ ] No open P1 finding.
- [ ] All applicable global release gates are green.
- [ ] Product claims shown in UI are backed by real data/evidence.
- [ ] Reviewer agrees evidence justifies **5/5**.

### Final reviewer note

State the remaining P2/P3 improvements, if any, and explain why they do not block the 5/5 production definition.

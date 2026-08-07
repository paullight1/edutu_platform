# ADR 0001: Adopt feature-first modularization

Date: 2026-08-06

## Status

Accepted; migration is incremental.

## Context

Several Edutu route components and backend services exceed 2,000 lines and change for unrelated reasons. The largest files combine transport, persistence, business rules, state management, and presentation. Rewriting them would create unacceptable regression risk across opportunity discovery, applications, AI, scraping, and billing.

## Decision

Edutu will migrate by feature slices behind existing public interfaces.

- Route and page files compose feature screens; they do not own data access or business rules.
- UI components receive data and callbacks. Hooks own asynchronous UI state. Services own API calls.
- NestJS controllers validate and authorize requests. Domain services own business rules. Repositories own persistence.
- A feature exports a deliberate public API through `index.ts`. Other features must not import its internal files.
- Existing routes, controller contracts, database tables, and externally consumed exports remain compatible during extraction.
- Refactoring uses the strangler sequence: contracts, pure functions, adapters/repositories, state orchestration, presentation, then removal of the compatibility facade.

## Consequences

Positive:

- Smaller reviewable changes and more focused tests.
- Clearer ownership and reduced accidental coupling.
- Provider and persistence changes become isolated.

Costs:

- Temporary compatibility facades and re-exports.
- Some duplication is accepted briefly while behavior is characterized.
- File count increases, so naming and public APIs must remain disciplined.

## Guardrails

- No behavior change and structural extraction in the same commit unless inseparable.
- No new generic `utils.ts`, `helpers.ts`, or shared dumping ground.
- Avoid circular imports; lower layers never import route/screens/controllers.
- Every extraction must pass the affected build and focused tests before the old code is removed.

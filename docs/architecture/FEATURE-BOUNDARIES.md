# Edutu feature boundaries

## Client dependency direction

```text
route -> screen -> feature hooks -> feature API -> backend
                    |                 |
                    v                 v
                 model             contracts
                    |
                    v
               components
```

Client rules:

- Routes contain routing parameters and screen composition only.
- Screens coordinate feature hooks and layout.
- Components do not call `fetch`, Supabase, Clerk mutations, RevenueCat, or storage directly.
- Hooks may coordinate state but delegate network, persistence, and provider operations to services.
- Direct Supabase access requires an explicit RLS-backed exception; the NestJS API is the default boundary.

## Backend dependency direction

```text
controller -> application/domain service -> repository/provider adapter
                         |
                         v
                    domain contracts
```

Backend rules:

- Controllers perform validation, authentication context extraction, and response mapping.
- Services express one business capability and do not parse HTTP requests.
- Repositories contain database queries and transaction boundaries.
- Provider adapters isolate Paystack, RevenueCat, Gemini, OpenRouter, scraper relays, and storage APIs.
- Cross-feature calls use exported services/contracts, never another feature's repository.

## Migration quality gates

- Preserve routes, endpoint response shapes, database semantics, and exported names.
- Add characterization tests before moving fragile behavior.
- Prefer files below 500 lines for screens and 800 lines for backend services; these are review triggers, not arbitrary failures.
- Reject new circular dependencies and client-side privileged operations.
- Refactor one capability per pull request.

Run `npm run check:architecture` from the repository root. The check freezes
the current line-count ceiling of the eight highest-risk files: refactors must
make those ceilings smaller over time, and ordinary feature work cannot make
the monoliths larger.

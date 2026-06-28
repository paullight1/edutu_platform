# 00. Codebase Inventory

## Top-Level Layout

| Path | Classification | Notes |
| --- | --- | --- |
| `AGENTS.md` | Repo instructions | Defines project conventions and the important backend path quirk. |
| `README.md`, `DESIGN.md`, `CREATOR-PROFILES-SETUP.md`, `EDUTU_PRODUCT_UX_RECOMMENDATIONS.md` | Root docs | Product/design setup notes. |
| `docs/` | Generated and platform docs | Contains this documentation pack and previous HTML architecture snapshot. |
| `edutu-platform/` | Main platform workspace | Contains admin, backend, web app, waitlist, scraper, Supabase, archived files. |
| `edutumobile/` | Active Expo mobile app | Separate top-level React Native/Expo app with local shared package. |
| `edutu-launch-video/` | Remotion video package | Launch/marketing video source and rendered outputs. |
| `package.json` | Root dependency stub | Currently only declares Supabase CLI dependency. |

## Main Platform Workspace

| Path | Purpose |
| --- | --- |
| `edutu-platform/admin` | Standalone React/Vite admin dashboard. |
| `edutu-platform/admin/backend` | Older/secondary Express scraper API used by admin scraper workflows. |
| `edutu-platform/backend` | Older/secondary Express scraper API plus nested active NestJS API. |
| `edutu-platform/backend/services/services/api` | Active NestJS API server. |
| `edutu-platform/crawl4ai-scraper` | Python Crawl4AI scholarship scraper. |
| `edutu-platform/edutu-web-app` | Main React/Vite web app, PWA, and Capacitor Android project. |
| `edutu-platform/edutu-web` | Next.js waitlist landing page. |
| `edutu-platform/supabase` | Shared Supabase migrations/functions, especially mobile control plane. |
| `edutu-platform/other-files` | Archived/experimental scraper and planning docs. |

## Package Inventory

| Package | Path | Scripts/Commands | Runtime Type |
| --- | --- | --- | --- |
| root | `package.json` | none beyond dependency install | Supabase CLI helper |
| admin | `edutu-platform/admin/package.json` | `dev`, `build`, `lint`, `preview` | Vite SPA |
| admin scraper backend | `edutu-platform/admin/backend/package.json` | `start`, `dev` | Express scraper API |
| simple scraper backend | `edutu-platform/backend/package.json` | `start`, `dev` | Express scraper API |
| NestJS API | `edutu-platform/backend/services/services/api/package.json` | `dev`, `start:dev`, `build`, `test`, `test:e2e`, `db:*` | NestJS API |
| web app | `edutu-platform/edutu-web-app/package.json` | `dev`, `build`, `test`, `typecheck`, `android:*` | Vite SPA/PWA/Capacitor |
| waitlist | `edutu-platform/edutu-web/package.json` | `dev`, `build`, `start`, `lint` | Next.js app |
| mobile | `edutumobile/package.json` | `dev`, `android`, `ios`, `web`, `test`, `typecheck`, `migrate` | Expo app |
| mobile core | `edutumobile/packages/core/package.json` | package-level dependency | Shared mobile services/hooks/types |
| launch video | `edutu-launch-video/package.json` | Remotion scripts | Video render project |
| archived scraper actor | `edutu-platform/other-files/edutu-scraper1/package.json` | actor/test scripts | Apify-style scraper |

## Generated and Heavy Folders

Do not treat these as hand-authored architecture sources:

- `node_modules`
- `dist`
- `build`
- `.next`
- `edutu-launch-video/out`
- mobile/native generated outputs unless working on native release details

## Existing Documentation Worth Preserving

| Path | Subject |
| --- | --- |
| `edutu-platform/backend/services/services/api/docs/edutu-api.md` | Third-party Edutu API contract. |
| `edutu-platform/backend/services/services/api/docs/backend/product-api-contract.md` | Backend-owned product API contract and migration plan. |
| `edutu-platform/edutu-web-app/docs/*` | Web app design, admin, integration, roadmap, launch hardening docs. |
| `edutumobile/*.md` | Mobile deployment, AI, personalization, RevenueCat, and feature notes. |
| `edutu-platform/other-files/SCRAPER/docs/*` | Historical scraper deployment/checklist docs. |

## Inventory Conclusion

The codebase is larger than a single app. It is a multi-workspace product with active code, transitional code, and archived experiments. Documentation should clearly distinguish:

1. Active production path.
2. Transitional or compatibility path.
3. Archived/reference path.
4. Generated output.


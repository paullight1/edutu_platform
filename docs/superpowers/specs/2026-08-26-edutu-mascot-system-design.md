# Edutu Mascot System Design

**Date:** 2026-08-26

## Goal

Turn the approved Edutu mascot into a consistent cross-platform product guide that appears throughout Edutu's public website, authenticated products, mobile app, admin tooling, payments, and developer surfaces without overwhelming core content or degrading performance.

The system must improve first-run comprehension, empty states, guidance, reminders, errors, and celebrations. It must not reduce the readability of opportunities, applications, deadlines, financial information, or user-created content.

## Scope

The complete rollout covers:

- `edutu-web-app`: public website and authenticated web product.
- `edutumobile`: Expo/React Native mobile product.
- `admin`: operational dashboard and scraper workflows.
- `pay-edutu-org`: payment and checkout surfaces.
- Developer and supporting user-facing sites in this repository.

The rollout is decomposed into independently shippable projects:

1. Mascot foundation and canonical asset family.
2. Authenticated web product and public website.
3. Mobile product.
4. Admin, payment, developer, and supporting surfaces.

The first implementation plan covers projects 1 and 2. Projects 3 and 4 receive separate implementation plans under this design.

## Design Direction

Use a hierarchical mascot system rather than placing the same full-color character at equal weight everywhere.

- Large, expressive mascot scenes anchor page welcomes, heroes, onboarding, empty states, errors, locked states, upgrades, and celebrations.
- Medium card cameos support selected feature cards and section headers.
- Low-opacity watermarks provide presence in dense or data-heavy cards.
- Compact portraits appear in coaching notifications and reminders.
- No viewport should contain multiple competing full-body mascot scenes.
- Mascots must not cover titles, controls, amounts, dates, deadlines, or user content.

This direction provides the broad brand presence requested while preserving content hierarchy.

## Mascot Family

The first family contains fourteen semantic poses:

1. Welcome or waving.
2. Exploring with binoculars.
3. Opportunity discovery.
4. Community invitation.
5. Studying and profile completion.
6. Goal planning.
7. Application writing.
8. Deadline reminder.
9. Saved or bookmarked.
10. Celebration and success.
11. Empty or not started.
12. Thinking and loading.
13. Support and error recovery.
14. Pro and upgrade.

Every pose retains the approved mascot's face, proportions, tactile 3D/vector-hybrid finish, graduation cap, rising-arrow motif, and deep-blue, teal, and gold palette.

Each pose ships in three compositions:

- `scene`: 320–640px transparent artwork for heroes, welcomes, empty states, and dialogs.
- `cameo`: 80–160px crop for cards and section headers.
- `portrait`: 40–64px head-and-shoulders crop for notifications and compact guidance.

Web exports use optimized transparent WebP where supported with PNG fallback where necessary. Mobile uses the format that provides predictable Expo asset loading and alpha rendering. Canonical source files are retained separately from optimized application exports.

## Shared Architecture

Create `packages/edutu-mascot` as the semantic contract shared across products. It defines:

- Pose keys and supported compositions.
- Asset manifest and fallback relationships.
- Approved size tiers and placement roles.
- Voice and copy rules.
- Page-welcome registry types.
- Welcome-version and completion-state types.

Each frontend owns a thin native adapter:

- React/Vite `EdutuMascot` and welcome components for `edutu-web-app` and `admin`.
- React Native `EdutuMascot` and welcome components for `edutumobile`.
- Lightweight React/web adapters for payment and developer surfaces.

Assets live inside each application's supported asset pipeline. A validation script compares application exports with the canonical manifest so missing, misnamed, or oversized assets fail verification before release.

The mascot component accepts semantic inputs such as `pose`, `composition`, `size`, `tone`, `motion`, and `decorative`. Consumers do not reference arbitrary filenames directly.

## Mascot Voice

The character is initially described publicly as the Edutu guide rather than receiving a character name.

The voice is warm, concise, specific, and action-oriented. It may use inclusive language such as “Let's” but does not pretend to be a human adviser.

Approved examples:

- “Let's find opportunities that fit your goals.”
- “Two deadlines need your attention this week.”
- “Your first roadmap is ready.”
- “Nothing saved yet—bookmark anything worth another look.”

The guide speaks only during onboarding, first-run welcomes, empty states, actionable reminders, recovery, upgrades, and celebrations. Ordinary data cards may carry a visual cameo or watermark without additional mascot copy.

The voice must not be childish, blame the user, use excessive exclamation marks, or repeat information already visible in the interface.

## First-Visit Page Welcomes

Major authenticated destinations receive a once-per-account introduction. Initial routes include Home, Opportunities, Community, Marketplace, Goals, Roadmaps, Applications, Deadlines, Saved, Wallet, Profile, Personalization, Notifications, Settings, and Help.

Each welcome registry entry contains:

- Stable page key.
- Introduction version.
- Mascot pose and composition.
- Heading and one short explanatory paragraph.
- Primary action: “Show me around.”
- Secondary action: “I'll explore.”
- Zero to three concise tour steps.
- Replay label and page-header placement.

Behavior:

1. The introduction opens only after authentication and page readiness are known.
2. “Show me around” starts a maximum three-step tour.
3. “I'll explore,” the close control, Escape, or completed tour records the current page version as seen.
4. A small mascot/help control in the page header replays the introduction.
5. A new introduction version may display again after a material page redesign.
6. Simultaneous dialogs are prevented; security, payment, or destructive-action dialogs take priority over mascot welcomes.

Signed-in progress is stored through the backend profile/preferences API as a version map shaped like `preferences.ui.mascotWelcomes[pageKey] = version`, so it follows the account across devices. Clients continue through the NestJS backend rather than writing directly to Supabase. If the API write fails, clients record the version locally and retry later. Signed-out public experiences use browser-local persistence only where they contain a dismissible prompt.

Public marketing pages use inline welcome moments rather than repeated blocking dialogs.

## Placement Map

### Authenticated product

- **Dashboard:** new-user welcome, profile completion, feed-empty state, Best Shots, deadlines, goal progress, saved items, and install guidance.
- **Opportunities:** first-visit matching explanation, no-results state, search and filter tips, match explanation, and saved confirmation.
- **Community:** first-visit guide, empty-community state, calls, groups, guidelines, and invitations.
- **Goals and Roadmaps:** first-goal guidance, generation states, milestones, stalled progress, and completion celebration.
- **Applications:** first-visit tracker guide, empty state, review reminders, stage changes, and submission success.
- **Deadlines:** first-visit calendar guide, empty calendar, upcoming warnings, notification permission, and completion states.
- **Saved:** empty shortlist, bookmark confirmation, and shortlist summaries.
- **Marketplace:** first-visit guide, empty purchases, category guidance, creator prompts, and enrollment success.
- **Wallet and billing:** first-visit explanation, credit balance guidance, empty transactions, purchase success or failure, and upgrades.
- **Profile and personalization:** completion coach, field hints, match-quality progress, and completion celebration.
- **Notifications:** empty inbox, permission onboarding, and compact guide portraits for coaching notifications.
- **Settings and Help:** contextual help, recovery states, and replay-tour controls.

### Public website

- Landing hero, “how Edutu works,” selected feature sections, and final CTA.
- Page heroes or anchor sections on About, Impact, Edutu for You, Events, Mentor, Careers, Community, Help, Download, Upgrade, Marketplace, and developer pages.
- Section cameos or watermarks on feature cards that currently lack visual identity.
- Report, download, signup, and support prompts.
- Blog and long-form content retain editorial priority; mascots do not repeat on every article card or paragraph.

### Mobile

Mobile mirrors the same semantic moments as authenticated web with native crops, touch targets, safe-area behavior, and reduced animation. Welcome progress uses the same backend page keys and versions so web and mobile can share completion where the destination semantics match.

### Admin, payments, and developer surfaces

- Admin uses restrained scenes for empty tables, scraper setup, imports, success, and failure. Dense analytics use watermarks or no mascot.
- Payments use the guide for checkout orientation, success, failure, cancellation, and support; financial details remain visually dominant.
- Developer surfaces use a technical-guide pose for getting started, empty projects, successful integration, and API recovery.

## Accessibility

- Decorative mascots use empty alternative text and remain hidden from assistive technology.
- Meaningful guidance is always present as text; artwork never carries unique instructions.
- Welcome dialogs trap and restore focus, close with Escape, label controls, and preserve logical reading order.
- Tours are fully keyboard operable and never require pointer interaction.
- Animation respects `prefers-reduced-motion`; reduced mode uses a static rest pose.
- Color is not the only way expressions or states are distinguished.
- Mobile artwork does not reduce touch targets or overlap dynamic type.

## Performance

- The initial route loads only the pose required above the fold.
- Other poses lazy-load on demand and are grouped by route rather than included in a single eager bundle.
- Responsive image dimensions prevent layout shift.
- Card cameos and portraits use smaller physical exports rather than scaling full scenes in CSS.
- Asset validation enforces per-file budgets: 35 KiB for portraits, 90 KiB for cameos, and 350 KiB for scenes. A measured above-the-fold hero may use up to 450 KiB only when the page records the exception and still meets its LCP target.
- Public-page mascot imagery must not displace the true LCP content unless it is deliberately the hero visual; hero exports receive explicit preload only after measurement.

## Failure and Fallback Behavior

- A missing pose falls back to the neutral welcome pose in the requested composition.
- If the neutral pose is unavailable, the component renders no image while preserving all copy and actions.
- Failed welcome-progress writes fall back to local persistence and enter the existing retry/signal mechanism.
- A failed tour anchor skips that step and advances; if no anchors resolve, the introduction remains useful as a standalone welcome.
- Mascot failures never block navigation, authentication, payment, or data access.

## Analytics

Capture privacy-safe product events:

- Welcome shown.
- Welcome dismissed.
- Tour started.
- Tour step viewed.
- Tour completed.
- Welcome replayed.
- Mascot asset fallback used.

Events contain stable page and version identifiers, not page copy, profile fields, payment details, or user-generated content.

## Verification Contract

- Manifest tests prove every semantic pose has required `scene`, `cameo`, and `portrait` exports.
- File validation catches missing assets, invalid alpha, unexpected dimensions, and assets over budget.
- Component tests cover pose resolution, fallback, decorative semantics, and reduced motion.
- Welcome tests cover first display, dismissal, completion, replay, version upgrades, backend persistence, local fallback, and dialog prioritization.
- Route coverage tests ensure every major authenticated destination has a registry decision.
- Browser verification covers desktop, tablet, and mobile breakpoints, keyboard navigation, dark mode, and no-overlap constraints.
- Mobile tests cover native asset resolution, safe areas, dynamic type, and touch behavior.
- Existing lint, typecheck, unit, integration, and production builds remain required for each touched application.

## Non-Goals

- Giving the mascot a public name in this rollout.
- Replacing real people, opportunity imagery, organization logos, or editorial photography with mascot art.
- Adding blocking welcome dialogs to every public marketing page.
- Allowing pages to invent unregistered poses, arbitrary mascot copy, or direct asset filenames.
- Shipping all products in one unreviewable change.

## Completion Criteria

- The fourteen-pose family is visually consistent and exported in all three compositions.
- The shared manifest and platform adapters resolve every approved semantic pose with tested fallbacks.
- Major authenticated pages provide once-per-account welcomes and replay controls.
- Existing empty and shared state surfaces use appropriate mascot poses.
- Public website sections lacking visual identity receive hierarchical mascot placements without overwhelming content.
- Mobile, admin, payment, and developer rollouts are completed through their approved follow-on plans.
- Accessibility, performance budgets, analytics contracts, and application verification suites pass.

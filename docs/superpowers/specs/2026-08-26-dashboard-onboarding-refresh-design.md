# Dashboard and First-Run Onboarding Refresh

Date: 2026-08-26
Status: Approved in chat; awaiting written-spec review
Target: `edutu-web-app`

## Objective

Improve the signed-in dashboard's first impression by simplifying the promotional banner, removing nested visual borders from "Your Best Shots," making opportunity cards more compact, and turning the existing mascot profile prompt into a short, skippable onboarding quiz for first-time or incomplete-profile users.

The change must reuse the current profile and personalization APIs. It must not add direct browser-to-Supabase writes or introduce a new backend profile contract.

## Experience Principles

- Make the next action obvious without layering multiple buttons and borders.
- Ask only for information that directly improves opportunity matching.
- Keep onboarding optional: a member can dismiss it and use the dashboard immediately.
- Preserve entered answers while moving between quiz steps.
- Work well on small mobile viewports, desktop browsers, and the Capacitor wrapper.
- Respect reduced-motion preferences and keyboard/screen-reader navigation.

## Dashboard Banner

### Visual treatment

The first launch banner artwork will be replaced with a cleaner version of the existing creative. The replacement keeps the navy/gold Edutu atmosphere and phone/learner subject, but removes the floating square and pill-shaped feature icons around the phone. Text remains live HTML rather than being baked into the image.

The banner remains one clickable promotional surface. The bottom CTA pill is removed from every slide. A single circular right-chevron control appears at the vertical center of the right edge and advances to the next slide without following the active promotion link. Selecting the main banner surface still opens the active promotion destination.

Small pagination dots remain as the carousel position indicator and move to the bottom center. They are visually quiet, individually selectable, and expose the active slide through `aria-selected`. Autoplay pauses while the banner or its controls are hovered or focused. Reduced-motion users receive instant transitions and no autoplay.

### Responsive behavior

- Mobile keeps the current approximately 150-pixel banner height.
- Desktop keeps the 1200:300 aspect ratio.
- Copy width stays clear of the illustration and right-chevron control.
- The right-chevron has at least a 40-by-40-pixel hit area.

## Your Best Shots

The section becomes a single rounded surface. The current outer card remains the visual container; the inner dashed empty-state box and its second border are removed. Empty-state copy sits directly below the section heading with spacing and a subtle tonal background only if needed for separation.

When onboarding is already open, the empty state does not repeat a large "Complete your profile" button. When onboarding is closed or has been dismissed, the section may show a compact text action such as "Refine profile" with a right arrow. This action reopens the onboarding quiz rather than navigating away from the dashboard.

When strong matches exist, the section keeps a maximum of three opportunity cards and uses the same compact card primitive as the main feed.

## Compact Opportunity Cards

Opportunity cards retain the information needed to judge relevance: image, category, title, strongest match cue when available, location, and deadline. Decorative height and padding are reduced.

Desktop grid cards target roughly 210-220 pixels in minimum height with an image around 104 pixels tall. Mobile carousel cards target roughly 164-172 pixels tall. Mobile two-column cards remain readable at narrow widths and must not overflow their grid tracks. Titles remain limited to two lines in desktop/carousel variants and up to three lines in the narrow mobile grid variant.

The complete card remains the primary click target. Existing keyboard focus behavior, urgency treatment, image fallbacks, and match-score thresholds remain intact.

## First-Run Onboarding Quiz

### Entry conditions

The existing profile completeness score remains the source for deciding whether onboarding is needed. The modal opens when all of the following are true:

- The member is signed in.
- Profile completeness has loaded.
- The completeness score is below the existing matching threshold of 60.
- The member has not dismissed the prompt in the current authenticated session.

Dismissal is stored only for the current browser session and user/session identifier. The prompt can return in a later session until the profile reaches the threshold. Completion prevents future automatic opening because the refreshed completeness/personalization state no longer qualifies.

### Modal structure

The existing `ProfileCompletionPrompt` becomes the container for the full quiz rather than sending the member to a separate full-screen route. The dashboard stays visible behind a dimmed backdrop.

The welcome state leads with the existing `edutu-profile-guide.png` mascot, the member's first name when available, a short explanation of the benefit, an "About 2 minutes" cue, and two actions: "Personalize my feed" and "Maybe later."

The quiz contains four short steps:

1. **About you:** full name, age (optional), and country/location.
2. **Education:** education level, school/institution (optional), and field of study.
3. **Interests:** opportunity/topic interests and preferred destination countries (optional).
4. **Goals:** career goals and experience level.

Progress is represented by four small dots plus "Step X of 4" text. Completed dots are selectable so members can revisit earlier steps. The footer contains Back and Continue; the final action reads "Finish and show my matches."

The modal is responsive: on desktop the mascot/welcome presentation and form content may use two columns; on mobile it becomes a compact single-column sheet with a scrollable body and sticky navigation. It must fit within the visible viewport and safe areas without placing controls off-screen.

### Validation and error handling

- Members can advance through early steps without filling optional fields.
- The final step requires at least one interest or goal, matching the current personalization rule.
- Age accepts values from 10 through 100 when provided.
- Save is disabled while a request is in flight.
- A failed save leaves the quiz open with all answers preserved and shows the existing error toast.
- Closing or choosing "Maybe later" does not persist partial answers to the backend.
- Backdrop click and Escape use the same session-dismiss behavior as "Maybe later"; they do not lose already persisted profile data.

### Data flow

The current `PersonalizationScreen` form state and option catalogs will be extracted into reusable onboarding modules rather than duplicated. The modal and the existing `/app/personalization` route will share:

- Step definitions and choice catalogs.
- Field state and validation.
- The save orchestration that calls `savePreferences`, `updateBackendProfile`, `syncOpportunityPreferences`, and `saveOnboardingProfile`.

All durable writes continue through the NestJS backend or current Clerk metadata mirror. The flow must not write directly to Supabase. After a successful save, the personalization context is refreshed so dashboard match cards and the completeness prompt update without requiring a page reload.

The standalone personalization route remains available for members who intentionally open profile personalization from elsewhere. It uses the same quiz component in a full-page shell, preventing the modal and route from drifting apart.

## Component Boundaries

- `Dashboard.tsx`: owns banner state, dashboard prompt visibility, and refresh behavior after onboarding completion.
- `BannerCarousel`: renders live banner copy, center-bottom dots, and the next-slide chevron. It no longer renders slide CTA pills.
- `ProfileCompletionPrompt.tsx`: owns modal presentation and welcome-to-quiz transition; receives user/profile defaults and completion/dismiss callbacks.
- Shared onboarding form module: owns steps, options, form state, validation, and save orchestration for both modal and standalone route.
- `DashboardOpportunityCard.tsx`: owns compact dimensions for all card variants.
- The cleaned launch image remains under `public/advertising/` and keeps the existing filename or receives a versioned filename with the default banner configuration updated accordingly.

## Accessibility

- The modal has a descriptive accessible name and traps focus using the existing dialog primitive.
- Every input has a visible label and validation message association.
- Progress dots expose step names and current/completed states.
- Banner dots use tab semantics; the next arrow has an explicit "Next promotion" label.
- Clicking the carousel arrow does not activate the underlying banner link.
- All interactive controls meet a minimum 40-pixel touch target, with 44 pixels preferred on mobile.
- Animations follow `prefers-reduced-motion`.

## Testing and Verification

Automated coverage will include:

- Prompt visibility for signed-out, loading, sufficiently complete, incomplete, and session-dismissed states.
- Welcome screen dismissal and quiz entry.
- Step navigation, answer preservation, optional fields, age validation, and the interest-or-goal completion rule.
- Successful save calls the existing persistence functions and closes/refetches the dashboard state.
- Failed save preserves answers and reports an error.
- Banner CTA pills are absent; dots and next-slide control work without following the banner link.
- Opportunity card variants render within their intended compact size classes without dropping essential metadata.

Verification will run the focused Vitest suites, full TypeScript typecheck, production build, and browser checks at representative mobile and desktop viewport sizes. Browser checks will verify modal scrolling/focus, banner interaction, no duplicate Best Shots border, opportunity-card density, dark mode, and reduced-motion behavior.

## Out of Scope

- New backend profile fields or database migrations.
- Changing the 60-percent prompt threshold.
- Making onboarding mandatory.
- Adding rewards, streaks, or gamification beyond the short quiz progress indicator.
- Redesigning the full profile page or opportunity detail page.
- Changing recommendation scoring rules.


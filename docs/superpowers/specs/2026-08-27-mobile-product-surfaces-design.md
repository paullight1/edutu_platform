# Mobile product surfaces design

## Scope

Refactor the existing `edutu-web-app` Opportunities, Communities, and Settings surfaces for a compact, native-feeling mobile experience without changing their data sources, routes, authentication, or desktop layouts. The work replaces fragile presentation overrides with component-owned responsive markup and styles.

## Shared mobile system

- Use a 16px page gutter from 320–390px and 20px from 412px upward.
- Preserve the workspace header at 64px plus the top safe-area inset and the workspace bottom navigation at 64px plus the bottom safe-area inset.
- Every interactive row, icon button, filter, switch, and sheet action must have at least a 44×44px target.
- Use only the 4, 8, 12, 16, 24, and 32px vertical rhythm.
- Mobile page titles are 28–32px, section titles 20–22px, body copy 14–16px, and metadata at least 12px.
- Keep at most one fixed overlay active. Sheets use a sticky heading, independently scrollable body, and fixed action region.
- Preserve the existing brand tokens, dark mode, keyboard focus states, and desktop layouts.

## Opportunities

### Authenticated archive

Delete the `OpportunitiesPage.tsx` portal and injected selector string. `OpportunitiesPage.tsx` becomes a thin export of the actual page, while `OpportunitiesPageLegacy.tsx` owns the mobile structure.

On mobile the page begins with a compact “Opportunities” title, followed by a sticky search surface and a five-item text filter control: All, Scholarships, Internships, Fellowships, More. “More” opens a bottom sheet containing Programs plus sort and closed-result controls. Search remains visible beneath the 64px workspace header while the user scrolls.

Results render as full-width list rows under 640px. Each row shows category/type, title, provider, deadline, and a 44px bookmark action. Images, descriptions, share, “not interested,” match explanations, location, and funding remain available in the existing tablet/desktop card presentation but are omitted from the mobile browse row. The first result must begin in the initial viewport under typical 667–844px phone heights.

### Public archive

Retain the SEO content, category routes, pagination, and desktop grid. On mobile remove the promotional hero and breadcrumb from the initial flow, use the same compact title/search/filter rhythm, and render compact rows without descriptions or images. The category rail shows All, Scholarships, Internships, Fellowships, More without clipping; More opens the remaining public categories in a sheet.

## Communities

### Public landing

Use the headline “Find people working toward the same opportunity.” Keep one filled CTA and turn “Browse communities” into a text link. On mobile, remove the decorative conversation mockup and long proof list from the hero and bring two live community previews directly beneath the CTA within the first viewport. The complete community grid remains farther down for larger result sets and desktop.

### Authenticated product

The existing `AppWorkspaceShell` remains the global header/navigation owner. `CommunityProductShell` restores a visible mobile page title directly below it and retains its community-specific bottom tabs. The action shares the title row rather than occupying a separate blank row.

Community focus filters become a compact, underline-style text segmented control instead of pills. `GroupCard` becomes a flat divided list row under 640px and retains its existing card treatment on larger breakpoints. Group sections collapse repeated eyebrow/title/body/count blocks into headings such as “Invitations 2”, “Awaiting approval 1”, and “Joined 6”.

Replace every native confirmation used by authenticated community routes with a reusable action sheet. The sheet displays the action, one short consequence, a cancel action, and a destructive confirmation. Existing async actions and error handling remain unchanged.

## Settings

Compose settings into five grouped lists with labels outside border-only, shadowless containers:

1. Preferences: Personalization, Appearance, Language.
2. Notifications: New matches, Deadline reminders.
3. Privacy: Profile visibility and community/member privacy controls.
4. Account: Security, sessions, notifications inbox, export data.
5. Danger zone: Account deletion.

Notification subscription and deadline reminder logic stay separate internally but appear together in one Notifications group. Entire switch rows are buttons with at least a 44px target; switches may remain visually compact inside those rows. Descriptions should fit one mobile line where practical.

Password and deletion forms use visible `<label>` elements, not placeholder-only fields. The reusable settings sheet shell uses a sticky title, scrollable body, and fixed action/footer area. Security, visibility, and deletion functionality remains unchanged.

## Testing

- Add component/source contract tests for removal of the Opportunities portal and `!important` layer, compact mobile controls, mobile list markup, and public archive behavior.
- Extend community tests for the public headline/previews, visible mobile title, flat row/segmented control classes, compact section headings, and action-sheet behavior.
- Extend settings tests for grouped labels, full-row switches, visible password labels, and sheet structure.
- Run focused Vitest files, full typecheck, production build, and browser checks at 320, 390, and 412px widths.

## Non-goals

- No API, database, routing, authentication, localization architecture, or desktop information-architecture changes.
- No new UI dependency or icon library.
- No new decorative animation, gradient, or card system.

# Edutu mobile: iOS liquid glass design review

Date: 9 September 2026. Review and proposal only; no application code changed.

## Recommendation

Adopt stable native tabs on iOS, keep content surfaces quiet and readable, and reserve liquid glass for navigation and floating controls. The app already has real native glass; adding more blur is not the main improvement.

Design read: Edutu serves young people finding opportunities and progressing applications; preserve its warm, approachable themes and duotone illustrations while reducing competing controls and making the next action obvious.

## Evidence and limits

Inspected the current working-tree navigation diff, shell, Home, Explore, My Plan, profile, theme system, glass/card primitives, state renderer, and navigation tests. Visually inspected Home, My Plan, Explore and More in the running iPhone 17 / iOS 26.5 simulator, including navigation between them. The running build was not rebuilt, so parity with every uncommitted source change is not established.

Used [Appllama App Design](https://github.com/Appllama/appllama-skills/blob/main/skills/appllama-app-design-skill/SKILL.md), its usage playbook, and the local Edutu mobile design and review skills. Appllama tools are absent from this session; `codex mcp get appllama` also reports no such server. No Appllama competitor screens were retrieved, and this report must not be represented as an Appllama MCP benchmark study. The official [connection page](https://appllama.io/mcp) lists `https://mcp.appllama.io/mcp` and account requirements.

This is a focused mobile UI review, not a completed audit of every route, backend, purchase flow, or accessibility configuration. No frame-rate measurements or full-motion recordings were made. The floating grey gear visible in the simulator was excluded from product findings because its origin was not established.

## Prioritized findings

### P2 — Primary navigation disappears or changes meaning

Evidence: `edutumobile/app/(app)/_layout.tsx:1019` collapses the pill according to contextual action. At line 1732, My Plan substitutes Applications / Deadlines / Goals for the global tab set. At line 1746, tab taps call `router.push`. In the simulator, Explore and More display Back and lose the global tabs; My Plan replaces them with its local destinations.

Impact: users must backtrack to move between peer sections. A familiar location on the screen changes its meaning. Repeated peer navigation is implemented as deeper navigation rather than independent tab stacks.

Fix: preserve Home / My Plan / Explore / More on every root screen, with an independent stack per tab. Put My Plan's Applications / Deadlines / Goals inside its content hierarchy. Avoid introducing two equally prominent rows of tabs alongside the existing Pursuing / Shortlist / Applied / Closed filters; make stage filtering subordinate to the selected plan view.

Verification gap: test repeated tab changes, retained scroll/filter state, active-tab retap, back gestures, deep links and guest authentication walls. Native tabs require route restructuring, not just replacing the visual component.

### P2 — Glass disappears through a known opacity-sensitive path

Evidence: `_layout.tsx:1059` drives a glass ancestor's opacity to zero while shrinking width to zero; the native material is mounted below that wrapper at line 1216. This is an implementation risk, not a reproduced rendering failure.

Fix: remove route-driven pill collapse. If custom effect fading remains, use the supported glass style transition mechanism and verify it against installed Expo 56 types. Keep opacity animation confined to labels where possible. Explicitly round the native GlassView itself, instead of relying entirely on ancestor clipping and a separate border overlay.

Verification gap: repeatedly leave and return to the glass surface on iOS 26, including interrupted animations and background/foreground transitions. Expo documents the zero-opacity issue in its [SDK 56 GlassEffect reference](https://docs.expo.dev/versions/v56.0.0/sdk/glass-effect/).

### P2 — Label layout and theme behavior are brittle

Evidence: `_layout.tsx:75` captures window width at module load; line 178 allocates only 14 points of height to the expanded label; line 951 forces every dark-theme selected tab to lavender. `Card.tsx:9` selects hardcoded slate/white colors rather than the active theme tokens.

Impact: resized windows cannot update bar geometry; enlarged text can clip; Forest, Sunset and other dark themes lose their accent identity.

Fix: use native label sizing, or measured dimensions and font-scale-aware label allocation in the custom fallback. Resolve active/inactive colors from the chosen theme and validate contrast against actual material backgrounds. Make Card consume `colors.card` and `colors.border`.

Verification gap: 320/360/430-point widths, accessibility text sizes, Arabic RTL, long translated labels, light/dark, and at least Sunset and Forest. Do not assume native glass automatically makes app-rendered text accessible.

### P2 — My Plan's failure state leaves the core task stranded

Evidence: simulator displayed “Unable to load your plan. Please try again.” and a small retry action above a largely empty screen. `my-plan/index.tsx:84` renders a text notice; line 95 uses a raw spinner for loading and a lone Compass icon for empty state, bypassing the established StateView pattern.

Fix: use the existing illustrated StateView for initial failure/empty states, a clear Retry button and a route back to opportunities. Keep cached journeys visible with an inline refresh error when available. Use card-shaped loading placeholders. Diagnose the underlying request separately; the screenshot does not establish its cause.

Verification gap: initial failure, timeout, offline, retry success, cached-data refresh failure, and all four stage filters.

## Bottom navigation proposal

Preferred direction: Expo Router NativeTabs on iOS with the existing four destinations initially retained in their current order. Native system material and selection feedback should establish the iOS character. Start without scroll minimization; add native minimization only if it improves the experience in device testing.

Use SF Symbols within the iOS native navigation chrome. Preserve the existing icon family in content for this phase. Avoid a whole-app icon migration as a prerequisite.

Make Edutu AI a stable, clearly named action. Move goal creation and profile editing into the relevant screen's toolbar instead of changing the same floating circle's purpose. Keep voice accessible through an explicit option, not solely through a long press. A bottom accessory is more appropriate for an active voice session that the user can resume than for a permanent unrelated promotion.

If the detached circle is essential to the brand, retain a custom bar as the alternative: four persistent labeled destinations, a separate stable AI button, native regular GlassView backgrounds, and no route-driven disappearance. This preserves the visual silhouette but leaves the app responsible for selection, accessibility, geometry, and animation behavior.

NativeTabs supports system minimization and bottom accessories, but the documented API remains under `unstable-native-tabs`; check installed SDK 56 declarations during implementation. See [Expo native tabs](https://docs.expo.dev/router/advanced/native-tabs/).

## Where glass belongs

| Surface | Proposed treatment |
| --- | --- |
| Bottom tabs | Native system liquid glass, restrained active tint |
| Back, overflow and contextual toolbar controls | Native controls and platform material |
| Floating AI / active voice controls | Small regular glass surface; readable icon and label |
| Search / filters | Native search and a short sheet for filters; no extra glass card surrounding the form |
| Opportunity cards, application details and forms | Opaque theme surfaces with clear typography |
| Errors, empty states and paywalls | Readability first; preserve illustrated states and unambiguous actions |

The present bottom scrim (`components/ui/BottomScrim.tsx:43`) reaches 70–85% background opacity halfway down and becomes fully opaque at the bottom. Home visibly has a broad pale wash. Reduce its reach/strength experimentally so the glass can sample real content while labels remain readable; do not simply remove it everywhere.

The fallback is already nearly solid on Android. Prefer an intentional, legible platform fallback over spending blur resources underneath a 94–96% opaque overlay. Validate Reduce Transparency and increased-contrast settings; provide a theme-solid fallback when appropriate. The shell currently checks only `isLiquidGlassAvailable`; incorporate the runtime API check recommended by Expo when constructing shared glass controls.

`components/ui/GlassView.tsx:14` is a separate, plain translucent View despite its name. Rename or consolidate it to avoid developers confusing it with native glass. `GlassContainer` can group nearby custom glass controls, but is optional; it is not necessary to add to every surface.

## Other screen improvements

**Home:** retain the greeting and deadline cue, then one clear next action and a short best-match section. The observed cards layer text over poster images that already contain text, creating competing typography. Use clean thumbnails or organization marks with titles on an opaque text area. Keep match reason and deadline easy to scan. Preserve Recommended as the final section, consistent with current source intent, while giving it less prominence than the next action.

**Explore:** search should lead directly into useful results. The current first viewport places a CV promotion and eight colorful categories before the catalogue. Move CV building into Tools or a relevant application step, compress categories into a compact filter control, and expose results sooner. Preserve selected category, query and sort when switching tabs. Open filters in a dismissible sheet.

**More:** the simulator shows several gradient tile families competing with grouped settings rows. `profile/index.tsx:53` defines independent gradient palettes. Prefer one identity header, a short shortcut row and grouped tool/preferences/support rows. Use the chosen theme accent for primary emphasis. Consolidate overlapping entry points for goals, roadmaps, applications and deadlines with the new My Plan hierarchy.

**Headers:** peer root screens should use native navigation titles without a back chevron to another tab. Detail screens retain native push/back behavior. Replace custom toolbar controls incrementally and check safe-area handling to avoid double padding.

## Delivery sequence and acceptance

1. Prototype persistent native tabs with independent stacks, preserving URLs, auth guards and existing data behavior. Assess eager screen mounting and avoid multiplying requests or resetting local state.
2. Separate global navigation from My Plan views and contextual actions. Verify root/deep-link/back semantics.
3. Consolidate material handling, remove collapse/zero-opacity paths, and correct theme/text sizing.
4. Improve My Plan recovery states and simplify Home, Explore and More hierarchy.
5. Verify on a fresh native build: light/dark, two theme packs, large text, RTL, Reduce Motion, Reduce Transparency, keyboard, safe areas, old iOS and Android fallback. Record navigation, sheet and keyboard flows; measure performance on the slowest supported device before calling the redesign finished.

Tests run: `npm test -- --runInBand __tests__/mobileBottomNavStyles.test.tsx __tests__/navStyleStore.test.ts` — 2 suites, 39 tests passed. React emitted act-wrapping warnings. These tests do not verify native material rendering or real-device accessibility.

Verdict: request changes to navigation behavior before expanding the glass treatment. Current visual styling already demonstrates native glass, but app-wide native fidelity remains unverified.

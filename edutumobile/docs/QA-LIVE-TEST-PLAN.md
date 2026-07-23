# Edutu iOS — Live End-to-End QA Test Plan

Executable checklist for driving the app in the iOS Simulator (tap/swipe/type/screenshot).
Fill the `Bug? / UI note / UX note` columns as you go; log every issue in the **Findings Log** at the bottom.

---

## Pre-flight

1. **Build type**: run a `__DEV__` (dev client / debug) build — the paywall's dev-only **"🔓 Mock Pro"** button only exists in dev builds and is the ONLY sanctioned way to get Pro during this test. **Never complete a real IAP or web (pay.edutu.org) payment.** Cancel any StoreKit/Apple payment sheet immediately if one appears.
2. **Login state**: you need a real Clerk test account (email+password). If none is provided, create one in Flow 1 with a throwaway email you can receive codes on; otherwise sign in and skip 1.4–1.8. Some flows (Guest, Flow 12) require signing out first — do Guest LAST or FIRST, not mid-run, to avoid churning auth state.
3. **Reaching home**: cold launch → animated "Edutu" splash (~1.7 s) → routes to `/onboarding-welcome` (signed out), `/onboarding` (signed in, onboarding incomplete) or `/(app)` home (signed in, onboarded).
4. **Bottom nav**: 4 tabs — **Home, Discover, Plan, Me** — plus a **center circle button** ("Open Edutu AI"). The circle **morphs contextually** per tab (AI / Create / Edit) and hides on scroll; if a tap seems to miss, scroll up first. Long-press on the circle = voice mode (risky — see Flow 9).
5. **Known iOS-sim gotcha**: the Expo dev-menu floating action button can swallow touches. If taps stop registering everywhere, that's the FAB freeze (an env/tooling issue, not an app bug) — shake/reload rather than logging it as a bug.
6. **Network**: the app talks to a live backend (Render) + Supabase + Clerk. Steps marked **[NET]** can be slow or fail on cold starts (Render spin-up ~30-60 s). Retry once before logging a bug. Steps marked **[AI-COST]** spend real AI tokens/credits — run them ONCE each, don't loop them. Steps marked **[$]** would spend money — never complete them.
7. **Do not** submit the Contact/bug-report form with junk more than once (it emails a real inbox), and **do not** tap "Delete Account" past its confirm dialog.
8. Take a screenshot at every ⭐-marked step and whenever anything looks off (clipping, overlap, wrong theme, spinner that never resolves).

---

## Flow 1 — Auth (sign-up, sign-in, reset) — guest-accessible screens

| # | Action | Expected result | Bug? | UI note | UX note |
|---|--------|-----------------|------|---------|---------|
| 1.1 | Cold-launch app | "Edutu" typewriter splash, then auto-navigates within ~2 s (no dead-end) | | | |
| 1.2 | ⭐ Land on welcome screen | Title "Find real opportunities", trust line "Free to start — no card needed", buttons: "Get Started" / "Create account" / "Sign in" / "Continue without login" | | | |
| 1.3 | Tap "Sign in" | Sign-in screen: "Welcome back", email + password fields, "Sign in" button, "Forgot password?", OAuth buttons (Google/Apple), "New to Edutu? Create account" | | | |
| 1.4 | Tap "Create account" link | Sign-up screen "Create your account" with full name ("John Doe" placeholder), email, password ("Minimum 8 characters"), "Have a referral code?" toggle | | | |
| 1.5 | Tap referral toggle | Optional "Referral code (optional)" input appears | | | |
| 1.6 | [NET] Fill valid details, tap "Create account" | Moves to email verification step; code input has `testID="signup-verification-code"` | | | |
| 1.7 | [NET] Enter the emailed code | Account created → routed into onboarding (Flow 2) | | | |
| 1.8 | (If existing account instead) enter creds, tap "Sign in" | "Signing in..." state, then home or onboarding. Wrong password → readable error incl. social-account hint | | | |
| 1.9 | From sign-in, tap "Forgot password?" | Reset screen "Reset Password" → email field → "Send Reset Code" | | | |
| 1.10 | [NET] Send code to your test email | "Email Sent" alert; "Enter code" step; then "New password" step with repeat field + "Save password". (Optional: complete only if you control the account) | | | |
| 1.11 | Background/foreground the app mid-auth | No crash; state preserved | | | |

## Flow 2 — Onboarding (signed-in, first run)

Only shown when `onboardingComplete` is unset. If your account already finished it, verify entry via a fresh account or skip to 2.7.

| # | Action | Expected result | Bug? | UI note | UX note |
|---|--------|-----------------|------|---------|---------|
| 2.1 | ⭐ Land on onboarding | "Step 1 of 4" progress; steps: Profile → Education → Interests → Welcome | | | |
| 2.2 | Profile step: enter name, tap Country field | Fullscreen "Select Country" picker with search ("Search country or dial code..."); search "Nig" → Nigeria appears; select it | | | |
| 2.3 | Set Age, pick Degree Level (BSc/MSc/PhD/Other chips), tap Next | Advances to Education step, progress updates | | | |
| 2.4 | Education: answer "Are you a graduate?" Yes/No, pick Grade Level, search school ("Search your school..." — e.g. "Lagos") | Nigerian universities list filters live (e.g. "University of Lagos") | | | |
| 2.5 | Interests step: pick several Interests + Ambitions chips | Multi-select highlights; Next enabled | | | |
| 2.6 | ⭐ Welcome step | "You're all set!" (+ name), "YOUR PROFILE" recap of entered data, "Get Started" button | | | |
| 2.7 | [NET] Tap "Get Started" | Saves to backend and lands on Home. If save fails: non-blocking error ("your answers are saved") and still proceeds | | | |
| 2.8 | ⭐ First-run welcome modal on Home | New-user modal "Welcome to Edutu…" with "Explore opportunities" / "Maybe later"; dismiss → coach-mark hints (Home/Discover/Plan/AI/Alerts/Profile) may follow; step through or "Skip welcome hints" | | | |

## Flow 3 — Home / Discovery

| # | Action | Expected result | Bug? | UI note | UX note |
|---|--------|-----------------|------|---------|---------|
| 3.1 | ⭐ Home tab | Header (avatar, bell icon, possible "Upgrade" chip); sections top-to-bottom: "Explore opportunities" category tiles, "Featured Opportunities" carousel, "Quick Actions", "Your Best Shots", "Recommended Opportunities" | | | |
| 3.2 | Status bar / header contrast | Status-bar icons readable against header in current theme (recent fix — verify) | | | |
| 3.3 | Tap a discovery tile (e.g. "Scholarships") | Opens Discover list pre-filtered to that category | | | |
| 3.4 | Back to Home; tap the category-editor (pencil/customize) icon by "Explore opportunities" | "Customize categories" editor: drag to reorder, resize handle, "−" remove, "More categories" to add, "Save" | | | |
| 3.5 | Reorder one tile, save | Home grid reflects new order; persists after leaving/returning to Home | | | |
| 3.6 | [NET] "Featured Opportunities" → "View More" | Opens `/opportunities/featured` list | | | |
| 3.7 | Quick Actions: tap each of Roadmaps / Goals / CV Builder / Saved | Each navigates to the right screen; back returns to Home | | | |
| 3.8 | ⭐ "Your Best Shots" section | With incomplete profile: dashed empty slot (`testID="best-shots-empty-slot"`) + "complete profile" CTA. With matches: cards with match %. Tap a card → opportunity detail | | | |
| 3.9 | Scroll Recommended grid; tap "View More" | Opportunity cards show image, title, match % pill, deadline/urgency pill; no "Opportunity/Unknown" placeholder cards (known past bug) | | | |
| 3.10 | Scroll down fast, then up | Bottom nav circle hides on scroll-down, returns on scroll-up; no jitter | | | |
| 3.11 | Pull-to-refresh Home | Spinner resolves; sections re-render without layout jumps | | | |

## Flow 4 — Opportunities list (Discover tab)

| # | Action | Expected result | Bug? | UI note | UX note |
|---|--------|-----------------|------|---------|---------|
| 4.1 | ⭐ Tap "Discover" tab | "Opportunities" list; "For you — Personalized recommendations" strip; category chooser ("What are you looking for?"); search bar "Search scholarships, fellowships, jobs..." | | | |
| 4.2 | [NET] Type "engineering" in search | Debounced results update; "Clear search" resets. Empty query result → "No opportunities found / Try a different search term." | | | |
| 4.3 | Toggle sort: Recommended / Deadline / Newest | Order visibly changes; active sort indicated | | | |
| 4.4 | Toggle Grid / List view | Layout switches cleanly, images not stretched | | | |
| 4.5 | Pick a category ("Browse X only") then Explore other categories | Feed narrows to category; switching back works | | | |
| 4.6 | Open overflow/settings on the list ("Save this search" / "My alerts") | With an active search: "Alert saved" confirmation + "Manage alerts" → `/saved-searches`. With nothing typed: "Nothing to save yet" notice | | | |
| 4.7 | On any card: tap bookmark icon | Toggles saved state with confirmation ("Saved" / removal) | | | |
| 4.8 | On any card: tap "More options" → "Not interested" | Dismiss sheet "Not interested?" with reasons (Not my kind / Not eligible / Already applied / Deadline too close); choosing one removes card from feed | | | |
| 4.9 | On any card: tap share icon | iOS share sheet opens with share text + link. **Cancel it** (don't post anywhere) | | | |
| 4.10 | Scroll deep (20+ cards) | Pagination/infinite scroll loads more; no duplicate keys visual glitch; scroll performance acceptable | | | |
| 4.11 | "Other features" section at top of Discover | Tiles: CV Builder, Goals, Roadmaps, Saved, Applied, Deadlines, Creator Studio, Submit & track — each navigates correctly | | | |
| 4.12 | Tap "Submit & track" → `/opportunities/submit` | "Submit an opportunity" form (Title, Organization, Category chips, deadline YYYY-MM-DD, Apply link). Enter a 2-char title + bad URL → validation errors ("Title needed", "Check the link"). **Do not actually submit** unless using obvious test data; if submitted, verify "View my submissions" → `/opportunities/submissions` shows it as "In review" | | | |

## Flow 5 — Opportunity detail + Apply

| # | Action | Expected result | Bug? | UI note | UX note |
|---|--------|-----------------|------|---------|---------|
| 5.1 | ⭐ [NET] Open any opportunity card | "Opportunity Details" screen: hero image, title, "{n}% Match" pill, days-left pill, Sponsor, Deadline, Stipend/Funding tiles | | | |
| 5.2 | Scroll content | Sections render: "AI Summary", "About This Opportunity", "Requirements", "Benefits", "Why This Matches You", "Things to Check" | | | |
| 5.3 | Tap "Ask Edutu more…" | Opens AI Chat pre-filled with "I'm looking at {title}…" (Flow 9 covers chat itself) | | | |
| 5.4 | Tap bookmark/Save | "Saved" alert; tap again → "Removed" | | | |
| 5.5 | Tap Share | Share sheet with rich share text (deadline, benefits, apply link). Cancel | | | |
| 5.6 | ⭐ "Apply with Edutu AI" CTA (co-pilot) | Navigates to `/copilot/{id}` → Flow 6 | | | |
| 5.7 | [AI-COST] "Generate ROADMAP using AI" | If not Pro: credit-cost note ("{cost} credits") or "Insufficient Credits" alert with "Get Credits". With Pro/credits: multi-phase generator ("Analyzing the opportunity" → … ) → stepper (Overview / Milestones / Weekly Goals / Checklist / Review & Create) → "Create Roadmap" → "AI Roadmap Created!" alert with "View Goals". Run at most once | | | |
| 5.8 | "Add to My Goals" (preparation steps) | Steps added; "Already Tracked" alert if repeated | | | |
| 5.9 | ⭐ Tap "Apply Now" | Opens the official apply URL in Safari/in-app browser (external `Linking.openURL`). Return to app afterwards. Closed opportunity shows "Closed" and CTA is disabled | | | |
| 5.10 | After returning from apply link | App may prompt to mark as applied / application appears in "My Applications" (Flow 10.5); no crash on resume | | | |
| 5.11 | Deep link (risky): open `edutu://opportunity/{same-id}` via Safari | App opens directly on that opportunity detail; back works | | | |

## Flow 6 — Application Co-pilot (`/copilot/[id]`) — Pro/credit-gated, AI-heavy

Prereq: Pro via **Mock Pro** (Flow 11.4) or enough credits. All generation steps are **[AI-COST]** — run once each.

| # | Action | Expected result | Bug? | UI note | UX note |
|---|--------|-----------------|------|---------|---------|
| 6.1 | ⭐ Enter from "Apply with Edutu AI" | "Application Co-pilot" screen, "Opening your co-pilot..." loader, then intro. Non-Pro: "Go Pro" / "Included with Pro · Outlines & feedback included" gate or credit prompt | | | |
| 6.2 | [AI-COST] Tap "Generate my application kit" | Phased progress: "Reading the opportunity like a reviewer" → "Matching it against your profile" → "Predicting the essay questions" → "Building your document checklist"; ends with kit sections | | | |
| 6.3 | ⭐ Review kit sections | Cards: "Your winning angle" (why you fit), "Eligibility", "Documents", "Essay co-writer", "Preparation", "Submission" | | | |
| 6.4 | Check off Eligibility items | Progress feedback ("Eligibility box ticked. You belong in this race.") | | | |
| 6.5 | Check off all Documents | Completion copy ("Documents: complete…") and overall progress advances | | | |
| 6.6 | Essay co-writer: pick a predicted prompt → [AI-COST] "Generate personalized outline" | Outline renders; "Regenerate outline" available. If the opportunity has no essays: "No essays required" state instead | | | |
| 6.7 | Type/paste a ~100-word draft in "Write or paste your draft here...", tap "Save draft" | "Saving..." → saved state persists after leaving+returning | | | |
| 6.8 | [AI-COST] "Get reviewer feedback" | "Reviewing like a committee..." → scored feedback on Clarity / Relevance / Impact / Authentic. Too-short draft → "Draft too short" guard | | | |
| 6.9 | Complete Submission steps | "Submission steps: complete. You are genuinely ready." → CTA becomes "Apply Now — you're ready" | | | |
| 6.10 | Tap "Did you submit?" → "Yes, submitted" | Marks applied (shows in Flow 10.5 applied list). "Not yet" keeps state | | | |
| 6.11 | Kill app, reopen copilot for same id | Kit reloads from server (no regeneration/duplicate spend), checked items persist | | | |

## Flow 7 — CV Builder (`/cv`)

| # | Action | Expected result | Bug? | UI note | UX note |
|---|--------|-----------------|------|---------|---------|
| 7.1 | ⭐ Open CV Builder (Quick Action or Discover tile) | "CV Builder" with "Build faster" quick actions: "Create a fresh CV" / "Import from LinkedIn" / "Tailor to an opportunity"; "Your CVs" list; "Choose a Template" gallery | | | |
| 7.2 | Template gallery: tap a template card | Sample preview (fake persona e.g. "Amara Okafor"); Pro templates show "Pro" badge + "Unlock Template"; free ones "Use Template" | | | |
| 7.3 | "Create a fresh CV" | Editor with sections: Personal Information, Professional Summary, Skills, Experience, Education, Projects, Achievements | | | |
| 7.4 | Fill name/email; add one Experience entry ("New experience"); tap "Save CV" | "CV saved successfully!" — CV appears in "Your CVs" | | | |
| 7.5 | [AI-COST] In Summary, tap "Improve with AI" | Non-Pro: "Unlock AI Assist" upsell. Pro: "Improving…" → rewritten summary ("Summary updated") | | | |
| 7.6 | "Import from LinkedIn" quick action | "Build CV with AI" modal: URL field + "Upload LinkedIn export (PDF or ZIP)". **Just verify the modal opens/closes** — skip real generation | | | |
| 7.7 | [AI-COST] "Tailor to an opportunity" | Modal listing opportunity bank with search; pick one → "Tailoring your CV…" → "CV Tailored — {score}% match" result with improvements/keywords, "Export as PDF" / "View & edit CV" | | | |
| 7.8 | "Download PDF" from editor/preview | expo-print PDF generated → iOS share sheet. Cancel the sheet. Fallback "Shared as text" acceptable, note it | | | |
| 7.9 | Delete a CV (long-press/trash) | "Delete CV" confirm → removed from list | | | |

## Flow 8 — Goals & Roadmaps (Plan tab)

| # | Action | Expected result | Bug? | UI note | UX note |
|---|--------|-----------------|------|---------|---------|
| 8.1 | ⭐ Tap "Plan" tab | Roadmaps hub: "Roadmaps — Structured learning paths…", search, category chips (All/Scholarship/Career/…), template banner "Explore Roadmap Templates", creator banner "Become a Roadmap Creator" | | | |
| 8.2 | First visit may show intent modal ("Help Us Find Your Perfect Roadmap", 3 questions) | Answer or "Skip for now" — both dismiss cleanly and don't reappear | | | |
| 8.3 | Open a roadmap → detail | "What You'll Achieve", "Learning Path" steps, stats (Difficulty/Duration/Steps/Enrolled), "Start This Roadmap" | | | |
| 8.4 | [NET] Tap "Start This Roadmap" | "Roadmap adopted" sheet: milestones added to goals; options "View Goals" / "Add to Calendar" / "Continue Browsing" | | | |
| 8.5 | "Explore Roadmap Templates" → open a template (`/roadmap-templates/[id]`) | Curated path: About, outcomes, weekly journey, resource library, learner comments; "Start roadmap" works; comment box present (post one test comment max) | | | |
| 8.6 | ⭐ Go to Goals (`/goals`, via Quick Action or Plan) | "Goals" dashboard: "{n} active · {r}% completed", search, Upcoming Deadlines, sections Roadmaps + Personal Goals, calendar | | | |
| 8.7 | Create goal: center-circle "Create" morph or plus → "Create New Goal" | Form: title, description, priority (High/Medium/Low), deadline YYYY-MM-DD, live PREVIEW; past deadline → "Deadline cannot be in the past" | | | |
| 8.8 | Save goal | "Goal created successfully!"; appears under Personal Goals | | | |
| 8.9 | Open the goal → "Mark as Complete" | "🎉 Congratulations!" + possible "+{n} credits" reward toast; status flips; "Reopen Goal" available | | | |
| 8.10 | Toggle Reminder on a goal without deadline | "No Deadline — set a deadline first" guard | | | |
| 8.11 | `/goals/my-list` and `/goals/all-roadmaps` | "My Goals" list with sort options; "Roadmap Goals" grouped by roadmap; empty states render if empty | | | |
| 8.12 | Delete the test goal | "Delete Goal" confirm → gone | | | |

## Flow 9 — AI Chat (Edutu AI / Coach) — AI-heavy, risky area

| # | Action | Expected result | Bug? | UI note | UX note |
|---|--------|-----------------|------|---------|---------|
| 9.1 | ⭐ Tap center circle ("Open Edutu AI") | "AI Coach" chat opens; auto-resumes latest thread or shows quick prompts (Find scholarships / Mastercard matches / Build roadmap / Internship deadlines); history icon in header | | | |
| 9.2 | [AI-COST][NET] Tap "Find scholarships" quick prompt | Message sends, streamed AI reply arrives; no raw context/sentinel text visible in the transcript (context must stay hidden) | | | |
| 9.3 | [AI-COST] Type "Build a roadmap for my next application", send | Reply may include action buttons ("Yes, build me that roadmap.") and opportunity poster cards; cards tappable → opportunity detail | | | |
| 9.4 | Long-press an AI message | Options incl. "Read aloud" (TTS speaks the display text; "Stop reading" works) and "Report" (reasons sheet → "Report received") | | | |
| 9.5 | Header history button | Thread list; switch threads; new-chat works | | | |
| 9.6 | ⚠️ Voice mode: long-press the nav circle ("Hold for voice mode") | Voice orb overlay opens, mic permission prompt (accept), VAD listens. **Known-risky**: watch for stuck orb, no transcription, or crash. Speak "find me scholarships", verify transcript → reply (+ TTS). Close overlay cleanly | | | |
| 9.7 | Non-Pro rate limit (if applicable) | Graceful limit message with upgrade path, not an error screen | | | |
| 9.8 | Kill and reopen chat | Latest thread auto-resumes with history intact | | | |

## Flow 10 — Saved, Saved Searches, Deadlines, Notifications, Applied

| # | Action | Expected result | Bug? | UI note | UX note |
|---|--------|-----------------|------|---------|---------|
| 10.1 | ⭐ Open Saved (`/saved`) | "Saved Opportunities" with All/Urgent/Upcoming filter counts; the cards saved in Flows 4–5 show REAL titles/images (no "Opportunity/Unknown" hydration bug) | | | |
| 10.2 | `/my-opportunities` (via profile/Discover tiles) | "My Opportunities": summary chips Open/Urgent/Avg Match; deadline countdown labels ("{n}d left"/"Today"/"Ended") | | | |
| 10.3 | Open `/saved-searches` | "My alerts" list shows the search saved in 4.6; delete works | | | |
| 10.4 | ⭐ Open Deadlines (`/deadlines`) | "Deadlines — {total} total • {urgent} urgent"; grouped This Week / Next Week / This Month / Later / Past Due; Applied vs Bookmarked badges; empty state "No Deadlines Yet" + "Browse Opportunities" if empty | | | |
| 10.5 | Open Applied (`/applied`) | "My Applications" pipeline with stage filters (Draft/Submitted/Interview/Offer/Rejected/Withdrawn); the 6.10 submission appears; tap a card → "Update application status" → "Advance to {stage}" works | | | |
| 10.6 | ⭐ Tap header bell → Notifications | "Notifications" with All / Unread({n}) filter; possible "Add a password to your account" prompt card (OAuth users); empty state "You're all caught up!" | | | |
| 10.7 | Tap a notification with a target | Deep-links to the right screen (opportunity/goal); unread count on bell decrements | | | |

## Flow 11 — Paywall, Wallet, Referrals — MONEY: mock only

| # | Action | Expected result | Bug? | UI note | UX note |
|---|--------|-----------------|------|---------|---------|
| 11.1 | ⭐ Open Paywall (`/paywall` via "Upgrade" chip or Pro gate) | "Premium" hero ("Your next opportunity / is worth it"), plan cards Weekly/Monthly/Yearly with badges (Most taken/Popular/Best deal, "Save {pct}%"), feature list, "Restore purchases", Terms/Privacy links, "Not now" | | | |
| 11.2 | Switch between plans | Selection + price/period ("Billed monthly" etc.) updates | | | |
| 11.3 | [$] Tap the subscribe CTA ("Subscribe to premium" / "Continue to secure checkout") | Either StoreKit sheet (❌ **cancel immediately**) or pay.edutu.org web checkout (❌ **close without paying**). Cancel path returns to paywall with friendly "Payment didn't go through — no money left your account" style message, no crash | | | |
| 11.4 | ⭐ Dev tools (top-right in dev build): tap "🔓 Mock Pro" | Server-side mock purchase → celebration animation → Pro active. "🎉 Preview" just plays the celebration | | | |
| 11.5 | Verify Pro state propagates | Paywall shows "Premium is active"; profile shows Premium/verified badge; CV Pro templates unlocked; copilot un-gated | | | |
| 11.6 | "Restore purchases" | Completes with "Restored" or a graceful failure alert — no hang | | | |
| 11.7 | ⭐ Open Wallet (`/wallet`) | "Wallet": Credits Balance, streak card ("{n}-day streak"), "Buy Credits", "History", Recent Transactions (or "No transactions yet") | | | |
| 11.8 | [$] Tap "Buy Credits" → pick a pack (Starter/Popular/Pro/Mega Value) | IAP sheet appears → ❌ **cancel**. Graceful cancel handling ("Purchase Failed"/silent), no crash | | | |
| 11.9 | ⭐ Open Referrals (`/referrals` / "Invite friends") | "Give 10, get 10" hero, YOUR CODE displayed, stats Joined/Pending/Credits, "Share invite" | | | |
| 11.10 | Tap "Share invite" | Share sheet with invite link (edutu invite deep link). Cancel | | | |

## Flow 12 — Profile, Settings, Help/Contact, Creator/Mentor, Guest mode

| # | Action | Expected result | Bug? | UI note | UX note |
|---|--------|-----------------|------|---------|---------|
| 12.1 | ⭐ Tap "Me" tab | Profile: avatar/name, stats (Active goals / Matches / Applied / Deadline), "Edit Profile", "Become a Creator" banner, menus Tools/Preferences/Support, "Log Out", version footer | | | |
| 12.2 | "Edit Profile" | Form: Full Name, Country, University/School, Major, CGPA; save → "Profile updated successfully!" and values persist after reload | | | |
| 12.3 | ⭐ Settings (`/profile/settings`) | Sections: Appearance (Light/Dark/System + 9 color themes), Navigation Bar (Glass pill / Bar+button / Classic bar / Center button), Language, Notifications, Accessibility, Privacy & Security, Support & About, Legal, Danger Zone | | | |
| 12.4 | Switch Dark mode, then a color theme (e.g. "African Sunset") | Whole app re-themes instantly; go check Home + Detail for unreadable text/contrast regressions; switch back | | | |
| 12.5 | Switch Navigation Bar style to "Classic bar" and back | Bottom nav restyles live; circle actions still work | | | |
| 12.6 | Language: switch to French | UI re-renders in French app-wide; switch back to English. (Arabic prompts "Restart required" for RTL — skip the restart) | | | |
| 12.7 | Notifications toggles + Quiet Hours | Toggles persist; permission-off state offers "Open Settings" | | | |
| 12.8 | Security (`/profile/security`) via "Password & Keys" | "Active devices" list ("This device"), change/add password form, "Sign out of all other devices", Connected accounts. **Don't revoke this device** | | | |
| 12.9 | ⭐ Help (`/help`) | "How can we help?" + FAQ accordions (tap to expand), "Email Support", "Visit Website" | | | |
| 12.10 | Contact (`/contact`) | Support/bug form renders with validation. [NET] Sends a REAL email — submit at most once with body "QA TEST — ignore", or skip submission | | | |
| 12.11 | "Become a Creator" → `/creator-apply` | Multi-step wizard: motivation → "Your Achievement" (type, name, LinkedIn) → Verification (doc upload "Tap to upload", story) → Review → Submit. Step through UI; only submit with obvious test data if needed | | | |
| 12.12 | `/mentor-apply` and `/creator-dashboard` | Mentor wizard renders ("Become a Mentor" … "Get Started"); Creator Studio shows apply-gate ("Apply to Become a Creator") or dashboard if approved; long-load fallback ("This is taking longer…") acceptable on cold backend | | | |
| 12.13 | Danger Zone: tap "Delete Account" | Confirm dialog appears → ❌ **tap Cancel**. Never confirm | | | |
| 12.14 | "Log Out" (confirm) | Returns to welcome screen; no stale session flash | | | |
| 12.15 | ⭐ Guest mode: on welcome tap "Continue without login" | Guest welcome modal ("Browse scholarships… freely"); Home renders in guest mode | | | |
| 12.16 | As guest: open an opportunity card | Detail opens (guests may view home + a single detail ONLY) | | | |
| 12.17 | As guest: tap Discover / Plan / Me tabs, bell, save, apply-with-AI | Every gated action raises the AuthWall sheet (sign up / sign in) instead of navigating; dismissing it keeps you on Home; no route leak to gated screens | | | |
| 12.18 | Kill + relaunch as guest | Splash routes straight back into guest Home (persisted guest flag) | | | |

---

## Known-risky areas (watch extra closely)

- **Voice mode** (9.6): orb overlay, VAD, Whisper STT, TTS — historically fragile.
- **Realtime**: Supabase `postgres_changes` subscriptions (notifications/chat) previously crashed; watch for crashes when backgrounding/foregrounding with chat or notifications open.
- **Deep links** (5.11, invite links): `edutu://` routes.
- **IAP/RevenueCat** (11.3, 11.8): sheets must be cancelled; cancel-path handling is the test.
- **Render cold start**: first backend call of the session may take 30–60 s — distinguish "slow backend" from real hangs before logging P0/P1.
- **AI spend**: every [AI-COST] step bills real tokens — one run each.

## Findings Log

Run 1 — 2026-07-22, iPhone 17 / iOS 26.5 sim, account "Edutu Test" (authed, Pro). Covered: splash, Home, Profile, Discover + category filter, Opportunity Detail ×5 (both themes), CV Builder, Goals, AI Chat, Saved, Deadlines, Notifications, Paywall, Wallet, Referrals, Settings + light/dark theme. NOT run: co-pilot AI generation (gated + AI backend broken — see F6), roadmap-template detail, voice mode, guest mode (needs logout), onboarding (account already onboarded).

**3 backend failures are the headline** — the flagship AI feature and two growth loops are returning canned text / erroring, almost certainly an incomplete backend/Supabase deploy, not mobile code.

| ID | Flow | Sev | Type | Status | Description |
|----|------|-----|------|--------|-------------|
| F6 | AI Chat | **P1** | Bug | backend | **AI Coach returns a fixed canned fallback for every message** ("I can help with scholarships, internships, fellowships…") — identical for a fit-assessment question and a greeting. The LLM isn't answering; backend serves the intro string (not in mobile code). Likely Render AI-provider keys / `ai_routes` / pending AI deploy. |
| F7 | Deadlines | **P1** | Bug | backend | **"Error fetching deadlines"** toast — endpoint errors, so Deadlines shows "0 total" despite saved opps with live dates. |
| F9 | Referrals | **P1** | Bug | backend | **"Failed to get referral code: {code:42501}"** — PG 42501 = insufficient_privilege (Supabase RLS/grant). No code shown, Share invite dead → referral loop broken. Raw DB error also leaked to a user-facing toast. |
| F2 | Opp cards/detail | P2 | Data | open | Scraped `location` contains deadline text → "Abuja Deadline: 3rd August" run-on. App renders `opportunity.location` faithfully (opportunities/[id].tsx:1610) — fix in scraper/data, or defensively strip in app. |
| F1 | Home | P3 | UI | ✅ fixed | "Graduate Pr…" truncated → `iconTileLabel` numberOfLines 1→2 (index.tsx:219). Verified: shows "Graduate Programs". |
| F3 | Opp Detail | P2 | UI | ✅ fixed | Floating AI orb overlapped Apply Now/Save CTAs → `contentContainerStyle paddingBottom:96` on detail ScrollView (opportunities/[id].tsx:1490). Verified: orb clears the CTAs. |
| F5 | Settings | P3 | UI | ✅ fixed | Duplicate "APPEARANCE" label → added `display.themeMode`="Mode", settings.tsx:483 uses it (non-en fall back to en). Verified: sub-label reads "MODE". |
| F8 | Wallet | P3 | UX | ✅ fixed | "Upgrade to Pro" card shown to an already-Pro user → gated on `!isPro` (wallet.tsx:153). Verified: Pro user now sees only "Buy Credits" (full-width). |
| F10 | Referrals | P3 | UI | open | Copy contradiction: title "Give 10, get 10" vs body "you get 10 and they get 5". Align (needs canonical reward values). |
| Toast UX | Global | P3 | UX | open | Error toasts (F7/F9) show raw DB JSON and persist across screen navigation instead of auto-dismissing with a friendly message. |
| ~~F4~~ | Nav | — | — | retracted | Not a bug — was my test-harness coordinate-space error. |

### Verified passing (happy path)
Splash→Home routing · Home (all sections, real card images — no hydration bug) · Profile (stats, verified badge) · Discover categories + "For you" grid · Category filter (Grid/List, sort chips, match reasons) · Opportunity detail ×5 (unique hero images, green/red urgency pills, fit chips, co-pilot card, per-opp save state, "Closed" on expired opps) · CV Builder (3 build paths + template gallery + Pro crown gating) · Goals (calendar strip, stats, empty states) · AI Chat renders + sends (response quality = F6) · Saved (4 opps, real hydration, IITA correctly "Closed") · Notifications (trending news + empty state) · Paywall (Pro-active state + dev Mock Pro button) · Wallet (Pro Member badge, streak) · Settings + instant light/dark re-theme, good contrast both ways, status-bar icons flip correctly.

### Tooling fix applied (not an app bug)
Dev-menu FAB touch-freeze on iOS sim → `EXDevMenuShowFloatingActionButton: false` in app.config.js infoPlist (dev-only, no-op in prod).

---

## Run 2 — 2026-07-23 (deep-dive: Goals, CV, Saved, Creator, Invite friends, Wallet)

| ID | Flow | Severity | Type | Description | Status |
|----|------|----------|------|-------------|--------|
| F12 | Goals | P1 | Bug | **Goal creation failed 100%.** Four stacked causes: (1) `goals` table missing `roadmap_id`/`opportunity_title` columns that `useGoals` sends (postgrest-js lists every payload key in `?columns=` → PGRST204); (2) stale PostgREST schema cache; (3) analytics helper fns deployed taking `uuid` while all user ids are text Clerk ids → 42883 from goal triggers; (4) `goal_daily_metrics` has SELECT-only RLS and trigger fns weren't SECURITY DEFINER → 42501. Plus pooled-connection stale plans re-broke it until a DDL touch invalidated them. FIXED via live migrations `add_goals_roadmap_opportunity_columns`, `fix_analytics_fn_user_id_text`, `analytics_triggers_security_definer`. Verified: goal created, dashboard counts update. **Note for analytics owner:** backend `supabase/schema.sql` still declares these fns with `uuid` params — reconcile to `text` + SECURITY DEFINER. | ✅ fixed (3 live migrations) |
| F9b | Referrals + credits | P1 | Bug | Root cause of F9: **supabase-js `.rpc()` requests leave with the ANON KEY as bearer** (builder header precedence beats the `accessToken` hook) while `.from()` correctly carries the Clerk JWT → every jwt-scoped RPC (referral code/stats, `claim_daily_credit`, redeem) failed 42501/"Not authenticated". FIXED in `packages/core/src/services/supabase.ts`: innermost fetch wrapper swaps an anon bearer for the user token on /rest/v1/ requests; plus EXECUTE grants on the 3 referral RPCs to `anon` role (matches this schema's Clerk-jwt-over-anon model, migration `grant_referral_rpcs_to_anon_role`). Verified: referral code renders + Share enabled; credits 0→11; streak day-1 lit. | ✅ fixed (client + grants) |
| F13 | CV Builder | P2 | UI | Raw i18n keys rendered for empty sections (`editor.empty.experience` …) — keys never existed in `en/cv.json`. Added all 4 (other locales fall back to en). | ✅ fixed |
| F11 | Goals | P2 | Bug | "My Opportunities: 0 saved" vs Saved's 4 — likely the same anon-request class as F9b (jwt-scoped read silently empty). Re-verify after the auth fix. | needs re-verify |
| — | Creator Studio | P3 | UX | `/roadmaps/mine` 429 (rate limit) → graceful "couldn't be refreshed / Tap to retry" banner, no crash. Could hint "try again in a minute". | note |

### Run 2 verified passing
Goal create end-to-end (min-title + past-deadline validation, live preview, "39 days from now" hint) · CV editor prefilled from profile + "CV saved successfully!" · Saved unsave (4→3, filter counts update) · Creator wizard steps 1–2 (Victory Story intro, motivation select) · Creator Studio (stats, verified-creator banner, graceful 429) · Invite friends (code 4394462C, Share enabled, stats) · Wallet (11 credits, Pro Member badge, 1-day streak lit, Buy Credits sheet with packs safely "Coming soon") · F8 re-verified: no "Upgrade to Pro" card for Pro users.

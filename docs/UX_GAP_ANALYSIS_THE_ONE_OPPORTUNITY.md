# UX Gap Analysis — "The One Opportunity"

Derived from the Amara user story (a driven final-year student navigating opportunities *without* Edutu), audited against the actual codebase on 2026-07-12. Thesis: **users don't need 1,001 opportunities; they need the one they can win, and a companion who walks them to the win.**

Verdict up front: Edutu has built most of the *organs* (matching, tracking, roadmaps, copilot, reminders) but few of the *loops*. The product captures data and shows lists; it rarely closes the circle back to the user with a decision, a next action, or an emotion. Mobile is far ahead of web on every coaching surface.

---

## Loophole 1 — Volume without fit: no "winnable few"

**Story:** 63 saved opportunities, zero applications. Nobody said "you are competitive for 4 — start with this one."

**Have:** Match scores + ranked reasons + soft risks on both apps (`edutu-web-app/src/services/personalizedRecommendations.ts`, `MatchInsights.tsx`; mobile mirrors via server scores). Backend hybrid reco engine.

**Missing:**
- **The shortlist.** No surface anywhere says "your 3 best shots this month." Scores only re-rank an infinite feed; below-40 matches silently hide their badge instead of being explained away. The core promise — *narrowing* — doesn't exist as a UX object.
- **Disqualification honesty.** `risks[]` says "worth checking"; nothing ever says "skip this — you don't meet the 2-years-experience requirement." Backend has **no structured eligibility check** at all: `eligibilityCriteria` is free text used for keyword ranking, never a verdict (`opportunity-ranking.service.ts`).
- Matching is substring-based (`category.includes(interest)`), not semantic; `userProfileEmbeddings` exists but is unused for this.

## Loophole 2 — A deadline is not a plan: the plan and the reminders are disconnected

**Story:** She missed Commonwealth because "work on scholarship" was one giant task with hidden lead times.

**Have:** The strongest area — mobile's `aiRoadmapGenerator.ts` genuinely reverse-engineers from the deadline with lead-time knowledge (transcripts 1–2 weeks, brief referees early, submit-early buffer). Templates carry `relativeDueDays`. Backend `adopt()` computes step due dates backward from `targetDeadline`.

**Missing:**
- **The AI plan never reaches the reminder system.** `/roadmaps/ai/opportunity-plan` output has no due dates, isn't persisted, and `buildReminderSchedule`'s computed 30/14/7/3/1-day reminders are **returned in the API response but never enqueued** (`roadmaps.service.ts:1518-1559`). Only the separate adopt→goals path produces real reminders. The flagship "roadmap" can be generated and then silently do nothing.
- **Ungrounded plan input:** the endpoint trusts client-supplied opportunity fields instead of loading the verified DB row by ID (`roadmaps.controller.ts:292-299`) — the plan can be built on wrong data.
- Web has no reverse-engineering generator at all.

## Loophole 3 — Dumb reminders: time-left, never next-action

**Story:** "7 days left" is an insult; she needed "do this 15-minute thing today."

**Have:** Local push at 3/1/0 days (`edutumobile/lib/notifications.ts`), goal reminders 7/3/1/0 via backend queue, calendar sync, deadline screens.

**Missing:**
- **No "next small action" in any notification payload** — every body is generic countdown copy. The roadmap knows the next unchecked task; the notification doesn't carry it.
- **No opportunity-deadline cron.** Backend never scans saved/applied opportunities' deadlines; reminders exist only if the user manually created a goal or adopted a roadmap. Amara who just *saved* Commonwealth gets nothing.
- No "real deadline" math surfaced ("transcripts take 3 weeks → your real deadline is March 1").

## Loophole 4 — Hallucinated guidance

**Story:** The generic chatbot invented a grant and got eligibility wrong; it cost her weeks.

**Have:** Chat injects real DB opportunity context with a "never fabricate" system rule (`chat.service.ts:440`); copilot grounds kits in the real row including eligibility/requirements (`copilot.service.ts:437-466`). This week's deadline-integrity work makes the underlying data trustworthy.

**Missing:**
- Chat context only loads when a regex intent fires; factual questions phrased differently get **no grounding**. Only 10 recent opportunities, keyword-ranked.
- Chat fetches `requirements` but **never puts requirements/eligibility in the prompt** — the exact fields users ask about.
- Copilot/roadmap prompts tell the model to *infer* missing requirements ("infer what this kind of program always requires") — an explicit fabrication invitation. No refuse-when-unknown rule, no source attribution anywhere ("per the official page, checked this week").

## Loophole 5 — Generic advice → generic applicant: no unified memory

**Story:** The winning statement was inside her own story; she needed something that remembered her.

**Have:** Chat loads profile+goals+8 thread messages; copilot loads profile+goals and persists essay drafts per kit.

**Missing:** No cross-surface memory. Chat can't see her kits, drafts, or applications; copilot can't see chat; nothing recalls "you told me last month you built a tutoring business." Each surface reassembles context from scratch. Her accumulating story — the retention moat — is fragmented.

## Loophole 6 — The lonely last mile

**Story:** 11:52pm submission, panic questions, no final check.

**Have:** Mobile copilot kit is genuinely good: winning angle, tickable document checklist (referee briefing, transcripts, CV tailoring), essay outlines/drafts/feedback, submission overlay.

**Missing:**
- **No final-review gate** — no holistic "you're ready: all 9 items green, essay reviewed, docs named correctly" moment before submit.
- **No referee outreach email draft** (the kit says "brief your referees" but won't write the email — trivially cheap, high value).
- **Copilot does not exist on web at all.** The entire application-kit experience is mobile-only.

## Loophole 7 — Rejection teaches nothing

**Story:** Two-line rejection, no post-mortem, next application starts from the same blindness.

**Have:** Users can set `rejected`/`offer`/`withdrawn` in both hubs; offers get one congratulatory line.

**Missing (entirely):**
- No post-mortem flow ("what do you think fell short?" + AI analysis of the kit vs. the outcome).
- No feedback loop into matching — backend signals stop at `apply`; **no outcome table**, so the reco engine never learns what she actually wins.
- No re-routing: rejection is a dead-end status. The single highest-retention moment — "here's the next opportunity where your improved profile is *more* competitive" — doesn't exist.

## Loophole 8 — Nobody is watching: effort is invisible

**Story:** No one celebrated the finished statement or caught her after the miss. Feeling noticed = retention.

**Have:** Login streak for credits (`wallet.tsx`), quiet progress percentages on goals/checklists, some copy warmth.

**Missing:**
- Zero celebration on real achievement — no moment when a checklist item, essay draft, or roadmap milestone completes (confetti: 0 hits in the codebase). Streaks reward *opening the app*, not *doing the work*.
- No "I see you" messaging: no "you've done 6 of 9 steps — further than last time," no catch-you-when-you-slip nudge when a roadmap goes untouched for a week (the data to detect this exists).
- Progress is displayed, never *narrated*.

---

## Priority order (impact ÷ effort)

1. **Close the reminder loop** — enqueue `buildReminderSchedule`; add an opportunity-deadline cron for saved/applied items; put the next unchecked roadmap task in every notification body. (Loopholes 2, 3 — the missed-deadline killer.)
2. **Ground everything** — opportunity-plan loads the DB row by ID; chat prompt gains requirements/eligibility; replace "infer" with "say what's unknown"; always-on context retrieval. (Loophole 4 — trust is the brand.)
3. **The Shortlist** — a "Your best shots" surface (3–5 items max) with eligible/ineligible verdicts from a structured profile-vs-eligibility check. This *is* the product thesis. (Loophole 1.)
4. **Outcome capture + post-rejection flow** — outcome on the application record → post-mortem chat → re-route to next best match; feed outcomes into ranking. (Loophole 7.)
5. **Effort-based celebration & watchfulness** — milestone celebrations, work streaks, stalled-roadmap catch nudges. (Loophole 8 — cheap, pure copy/animation + one cron.)
6. **Last-mile kit upgrades** — final-review gate, referee email drafts; then web copilot parity. (Loophole 6.)
7. **Unified user memory** — shared context layer (profile + drafts + kits + key chat facts) consumed by chat, copilot, and roadmaps. (Loophole 5 — the moat.)

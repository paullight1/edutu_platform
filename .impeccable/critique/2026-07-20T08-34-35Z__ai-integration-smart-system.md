---
target: AI integration smart system (mobile + web + engine)
total_score: 24
p0_count: 2
p1_count: 4
timestamp: 2026-07-20T08-34-35Z
slug: ai-integration-smart-system
---
# Critique — Edutu AI Integration (mobile + web + backend engine)

Method: dual-agent (isolated Assessment A design review + Assessment B detector) plus a third backend functionality agent. Browser visualization skipped: no browser automation tool exposed.

## Design Health Score — 24/40 (Acceptable: significant improvements needed)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | No real streaming; typing indicator always says "checking opportunities" even for essay help; fake typewriter (chat.tsx:106-142) |
| 2 | Match System / Real World | 3 | Chip taps post canned English first-person text as the user's own message (chat.tsx:565-576, 1131) |
| 3 | User Control and Freedom | 2 | No stop/cancel during generation; no regenerate/edit; threads can't be deleted or renamed (chat.tsx:1611-1652) |
| 4 | Consistency and Standards | 1 | Two rival AI affordance systems on opportunity detail ([id].tsx:1738-1795 vs 1831-1856); 5 distinct paywall visual systems; hardcoded #6366F1 ignoring theme packs |
| 5 | Error Prevention | 3 | Push prefill never auto-sends credits; calendar sync asks first; duplicate-roadmap check |
| 6 | Recognition Rather Than Recall | 2 | Win-coach advice is ephemeral — vanishes on sheet close, never in history (AiActionBar.tsx:97-139) |
| 7 | Flexibility and Efficiency | 3 | Long-press voice entry, follow-up chips, dictation vs live modes |
| 8 | Aesthetic and Minimalist Design | 2 | Detail page stacks 6+ AI ornaments; orb settings ship 8 skins incl. "Robo Edutu", "Jelly buddy" — childish-gamification anti-reference hit (VoiceSettingsSheet.tsx:35-126) |
| 9 | Error Recovery | 3 | Limit-vs-generic send-error banner is excellent (chat.tsx:1469-1524); win-coach 402 is a dead-end string with no retry/upgrade (useAiAction.ts:40-44) |
| 10 | Help and Documentation | 2 | Coach tool capabilities (documents, exports, calendar) undiscoverable until the agent volunteers them |
| **Total** | | **24/40** | **Acceptable** |

## Anti-Patterns Verdict

LLM assessment: voice mode is ChatGPT-caliber; web MatchInsights is disciplined and token-clean. But the chat client fabricates assistant replies (English regexes replace model output with canned "I found N matches" templates + client-ranked fallback cards, chat.tsx:144-176, 214-250, 885-914), the opportunity detail ships two competing AI systems, and the orb skin gallery is a toy box inside the one calm surface.

Deterministic scan: 29 files scanned (11 web, 18 mobile). Mobile: clean. Web: 2 warnings, both rule `ai-color-palette`, both on OpportunitiesPage.tsx:344 (violet gradient variants inside a rotating low-opacity category-accent array — likely partial false positive). No browser overlay (no automation tool).

## Priority Issues

- **[P0] The AI coach is English-only in a 9-language product.** Backend `isEdutuRelevant` (chat.service.ts:1518-1554) requires English keywords before the agent runs → French/Arabic/Swahili users get the canned redirect. Client mirrors this: English-only reply-rewriting regexes, hardcoded English win-coach strings (AiActionBar.tsx:110-127, DocumentUpload.tsx:44), English chip payloads (chat.tsx:347, 1131). Moderation regexes are English-only too — safety bypassed where utility is blocked. Fix: drop the pre-gate for agent turns, move all strings to locale files, multilingual moderation.
- **[P0] Web /upgrade sells "Unlimited AI help" but the web AI coach was removed** (App.tsx:601-603 redirects /coach → dashboard; UpgradePage.tsx:41-47 sells it anyway). Trust/refund risk. Restore a web coach surface or rewrite web Pro benefits.
- **[P1] The client overwrites the model's replies** — fake match counts, injected keyword-ranked cards, markdown tables and `*` silently stripped (chat.tsx:791-803). Trust the agent: render metadata.opportunities only when present; render tables.
- **[P1] No token streaming end-to-end.** Adapters send stream:false (openai-compat.ts:61); worst-case 7 sequential LLM calls per turn; SSE streams tool progress but not tokens; UI masks with three dots then a fake typewriter, with no cancel. On 3G this is 20–60s of silence. Stream the final round over the existing SSE channel + add a stop affordance.
- **[P1] The "smart" engine runs in dumb mode in prod.** RECS_ENGINE=hybrid but no GEMINI_API_KEY and 0 embeddings → everything (chat recs, alerts, match badges) degrades to keyword-overlap heuristic_v1. One env var + existing resumable backfill activates it.
- **[P1] Two rival AI affordance systems on opportunity detail** — i18n'd "Ask AI" chips that eject into chat vs hardcoded-English win-coach pills answering in an ephemeral sheet; 7 adjacent AI actions. Merge into one in-place system with one "Ask Edutu more…" chip.
- **[P2] Monetization moments destroy user work**: composer cleared before limit error, retry only wired to generic branch (chat.tsx:472-503, 1495-1513); free-tier daily counter burned on failed turns and never rolled back (monetization.service.ts:131-137); no "N messages left" signal — 429 arrives cold; win-coach 402 has no upgrade CTA.
- **[P2] Backend robustness bundle**: no fallbackProvider on default chat routes (DeepSeek outage = product-wide canned answers, ai.service.ts:792-817); prompt-injection surface — uploaded docs and scraped listings enter the agent prompt unframed while the agent holds mutating, credit-spending tools (coach-tools.service.ts:1125-1140); no turn-id or prompt/response sampling — "why did the AI say that" is unanswerable (ai.service.ts:907-965); no context budget in the 6-round agent loop.
- **[P2] Accessibility**: History button and card icons unlabeled; PulsingCrown/WelcomeHint pulses ignore reducedMotion; typewriter mutates text mid-announcement; typing state never announced. Web ProGate.tsx:77-92 is the model citizen.
- **[P2] Orb skin toy box** (8 designs) dilutes the ChatGPT-restrained voice identity. Ship one signature orb.

## What's genuinely working

- Voice mode: barge-in, word-synced captions, VAD, chimes/haptics ritual, dignified limit-hit handling, labeled controls (best surface in the product).
- Failure design: limit-vs-generic error banner; voice error triage (permission/limit/network).
- Web MatchInsights: tiered scores, reason chips, risk panel, hides scores <40 — honest and consistent.
- Backend: transactional fail-closed metering with refunds; 22 Zod-validated tools with model-recoverable errors; graceful degradation with honest generatedBy:"fallback" flags; hardened HTTP layer; spam-safe crons (caps, ledger dedup, quiet hours).

## Persona red flags

- Casey (3G, one-handed): no partial text, no cancel; base64 m4a per voice turn; failed turn loses utterance; physical marginLeft breaks RTL card rail; hint-tour focus rings from hardcoded screen math.
- Jordan (first-timer): coach capabilities invisible; live-vs-dictation mic unexplained; Sparkles icon means AI, premium, AND featured.
- Sam (screen reader): chat largely unlabeled/unannounced; voice mode surprisingly good; web ProGate exemplary.

## Minor observations

English quick-prompt payloads in all locales; "New Conversation" untitled threads, no preview snippet; typewriter replays on old threads; `applicants || "500+"` fabricated stat ([id].tsx:1600); hardcoded indigo across OpportunityCard/WelcomeHint/voice pill; stale web CLAUDE.md documents deleted ChatInterface; UpgradeModal/UpgradePage/ProGate English-only on 6-language web; three voice entry doors for two rooms; MatchScoreBadge title-attribute tooltip invisible on touch; extractMemories = +1 LLM call per turn; serial tool execution; $0 cost recorded for unrecognized models.

## Strategic gaps (backend)

No eval harness (live-editable persona with zero regression checking); no thumbs-up/down on coach messages; memory recency-only (LIMIT 12, no semantic retrieval or contradiction handling); no language strategy in the AI layer; no cost circuit breakers; no A/B surface despite already-collected outcome signals.

## Questions to consider

1. Who owns the assistant's voice — the model or the client? If the client doesn't trust the agent's output enough to render it, why should users trust it enough to act on it?
2. Is /upgrade on web a landing page for the mobile app or a storefront for the web product? It's priced like the former, worded like the latter.
3. Is the orb a brand signature or a toy box? Would a "trusted older sibling" hand you a googly-eyed jelly to discuss your scholarship essay?

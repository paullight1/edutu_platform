# Edutu Advert — Creative Brief / Production Prompt

This is the prompt the `EdutuAd` Remotion composition is built from. Feed it back to any
motion designer (human or AI) to regenerate or extend the ad.

---

## The prompt

> Produce a **43-second vertical (1080×1920, 30 fps) marketing video** for **Edutu**, the
> AI-powered opportunity coach that helps ambitious learners — especially African youth —
> find scholarships, fellowships, internships and grants, and actually win them.
>
> **Audience:** 16–28 year-old students and early-career youth in Lagos, Accra, Nairobi and
> beyond. Mobile-first, watching on Instagram Reels / TikTok / WhatsApp Status with sound
> off — every message must land visually, with text.
>
> **Single-minded proposition:** *The opportunities already exist. Edutu makes sure they
> find YOU — and walks you from "found" to "funded."*
>
> **Emotional arc:** injustice → recognition → relief → momentum → belief → action.
> Problem-Agitate-Solve structure, then proof, then CTA.
>
> **Tone:** premium, kinetic, hopeful. Not charity-toned — this is a power tool for
> ambitious people. Think Apple keynote meets Duolingo energy.

### Script / storyboard (8 scenes)

| # | Time | Scene | On-screen copy | Visual treatment |
|---|------|-------|----------------|------------------|
| 1 | 0.0–4.0s | **Hook** | "Every year, **millions of dollars** in scholarships go **unclaimed**." | Deep-navy void, giant kinetic serifless type, "unclaimed" struck through in gold. Slow push-in. |
| 2 | 4.0–9.0s | **Agitate** | "Not because you weren't good enough." → rapid stamps: "Scattered info." "Hidden deadlines." "No guidance." → "The opportunity went to someone else." | Hard cuts, red/amber stamp cards slamming in with rotation, screen-shake on impact. |
| 3 | 9.0–13.5s | **Reveal** | "Meet **Edutu**" / "Your AI opportunity coach" | Logo icon blooms from darkness with gold-particle ring, brand-blue radial glow floods the frame. |
| 4 | 13.5–20.0s | **Smart matching** | "Matched to *you*. Not the crowd." | Phone mock: opportunity cards (Mastercard Foundation 96%, Rhodes 94%, DAAD 91%, Google STEP 89%) cascade in; match-percentage rings count up live. |
| 5 | 20.0–26.5s | **Roadmap + AI copilot** | "From found… to **funded**." | AI roadmap checklist ticks itself (Essay draft ✓, Recommendation letters ✓, Transcript ✓, Submit ✓); floating chat bubble: "Ask Edutu anything." |
| 6 | 26.5–32.5s | **Deadlines + tracking** | "Never miss a deadline again." | Urgency pills pulse ("Closes in 3 days"); kanban pipeline Saved → Applied → Interview → **Accepted 🎉** with a card physically travelling the pipeline. |
| 7 | 32.5–38.0s | **Proof** | "Opportunities from **31+ countries**" + "3 scholarship offers in 2 months." — Adaeze, Nigeria | University crests (Harvard, Oxford, MIT, Stanford, Lagos) orbit a glowing globe; testimonial card slides up. |
| 8 | 38.0–43.0s | **CTA** | "Your future won't wait." / **Get started free** / edutu.org / "Free to start · No card required" | Logo lockup, breathing gold CTA button, calm resolve after the kinetic ride. |

### Visual system (must match product brand)

- **Font:** Outfit (Google Fonts) — weights 500–900. Display copy is tight-tracked, 800–900 weight.
- **Colors:** navy void `#050914` → `#0C0F1A`; brand blue `#2563EB` (bright `#3B82F6` / `#60A5FA`);
  **gold accent `#F6B64A`** (from the logo's gold dot — reserved for emphasis words, ticks, CTA);
  success `#22C55E`; danger `#EF4444`; text `#F8FAFC`; muted `#A9C3F8`.
- **Texture:** subtle vignette + radial brand glows; faint dotted grid on UI scenes; no flat black.
- **Motion language:** spring/`Easing.bezier(0.16,1,0.3,1)` entrances; nothing linear; overlapping
  staggers (~4–6 frames apart); scale-settle on stamps; every scene exits with a 12–18 frame fade
  so cuts never jar. Match-ring counters and checklist ticks must animate, never appear.
- **Safe areas:** keep critical copy inside the middle 80% vertically (Reels UI chrome).

### Assets available

`public/assets/`: `edutu-icon.jpg` (app icon, indigo + gold dot), university crest PNGs
(harvard, oxford, mit, stanford, unilag), `globe.png`, `avatars.png`.

### Deliverable

- Composition id `EdutuAd`, 1290 frames @ 30 fps, 1080×1920, h264 MP4.
- Silent-autoplay-safe: fully legible with sound off. (Music bed optional — drop a track in
  `public/audio/` and wire an `<Audio>` tag; sidechain nothing, keep copy king.)

import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Backdrop, Display, Eyebrow, Glass, MatchRing, Phone } from "./components";
import {
  BLUE_LIGHT,
  BORDER,
  clamp,
  FONT,
  GOLD,
  GREEN,
  MUTED,
  rise,
  sceneFade,
  TEXT,
} from "./theme";

/* ------------------------------------------------------------------ */
/* Scene 4 — SMART MATCHING (195f)                                     */
/* ------------------------------------------------------------------ */
const OPPS = [
  {
    title: "Mastercard Foundation Scholars",
    org: "Full scholarship · Africa & global",
    tag: "Scholarship",
    tagColor: GOLD,
    match: 96,
    at: 34,
  },
  {
    title: "Rhodes Scholarship",
    org: "Fully funded · University of Oxford",
    tag: "Postgrad",
    tagColor: BLUE_LIGHT,
    match: 94,
    at: 48,
  },
  {
    title: "DAAD Masters Grant",
    org: "Tuition + stipend · Germany",
    tag: "Grant",
    tagColor: GREEN,
    match: 91,
    at: 62,
  },
  {
    title: "Google STEP Internship",
    org: "Paid internship · Remote / EMEA",
    tag: "Internship",
    tagColor: BLUE_LIGHT,
    match: 89,
    at: 76,
  },
];

export const MatchingScene: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ opacity: sceneFade(frame, duration) }}>
      <Backdrop glow="blue" grid glowStrength={0.8} />
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 150 }}>
        <div style={rise(frame, 2)}>
          <Eyebrow color={BLUE_LIGHT}>AI match</Eyebrow>
        </div>
        <div style={{ ...rise(frame, 12), marginTop: 40 }}>
          <Display size={96} weight={900}>
            Matched to <span style={{ color: GOLD }}>you.</span>
          </Display>
          <Display size={96} weight={700} color={MUTED} style={{ marginTop: 6 }}>
            Not the crowd.
          </Display>
        </div>

        <div style={{ marginTop: 70, ...rise(frame, 22, 26, 80) }}>
          <Phone width={760}>
            <div style={{ padding: "110px 42px 40px" }}>
              <div
                style={{
                  fontFamily: FONT,
                  fontWeight: 800,
                  fontSize: 40,
                  color: TEXT,
                  marginBottom: 10,
                }}
              >
                Today’s top matches
              </div>
              <div
                style={{
                  fontFamily: FONT,
                  fontWeight: 600,
                  fontSize: 27,
                  color: MUTED,
                  marginBottom: 36,
                }}
              >
                Picked for your profile · updated 2 min ago
              </div>

              {OPPS.map((o, i) => {
                const pop = spring({
                  frame: frame - o.at,
                  fps,
                  config: { damping: 15, stiffness: 130, mass: 0.9 },
                });
                const value = interpolate(
                  frame,
                  [o.at + 8, o.at + 42],
                  [0, o.match],
                  clamp,
                );
                return (
                  <div
                    key={i}
                    style={{
                      opacity: frame >= o.at ? Math.min(1, pop * 1.3) : 0,
                      transform: `translateY(${(1 - pop) * 90}px)`,
                      display: "flex",
                      alignItems: "center",
                      gap: 26,
                      padding: "28px 28px",
                      marginBottom: 24,
                      borderRadius: 30,
                      background:
                        "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.035))",
                      border: `2px solid ${BORDER}`,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "inline-block",
                          padding: "8px 20px",
                          borderRadius: 999,
                          background: `${o.tagColor}1E`,
                          border: `2px solid ${o.tagColor}55`,
                          color: o.tagColor,
                          fontFamily: FONT,
                          fontWeight: 700,
                          fontSize: 22,
                          letterSpacing: 2,
                          textTransform: "uppercase",
                          marginBottom: 14,
                        }}
                      >
                        {o.tag}
                      </div>
                      <div
                        style={{
                          fontFamily: FONT,
                          fontWeight: 800,
                          fontSize: 34,
                          color: TEXT,
                          lineHeight: 1.15,
                        }}
                      >
                        {o.title}
                      </div>
                      <div
                        style={{
                          fontFamily: FONT,
                          fontWeight: 600,
                          fontSize: 25,
                          color: MUTED,
                          marginTop: 8,
                        }}
                      >
                        {o.org}
                      </div>
                    </div>
                    <MatchRing value={value} target={o.match} size={124} />
                  </div>
                );
              })}
            </div>
          </Phone>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Scene 5 — ROADMAP + COPILOT (195f)                                  */
/* ------------------------------------------------------------------ */
const STEPS = [
  { label: "Personal essay drafted with AI", at: 46 },
  { label: "2 recommendation letters requested", at: 66 },
  { label: "Transcript uploaded & verified", at: 86 },
  { label: "Application submitted 🎉", at: 108 },
];

export const RoadmapScene: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const doneCount = STEPS.filter((s) => frame >= s.at + 6).length;
  const barP = interpolate(doneCount, [0, STEPS.length], [0.06, 1]);

  const bubblePop = spring({
    frame: frame - 132,
    fps,
    config: { damping: 12, stiffness: 140, mass: 0.9 },
  });

  return (
    <AbsoluteFill style={{ opacity: sceneFade(frame, duration) }}>
      <Backdrop glow="gold" grid glowStrength={0.9} />
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 170 }}>
        <div style={rise(frame, 2)}>
          <Eyebrow>AI roadmap</Eyebrow>
        </div>
        <div style={{ ...rise(frame, 12), marginTop: 40 }}>
          <Display size={100} weight={900}>
            From found…
          </Display>
          <Display size={100} weight={900} style={{ marginTop: 8 }}>
            to <span style={{ color: GOLD }}>funded.</span>
          </Display>
        </div>

        <div style={{ marginTop: 90, width: 880, ...rise(frame, 26, 26, 70) }}>
          <Glass style={{ padding: "54px 54px 44px" }}>
            <div
              style={{
                fontFamily: FONT,
                fontWeight: 800,
                fontSize: 42,
                color: TEXT,
              }}
            >
              Rhodes Scholarship plan
            </div>
            <div
              style={{
                fontFamily: FONT,
                fontWeight: 600,
                fontSize: 28,
                color: MUTED,
                marginTop: 10,
              }}
            >
              Built for you by Edutu · 4 steps
            </div>

            {/* progress bar */}
            <div
              style={{
                marginTop: 34,
                height: 16,
                borderRadius: 999,
                background: "rgba(255,255,255,0.10)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${barP * 100}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: `linear-gradient(90deg, ${BLUE_LIGHT}, ${GOLD})`,
                  transition: "none",
                }}
              />
            </div>

            <div style={{ marginTop: 40 }}>
              {STEPS.map((s, i) => {
                const pop = spring({
                  frame: frame - s.at,
                  fps,
                  config: { damping: 10, stiffness: 210, mass: 0.7 },
                });
                const done = frame >= s.at;
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 28,
                      padding: "24px 0",
                      borderBottom:
                        i < STEPS.length - 1
                          ? "2px solid rgba(255,255,255,0.07)"
                          : "none",
                    }}
                  >
                    <div
                      style={{
                        width: 62,
                        height: 62,
                        borderRadius: 999,
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: done ? GREEN : "rgba(255,255,255,0.08)",
                        border: done
                          ? `3px solid ${GREEN}`
                          : "3px solid rgba(255,255,255,0.18)",
                        transform: `scale(${done ? interpolate(pop, [0, 1], [1.7, 1]) : 1})`,
                        boxShadow: done ? `0 0 34px ${GREEN}66` : "none",
                      }}
                    >
                      {done ? (
                        <svg width={34} height={34} viewBox="0 0 24 24">
                          <path
                            d="M4.5 12.5l5 5 10-11"
                            stroke="#05240F"
                            strokeWidth={3.4}
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : null}
                    </div>
                    <div
                      style={{
                        fontFamily: FONT,
                        fontWeight: done ? 700 : 600,
                        fontSize: 34,
                        color: done ? TEXT : MUTED,
                      }}
                    >
                      {s.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </Glass>

          {/* chat bubble */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: 40,
              opacity: frame >= 132 ? Math.min(1, bubblePop * 1.3) : 0,
              transform: `translateY(${(1 - bubblePop) * 60}px) scale(${interpolate(bubblePop, [0, 1], [0.85, 1])})`,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 20,
                padding: "28px 44px",
                borderRadius: "40px 40px 12px 40px",
                background: `linear-gradient(135deg, #2563EB, #1D4ED8)`,
                boxShadow: "0 26px 60px rgba(37,99,235,0.45)",
                fontFamily: FONT,
                fontWeight: 700,
                fontSize: 36,
                color: TEXT,
              }}
            >
              <span style={{ fontSize: 40 }}>✦</span> Ask Edutu anything.
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

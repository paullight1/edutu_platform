import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Backdrop, Display, Eyebrow, LogoIcon } from "./components";
import {
  AMBER,
  BLUE_LIGHT,
  clamp,
  FONT,
  GOLD,
  MUTED,
  prog,
  RED,
  rise,
  sceneFade,
  TEXT,
} from "./theme";

/* ------------------------------------------------------------------ */
/* Scene 1 — HOOK (120f)                                               */
/* ------------------------------------------------------------------ */
export const HookScene: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const push = interpolate(frame, [0, duration], [1, 1.07]);
  const strike = prog(frame, 74, 20);

  return (
    <AbsoluteFill style={{ opacity: sceneFade(frame, duration) }}>
      <Backdrop glow="blue" glowStrength={0.7} />
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${push})`,
          padding: "0 90px",
        }}
      >
        <div style={{ ...rise(frame, 4), textAlign: "center" }}>
          <div
            style={{
              fontFamily: FONT,
              fontWeight: 600,
              fontSize: 46,
              color: MUTED,
              letterSpacing: 8,
              textTransform: "uppercase",
              marginBottom: 44,
            }}
          >
            Every year
          </div>
        </div>
        <div style={rise(frame, 14)}>
          <Display size={118} weight={900}>
            <span style={{ color: GOLD }}>Millions of dollars</span>
          </Display>
        </div>
        <div style={{ ...rise(frame, 26), marginTop: 10 }}>
          <Display size={118} weight={900}>
            in scholarships
          </Display>
        </div>
        <div style={{ ...rise(frame, 40), marginTop: 34 }}>
          <Display size={118} weight={900}>
            go{" "}
            <span style={{ position: "relative", display: "inline-block" }}>
              unclaimed.
              <span
                style={{
                  position: "absolute",
                  left: "-2%",
                  top: "54%",
                  width: `${strike * 104}%`,
                  height: 12,
                  borderRadius: 8,
                  background: GOLD,
                  boxShadow: `0 0 26px ${GOLD}AA`,
                }}
              />
            </span>
          </Display>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Scene 2 — AGITATE (150f)                                            */
/* ------------------------------------------------------------------ */
const STAMPS = [
  { text: "Scattered info.", color: RED, rot: -3.5, at: 48 },
  { text: "Hidden deadlines.", color: AMBER, rot: 2.8, at: 68 },
  { text: "No guidance.", color: RED, rot: -2.2, at: 88 },
];

export const AgitateScene: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // brief screen shake right after each stamp lands
  const shake = STAMPS.reduce((acc, s) => {
    const t = frame - s.at;
    if (t >= 0 && t < 9) {
      const decay = 1 - t / 9;
      return acc + Math.sin(t * 2.4) * 9 * decay;
    }
    return acc;
  }, 0);

  const finaleP = prog(frame, 112, 22);
  const dimOthers = interpolate(frame, [112, 128], [1, 0.22], clamp);

  return (
    <AbsoluteFill style={{ opacity: sceneFade(frame, duration) }}>
      <Backdrop glow="none" />
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          padding: "0 80px",
          transform: `translate(${shake}px, ${-shake * 0.6}px)`,
        }}
      >
        <div style={{ ...rise(frame, 2), opacity: Math.min(rise(frame, 2).opacity, dimOthers), marginBottom: 90 }}>
          <Display size={84} weight={800}>
            Not because you
            <br />
            weren’t <span style={{ color: BLUE_LIGHT }}>good enough.</span>
          </Display>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 42, opacity: dimOthers }}>
          {STAMPS.map((s, i) => {
            const pop = spring({
              frame: frame - s.at,
              fps,
              config: { damping: 11, stiffness: 190, mass: 0.8 },
            });
            const scale = interpolate(pop, [0, 1], [1.9, 1]);
            return (
              <div
                key={i}
                style={{
                  opacity: frame >= s.at ? 1 : 0,
                  transform: `rotate(${s.rot}deg) scale(${scale})`,
                  alignSelf: i % 2 === 0 ? "flex-start" : "flex-end",
                  padding: "26px 52px",
                  border: `5px solid ${s.color}`,
                  borderRadius: 20,
                  background: `${s.color}16`,
                  fontFamily: FONT,
                  fontWeight: 900,
                  fontSize: 72,
                  letterSpacing: 1,
                  color: s.color,
                  textTransform: "uppercase",
                  boxShadow: `0 0 60px ${s.color}33`,
                }}
              >
                {s.text}
              </div>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 100,
            opacity: finaleP,
            transform: `translateY(${(1 - finaleP) * 40}px)`,
          }}
        >
          <Display size={76} weight={700} color={TEXT}>
            So the opportunity went
            <br />
            <span style={{ color: MUTED }}>to someone else.</span>
          </Display>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Scene 3 — REVEAL (135f)                                             */
/* ------------------------------------------------------------------ */
export const RevealScene: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoPop = spring({
    frame: frame - 8,
    fps,
    config: { damping: 13, stiffness: 120, mass: 1 },
  });
  const glow = prog(frame, 0, 40);
  const ringSpin = frame * 0.9;
  const ringIn = prog(frame, 16, 30);

  return (
    <AbsoluteFill style={{ opacity: sceneFade(frame, duration) }}>
      <Backdrop glow="blue" glowStrength={glow} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        {/* orbiting gold particles */}
        <div
          style={{
            position: "absolute",
            width: 560,
            height: 560,
            opacity: ringIn * 0.95,
            transform: `rotate(${ringSpin}deg) scale(${0.7 + ringIn * 0.3})`,
          }}
        >
          {Array.from({ length: 14 }).map((_, i) => {
            const a = (i / 14) * Math.PI * 2;
            const sz = i % 3 === 0 ? 14 : 8;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: 280 + Math.cos(a) * 272 - sz / 2,
                  top: 280 + Math.sin(a) * 272 - sz / 2,
                  width: sz,
                  height: sz,
                  borderRadius: 999,
                  background: i % 4 === 0 ? GOLD : BLUE_LIGHT,
                  boxShadow: `0 0 18px ${i % 4 === 0 ? GOLD : BLUE_LIGHT}`,
                }}
              />
            );
          })}
        </div>

        <div
          style={{
            transform: `scale(${interpolate(logoPop, [0, 1], [0.3, 1])})`,
            opacity: Math.min(1, logoPop * 1.4),
          }}
        >
          <LogoIcon size={340} />
        </div>

        <div style={{ ...rise(frame, 42, 24), marginTop: 76 }}>
          <Display size={138} weight={900}>
            Meet <span style={{ color: BLUE_LIGHT }}>Edutu</span>
          </Display>
        </div>

        <div style={{ ...rise(frame, 64, 24), marginTop: 52 }}>
          <Eyebrow>✦ Your AI opportunity coach</Eyebrow>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

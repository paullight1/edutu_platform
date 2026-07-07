import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  random,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Backdrop, Display, Eyebrow, Glass, LogoIcon } from "./components";
import {
  AMBER,
  BLUE_LIGHT,
  clamp,
  FONT,
  GOLD,
  GREEN,
  MUTED,
  NAVY,
  prog,
  RED,
  rise,
  sceneFade,
  TEXT,
} from "./theme";

/* ------------------------------------------------------------------ */
/* Scene 6 — DEADLINES + TRACKING (180f)                               */
/* ------------------------------------------------------------------ */
const STAGES = ["Saved", "Applied", "Interview", "Accepted"];
// frame at which the travelling card reaches each stage
const STAGE_AT = [40, 72, 104, 136];

export const TrackingScene: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pulse = 1 + Math.sin(frame / 5.5) * 0.035;
  const stageIdx = STAGE_AT.filter((a) => frame >= a).length - 1;
  const accepted = frame >= STAGE_AT[3] + 4;

  // travelling dot position between stage centers (percent across track)
  const travel = interpolate(
    frame,
    STAGE_AT,
    [0, 33.3, 66.6, 100],
    { ...clamp },
  );

  return (
    <AbsoluteFill style={{ opacity: sceneFade(frame, duration) }}>
      <Backdrop glow="blue" grid glowStrength={0.75} />
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 250 }}>
        <div style={rise(frame, 2)}>
          <Eyebrow color={AMBER}>Deadline radar</Eyebrow>
        </div>
        <div style={{ ...rise(frame, 12), marginTop: 40, padding: "0 70px" }}>
          <Display size={98} weight={900}>
            Never miss a<br />
            deadline <span style={{ color: AMBER }}>again.</span>
          </Display>
        </div>

        {/* urgency pill */}
        <div style={{ ...rise(frame, 26), marginTop: 74 }}>
          <div
            style={{
              transform: `scale(${pulse})`,
              display: "inline-flex",
              alignItems: "center",
              gap: 18,
              padding: "24px 46px",
              borderRadius: 999,
              background: `${RED}1C`,
              border: `3px solid ${RED}`,
              boxShadow: `0 0 ${34 + Math.sin(frame / 5.5) * 14}px ${RED}55`,
              fontFamily: FONT,
              fontWeight: 800,
              fontSize: 40,
              color: "#FCA5A5",
            }}
          >
            ⏰ Chevening closes in 3 days
          </div>
        </div>

        {/* pipeline */}
        <div style={{ marginTop: 90, width: 900, ...rise(frame, 34, 26, 60) }}>
          <Glass style={{ padding: "56px 60px 64px" }}>
            <div
              style={{
                fontFamily: FONT,
                fontWeight: 800,
                fontSize: 40,
                color: TEXT,
                marginBottom: 6,
              }}
            >
              Your applications, tracked
            </div>
            <div
              style={{
                fontFamily: FONT,
                fontWeight: 600,
                fontSize: 27,
                color: MUTED,
                marginBottom: 60,
              }}
            >
              Every stage. One dashboard.
            </div>

            {/* track */}
            <div style={{ position: "relative", height: 10, margin: "0 60px" }}>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.12)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: `${travel}%`,
                  borderRadius: 999,
                  background: `linear-gradient(90deg, ${BLUE_LIGHT}, ${accepted ? GREEN : BLUE_LIGHT})`,
                }}
              />
              {/* travelling card marker */}
              <div
                style={{
                  position: "absolute",
                  left: `${travel}%`,
                  top: "50%",
                  transform: "translate(-50%, -50%)",
                  width: 74,
                  height: 74,
                  borderRadius: 22,
                  background: accepted
                    ? GREEN
                    : `linear-gradient(135deg, #2563EB, #1D4ED8)`,
                  boxShadow: accepted
                    ? `0 0 46px ${GREEN}99`
                    : "0 14px 34px rgba(37,99,235,0.55)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 34,
                }}
              >
                {accepted ? "🎓" : "📄"}
              </div>
            </div>

            {/* stage labels */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 54,
                padding: "0 8px",
              }}
            >
              {STAGES.map((s, i) => {
                const active = i <= stageIdx;
                const isAccept = i === 3 && accepted;
                const pop = spring({
                  frame: frame - STAGE_AT[i],
                  fps,
                  config: { damping: 11, stiffness: 200, mass: 0.7 },
                });
                return (
                  <div
                    key={s}
                    style={{
                      fontFamily: FONT,
                      fontWeight: active ? 800 : 600,
                      fontSize: 34,
                      color: isAccept ? GREEN : active ? TEXT : MUTED,
                      transform: `scale(${active ? interpolate(pop, [0, 1], [1.35, 1]) : 1})`,
                    }}
                  >
                    {s}
                  </div>
                );
              })}
            </div>
          </Glass>
        </div>

        {/* confetti on accept */}
        {accepted ? <Confetti startFrame={STAGE_AT[3] + 4} /> : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Confetti: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const t = frame - startFrame;
  const colors = [GOLD, GREEN, BLUE_LIGHT, "#F472B6", TEXT];
  // burst outward + up from the "Accepted" end of the pipeline, then fall
  const originX = 870;
  const originY = 1090;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {Array.from({ length: 30 }).map((_, i) => {
        const seedA = random(`ca-${i}`);
        const seedV = random(`cv-${i}`);
        const seedR = random(`cr-${i}`);
        const angle = Math.PI * 1.5 + (seedA - 0.5) * 2.4; // upward fan (screen y is down)
        const speed = 9 + seedV * 13;
        const x = originX + Math.cos(angle) * speed * t;
        const y = originY + Math.sin(angle) * speed * t + 0.5 * t * t;
        const rot = t * (seedR - 0.5) * 30;
        const op = interpolate(t, [0, 4, 26, 40], [0, 1, 1, 0], clamp);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: 7 + seedR * 10,
              height: 12 + seedA * 10,
              borderRadius: 3,
              background: colors[i % colors.length],
              transform: `rotate(${rot}deg)`,
              opacity: op,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Scene 7 — PROOF (165f)                                              */
/* ------------------------------------------------------------------ */
const CRESTS = ["harvard", "oxford", "mit", "stanford", "unilag"];

export const ProofScene: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const count = Math.round(interpolate(frame, [14, 52], [0, 31], clamp));
  const orbit = frame * 0.55;
  const orbitIn = prog(frame, 10, 34);

  return (
    <AbsoluteFill style={{ opacity: sceneFade(frame, duration) }}>
      <Backdrop glow="blue" glowStrength={0.9} />
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 170 }}>
        <div style={{ ...rise(frame, 2), padding: "0 70px" }}>
          <Display size={92} weight={900}>
            Opportunities from
            <br />
            <span style={{ color: GOLD, fontSize: 130 }}>{count}+ countries</span>
          </Display>
        </div>

        {/* logo hub + orbiting university chips */}
        <div
          style={{
            position: "relative",
            width: 760,
            height: 760,
            marginTop: 40,
            opacity: orbitIn,
            transform: `scale(${0.85 + orbitIn * 0.15})`,
          }}
        >
          {/* orbit guide rings */}
          {[330, 240].map((r) => (
            <div
              key={r}
              style={{
                position: "absolute",
                left: 380 - r,
                top: 380 - r,
                width: r * 2,
                height: r * 2,
                borderRadius: 999,
                border: "2px dashed rgba(148,178,255,0.18)",
              }}
            />
          ))}
          <div
            style={{
              position: "absolute",
              left: 380 - 130,
              top: 380 - 130,
            }}
          >
            <LogoIcon size={260} />
          </div>
          {CRESTS.map((c, i) => {
            const a = (i / CRESTS.length) * Math.PI * 2 + (orbit * Math.PI) / 180;
            const x = 380 + Math.cos(a) * 330;
            const y = 380 + Math.sin(a) * 300;
            return (
              <div
                key={c}
                style={{
                  position: "absolute",
                  left: x - 62,
                  top: y - 62,
                  width: 124,
                  height: 124,
                  borderRadius: 999,
                  background: "#FFFFFF",
                  border: "3px solid rgba(255,255,255,0.6)",
                  boxShadow: "0 18px 44px rgba(2,6,17,0.6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                <Img
                  src={staticFile(`assets/${c}.png`)}
                  style={{ width: "76%", height: "76%", objectFit: "contain" }}
                />
              </div>
            );
          })}
        </div>

        {/* testimonial */}
        <div style={{ width: 880, marginTop: 30, ...rise(frame, 66, 28, 80) }}>
          <Glass style={{ padding: "48px 56px" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} style={{ color: GOLD, fontSize: 40 }}>
                  ★
                </span>
              ))}
            </div>
            <div
              style={{
                fontFamily: FONT,
                fontWeight: 700,
                fontSize: 42,
                lineHeight: 1.3,
                color: TEXT,
              }}
            >
              “Edutu helped me land{" "}
              <span style={{ color: GOLD }}>3 scholarship offers</span> in 2
              months.”
            </div>
            <div
              style={{
                fontFamily: FONT,
                fontWeight: 600,
                fontSize: 30,
                color: MUTED,
                marginTop: 20,
              }}
            >
              — Adaeze O. · Lagos, Nigeria
            </div>
          </Glass>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Scene 8 — CTA (150f)                                                */
/* ------------------------------------------------------------------ */
export const CtaScene: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoPop = spring({
    frame: frame - 4,
    fps,
    config: { damping: 13, stiffness: 130, mass: 0.9 },
  });
  const breathe = 1 + Math.sin(frame / 9) * 0.022;

  return (
    <AbsoluteFill style={{ opacity: sceneFade(frame, duration, 12, 20) }}>
      <Backdrop glow="gold" glowStrength={1} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            transform: `scale(${interpolate(logoPop, [0, 1], [0.4, 1])})`,
            opacity: Math.min(1, logoPop * 1.4),
            display: "flex",
            alignItems: "center",
            gap: 40,
          }}
        >
          <LogoIcon size={190} />
          <div
            style={{
              fontFamily: FONT,
              fontWeight: 900,
              fontSize: 120,
              color: TEXT,
              letterSpacing: -3,
            }}
          >
            Edutu
          </div>
        </div>

        <div style={{ ...rise(frame, 22), marginTop: 90, padding: "0 80px" }}>
          <Display size={104} weight={900}>
            Your future
            <br />
            <span style={{ color: GOLD }}>won’t wait.</span>
          </Display>
        </div>

        <div style={{ ...rise(frame, 44), marginTop: 90 }}>
          <div
            style={{
              transform: `scale(${breathe})`,
              padding: "36px 92px",
              borderRadius: 999,
              background: `linear-gradient(135deg, ${GOLD}, #E09A28)`,
              boxShadow: `0 30px 80px rgba(246,182,74,0.45), 0 0 60px rgba(246,182,74,0.35)`,
              fontFamily: FONT,
              fontWeight: 900,
              fontSize: 52,
              color: NAVY,
              letterSpacing: -0.5,
            }}
          >
            Get started free
          </div>
        </div>

        <div style={{ ...rise(frame, 58), marginTop: 60 }}>
          <div
            style={{
              fontFamily: FONT,
              fontWeight: 800,
              fontSize: 52,
              color: BLUE_LIGHT,
              letterSpacing: 1,
            }}
          >
            edutu.org
          </div>
        </div>

        <div style={{ ...rise(frame, 70), marginTop: 40 }}>
          <div
            style={{
              fontFamily: FONT,
              fontWeight: 600,
              fontSize: 30,
              color: MUTED,
            }}
          >
            Free to start · No card required
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

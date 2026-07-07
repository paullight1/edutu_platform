import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { BORDER, FONT, GOLD, NAVY, NAVY2, TEXT } from "./theme";

type Style = React.CSSProperties;

/** Base backdrop: navy gradient + brand glows + vignette + faint dot grid. */
export const Backdrop: React.FC<{
  glow?: "blue" | "gold" | "none";
  glowStrength?: number;
  grid?: boolean;
}> = ({ glow = "blue", glowStrength = 1, grid = false }) => (
  <AbsoluteFill>
    <AbsoluteFill
      style={{
        background: `linear-gradient(175deg, ${NAVY2} 0%, ${NAVY} 55%, #030610 100%)`,
      }}
    />
    {grid ? (
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(rgba(148,178,255,0.13) 2px, transparent 2px)`,
          backgroundSize: "56px 56px",
          backgroundPosition: "28px 28px",
        }}
      />
    ) : null}
    {glow !== "none" ? (
      <AbsoluteFill
        style={{
          opacity: glowStrength,
          background:
            glow === "blue"
              ? `radial-gradient(52% 34% at 50% 26%, rgba(37,99,235,0.32) 0%, rgba(37,99,235,0) 70%),
                 radial-gradient(60% 40% at 50% 96%, rgba(37,99,235,0.16) 0%, rgba(37,99,235,0) 70%)`
              : `radial-gradient(52% 34% at 50% 30%, rgba(246,182,74,0.20) 0%, rgba(246,182,74,0) 70%),
                 radial-gradient(60% 40% at 50% 96%, rgba(37,99,235,0.14) 0%, rgba(37,99,235,0) 70%)`,
        }}
      />
    ) : null}
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(78% 62% at 50% 46%, rgba(0,0,0,0) 58%, rgba(2,5,12,0.55) 100%)",
      }}
    />
  </AbsoluteFill>
);

/** Rounded Edutu app icon. */
export const LogoIcon: React.FC<{ size: number; style?: Style }> = ({
  size,
  style,
}) => (
  <Img
    src={staticFile("assets/edutu-icon.jpg")}
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.24,
      boxShadow:
        "0 30px 80px rgba(37,99,235,0.45), 0 6px 24px rgba(0,0,0,0.6)",
      ...style,
    }}
  />
);

/** Small uppercase eyebrow pill. */
export const Eyebrow: React.FC<{
  children: React.ReactNode;
  color?: string;
  style?: Style;
}> = ({ children, color = GOLD, style }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 14,
      padding: "16px 34px",
      borderRadius: 999,
      border: `2px solid ${color}55`,
      background: `${color}14`,
      color,
      fontFamily: FONT,
      fontWeight: 700,
      fontSize: 30,
      letterSpacing: 6,
      textTransform: "uppercase",
      ...style,
    }}
  >
    {children}
  </div>
);

/** Big display headline. */
export const Display: React.FC<{
  children: React.ReactNode;
  size?: number;
  weight?: number;
  color?: string;
  style?: Style;
}> = ({ children, size = 92, weight = 800, color = TEXT, style }) => (
  <div
    style={{
      fontFamily: FONT,
      fontWeight: weight,
      fontSize: size,
      lineHeight: 1.08,
      letterSpacing: -1.5,
      color,
      textAlign: "center",
      ...style,
    }}
  >
    {children}
  </div>
);

/** Glassy UI card. */
export const Glass: React.FC<{
  children: React.ReactNode;
  style?: Style;
}> = ({ children, style }) => (
  <div
    style={{
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.045) 100%)",
      border: `2px solid ${BORDER}`,
      borderRadius: 36,
      boxShadow: "0 32px 70px rgba(2,6,17,0.55)",
      ...style,
    }}
  >
    {children}
  </div>
);

/** Simple phone frame that letterboxes app-UI content. */
export const Phone: React.FC<{
  children: React.ReactNode;
  width?: number;
  style?: Style;
}> = ({ children, width = 660, style }) => {
  const height = width * 2.05;
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 72,
        padding: 18,
        background: "linear-gradient(180deg, #232c44 0%, #10162a 100%)",
        boxShadow:
          `0 60px 130px rgba(2,6,17,0.75), 0 0 0 2px rgba(255,255,255,0.10), 0 0 90px rgba(37,99,235,0.28)`,
        position: "relative",
        ...style,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 56,
          overflow: "hidden",
          background: `linear-gradient(180deg, #0E1526 0%, ${NAVY2} 100%)`,
          position: "relative",
        }}
      >
        {children}
      </div>
      <div
        style={{
          position: "absolute",
          top: 34,
          left: "50%",
          transform: "translateX(-50%)",
          width: width * 0.3,
          height: 30,
          borderRadius: 999,
          background: "#05080f",
        }}
      />
    </div>
  );
};

/** SVG progress ring with animated percentage. */
export const MatchRing: React.FC<{
  value: number; // 0..target
  target: number;
  size?: number;
}> = ({ value, target, size = 118 }) => {
  const stroke = 9;
  const r = (size - stroke * 2) / 2;
  const c = 2 * Math.PI * r;
  const shown = Math.round(value);
  const frac = Math.min(value / 100, 1);
  const color = target >= 93 ? GOLD : "#60A5FA";
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: size * 0.27,
          color: TEXT,
          letterSpacing: -1,
        }}
      >
        {shown}%
      </div>
    </div>
  );
};

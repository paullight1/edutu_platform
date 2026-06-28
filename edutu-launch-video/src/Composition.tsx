import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  Award,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronRight,
  FileText,
  Globe2,
  GraduationCap,
  MessageCircle,
  Mic,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const BLUE = "#2563EB";
const BLUE_BRIGHT = "#38BDF8";
const BLUE_DEEP = "#0B1D78";
const NAVY = "#020617";
const CARD = "rgba(255,255,255,0.075)";
const BORDER = "rgba(255,255,255,0.16)";
const TEXT = "#F8FAFC";
const MUTED = "#A9C3F8";
const GOLD = "#F6B64A";
const GREEN = "#22C55E";

const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
const EASE_IN = Easing.bezier(0.7, 0, 0.84, 0);
const EASE_SOFT = Easing.bezier(0.45, 0, 0.55, 1);

const scenes = {
  intro: [0, 92],
  burst: [72, 190],
  home: [170, 315],
  match: [290, 430],
  ai: [410, 555],
  roadmap: [535, 680],
  cv: [660, 800],
  final: [780, 900],
} as const;

type Style = React.CSSProperties;
type SceneKey = keyof typeof scenes;

const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

const seconds = (value: number, fps: number) => Math.round(value * fps);

const sceneOpacity = (frame: number, start: number, end: number) => {
  const enter = interpolate(frame, [start, start + 18], [0, 1], {
    ...clamp,
    easing: EASE_OUT,
  });
  const exit = interpolate(frame, [end - 18, end], [1, 0], {
    ...clamp,
    easing: EASE_IN,
  });
  return Math.min(enter, exit);
};

const local = (frame: number, scene: SceneKey) => frame - scenes[scene][0];

const progress = (
  frame: number,
  start: number,
  end: number,
  easing: (value: number) => number = EASE_OUT,
) =>
  interpolate(frame, [start, end], [0, 1], {
    ...clamp,
    easing,
  });

const move = (
  frame: number,
  start: number,
  end: number,
  from: number,
  to: number,
  easing: (value: number) => number = EASE_OUT,
) =>
  interpolate(frame, [start, end], [from, to], {
    ...clamp,
    easing,
  });

const pop = (frame: number, start: number, strength = 0.13) => {
  const up = move(frame, start, start + 9, 1 - strength, 1 + strength, EASE_OUT);
  const down = move(frame, start + 9, start + 20, 1 + strength, 1, EASE_SOFT);
  return frame < start + 9 ? up : down;
};

const baseFont: Style = {
  fontFamily:
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
};

const asset = (name: string) => staticFile(`assets/${name}`);

const iconStyle = (size: number, color = TEXT): Style => ({
  width: size,
  height: size,
  color,
  strokeWidth: 2.4,
});

function BlueBackdrop() {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 42);
  const sweep = move(frame % 180, 0, 180, -220, 220, EASE_SOFT);

  return (
    <AbsoluteFill
      style={{
        background:
          `radial-gradient(circle at 26% 18%, rgba(56,189,248,0.36), transparent 28%), radial-gradient(circle at 78% 7%, rgba(37,99,235,0.42), transparent 31%), linear-gradient(180deg, #020617 0%, ${BLUE_DEEP} 48%, #020617 100%)`,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.055) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          transform: `translateY(${move(frame % 120, 0, 120, -64, 0, EASE_SOFT)}px)`,
          opacity: 0.34,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 760,
          height: 760,
          borderRadius: "50%",
          left: -240 + drift * 36,
          top: 260,
          background: "radial-gradient(circle, rgba(56,189,248,0.26), transparent 66%)",
          filter: "blur(18px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 820,
          height: 820,
          borderRadius: "50%",
          right: -330 - drift * 24,
          bottom: 170,
          background: "radial-gradient(circle, rgba(37,99,235,0.34), transparent 64%)",
          filter: "blur(16px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 128,
          height: 2500,
          left: 480 + sweep,
          top: -300,
          transform: "rotate(24deg)",
          background:
            "linear-gradient(180deg, transparent, rgba(56,189,248,0.16), rgba(255,255,255,0.13), transparent)",
          filter: "blur(12px)",
          opacity: 0.85,
        }}
      />
    </AbsoluteFill>
  );
}

function LogoMark({
  size,
  style,
  glow = true,
}: {
  size: number;
  style?: Style;
  glow?: boolean;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        overflow: "hidden",
        boxShadow: glow
          ? `0 ${size * 0.09}px ${size * 0.25}px rgba(37,99,235,0.45), 0 0 ${size * 0.32}px rgba(56,189,248,0.36)`
          : undefined,
        border: "1px solid rgba(255,255,255,0.18)",
        background: "rgba(255,255,255,0.06)",
        ...style,
      }}
    >
      <Img
        src={asset("edutu-icon.jpg")}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </div>
  );
}

function Kicker({ children, style }: { children: React.ReactNode; style?: Style }) {
  return (
    <div
      style={{
        ...baseFont,
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        alignSelf: "flex-start",
        color: BLUE_BRIGHT,
        border: "1px solid rgba(56,189,248,0.35)",
        background: "rgba(14,165,233,0.11)",
        borderRadius: 999,
        padding: "12px 20px",
        fontSize: 25,
        fontWeight: 800,
        letterSpacing: 0,
        textTransform: "uppercase",
        ...style,
      }}
    >
      <Sparkles style={iconStyle(25, BLUE_BRIGHT)} />
      {children}
    </div>
  );
}

function BigTitle({
  children,
  size = 92,
  style,
}: {
  children: React.ReactNode;
  size?: number;
  style?: Style;
}) {
  return (
    <div
      style={{
        ...baseFont,
        color: TEXT,
        fontSize: size,
        lineHeight: 1,
        fontWeight: 950,
        letterSpacing: 0,
        textWrap: "balance",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function BodyCopy({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: Style;
}) {
  return (
    <div
      style={{
        ...baseFont,
        color: MUTED,
        fontSize: 34,
        lineHeight: 1.22,
        fontWeight: 650,
        letterSpacing: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function PhoneFrame({
  children,
  style,
  innerStyle,
}: {
  children: React.ReactNode;
  style?: Style;
  innerStyle?: Style;
}) {
  return (
    <div
      style={{
        width: 520,
        height: 1060,
        borderRadius: 72,
        padding: 18,
        background:
          "linear-gradient(160deg, rgba(255,255,255,0.28), rgba(255,255,255,0.06) 34%, rgba(56,189,248,0.22))",
        boxShadow: "0 40px 120px rgba(0,0,0,0.44), 0 0 90px rgba(37,99,235,0.38)",
        border: "1px solid rgba(255,255,255,0.22)",
        ...style,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          borderRadius: 56,
          background:
            "radial-gradient(circle at 30% 0%, rgba(56,189,248,0.23), transparent 36%), linear-gradient(180deg, #06124A, #020617 66%)",
          border: "1px solid rgba(255,255,255,0.12)",
          ...innerStyle,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 17,
            left: "50%",
            transform: "translateX(-50%)",
            width: 148,
            height: 31,
            borderRadius: 30,
            background: "rgba(1,7,28,0.75)",
            zIndex: 4,
          }}
        />
        {children}
      </div>
    </div>
  );
}

function MiniHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ padding: "74px 32px 20px", display: "flex", gap: 16, alignItems: "center" }}>
      <LogoMark size={58} glow={false} />
      <div style={{ ...baseFont }}>
        <div style={{ color: TEXT, fontSize: 28, fontWeight: 900 }}>{title}</div>
        {subtitle ? (
          <div style={{ color: MUTED, fontSize: 18, fontWeight: 650, marginTop: 3 }}>{subtitle}</div>
        ) : null}
      </div>
    </div>
  );
}

function GlassCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: Style;
}) {
  return (
    <div
      style={{
        borderRadius: 28,
        background: CARD,
        border: `1px solid ${BORDER}`,
        boxShadow: "0 24px 70px rgba(0,0,0,0.22)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function StatTile({
  title,
  value,
  icon: Icon,
  gradient,
}: {
  title: string;
  value: string;
  icon: LucideIcon;
  gradient: string;
}) {
  return (
    <div
      style={{
        position: "relative",
        height: 145,
        borderRadius: 28,
        padding: 22,
        overflow: "hidden",
        background: gradient,
      }}
    >
      <Icon
        style={{
          position: "absolute",
          right: -10,
          top: -6,
          width: 96,
          height: 96,
          color: "rgba(255,255,255,0.18)",
          strokeWidth: 1.3,
        }}
      />
      <div style={{ ...baseFont, color: "rgba(255,255,255,0.72)", fontSize: 16, fontWeight: 850 }}>
        {title}
      </div>
      <div style={{ ...baseFont, color: TEXT, fontSize: 46, fontWeight: 950, marginTop: 18 }}>
        {value}
      </div>
    </div>
  );
}

function OpportunityCard({
  title,
  org,
  match,
  deadline,
  accent = BLUE_BRIGHT,
  compact = false,
}: {
  title: string;
  org: string;
  match?: string;
  deadline: string;
  accent?: string;
  compact?: boolean;
}) {
  return (
    <GlassCard
      style={{
        padding: compact ? 18 : 24,
        minHeight: compact ? 132 : 178,
        borderRadius: compact ? 24 : 30,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div
          style={{
            ...baseFont,
            color: accent,
            background: `${accent}1f`,
            borderRadius: 999,
            padding: compact ? "7px 11px" : "9px 14px",
            fontSize: compact ? 14 : 17,
            fontWeight: 900,
          }}
        >
          {org}
        </div>
        {match ? (
          <div
            style={{
              ...baseFont,
              color: "#FFFFFF",
              background: "rgba(56,189,248,0.2)",
              border: "1px solid rgba(56,189,248,0.35)",
              borderRadius: 999,
              padding: compact ? "7px 10px" : "9px 13px",
              fontSize: compact ? 14 : 17,
              fontWeight: 900,
            }}
          >
            {match}
          </div>
        ) : null}
      </div>
      <div
        style={{
          ...baseFont,
          color: TEXT,
          fontSize: compact ? 22 : 30,
          lineHeight: 1.08,
          fontWeight: 900,
          marginTop: compact ? 16 : 24,
        }}
      >
        {title}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: compact ? 16 : 22,
        }}
      >
        <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: deadline.includes("Today") || deadline.includes("3d") ? GOLD : GREEN,
            }}
          />
          <span style={{ ...baseFont, color: MUTED, fontSize: compact ? 15 : 18, fontWeight: 750 }}>
            {deadline}
          </span>
        </div>
        <ChevronRight style={iconStyle(compact ? 18 : 22, TEXT)} />
      </div>
    </GlassCard>
  );
}

function FeaturePill({
  label,
  icon: Icon,
  color = BLUE_BRIGHT,
  style,
}: {
  label: string;
  icon: LucideIcon;
  color?: string;
  style?: Style;
}) {
  return (
    <div
      style={{
        ...baseFont,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "16px 19px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.17)",
        color: TEXT,
        fontSize: 23,
        fontWeight: 850,
        boxShadow: "0 18px 50px rgba(0,0,0,0.18)",
        ...style,
      }}
    >
      <Icon style={iconStyle(26, color)} />
      {label}
    </div>
  );
}

function IntroScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [start, end] = scenes.intro;
  const opacity = sceneOpacity(frame, start, end);
  const lf = local(frame, "intro");
  const logoScale = pop(lf, 4, 0.16);
  const titleY = move(lf, seconds(0.35, fps), seconds(1.0, fps), 70, 0);
  const titleOpacity = progress(lf, seconds(0.28, fps), seconds(0.78, fps));
  const ring = move(lf % 78, 0, 78, 0.92, 1.24, EASE_SOFT);

  return (
    <AbsoluteFill
      style={{
        opacity,
        padding: 78,
        justifyContent: "center",
        alignItems: "center",
        transform: `scale(${move(frame, end - 20, end, 1, 1.05, EASE_IN)})`,
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 620,
          height: 620,
          borderRadius: "50%",
          border: "2px solid rgba(56,189,248,0.22)",
          transform: `scale(${ring})`,
          opacity: move(lf % 78, 0, 78, 0.84, 0, EASE_SOFT),
        }}
      />
      <LogoMark
        size={250}
        style={{ transform: `scale(${logoScale}) rotate(${move(lf, 0, 36, -5, 0)}deg)` }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginTop: 70,
          transform: `translateY(${titleY}px)`,
          opacity: titleOpacity,
        }}
      >
        <Kicker>Launching now</Kicker>
        <BigTitle size={118} style={{ textAlign: "center", marginTop: 34 }}>
          Find real
          <br />
          opportunities
        </BigTitle>
        <BodyCopy style={{ marginTop: 28, textAlign: "center", maxWidth: 820 }}>
          Scholarships, schools, grants, jobs, and guidance in one focused app.
        </BodyCopy>
      </div>
    </AbsoluteFill>
  );
}

function OpportunityBurstScene() {
  const frame = useCurrentFrame();
  const [start, end] = scenes.burst;
  const opacity = sceneOpacity(frame, start, end);
  const lf = local(frame, "burst");
  const title = progress(lf, 4, 28);
  const imageScale = move(lf, 0, 78, 1.16, 1.02, EASE_SOFT);
  const cards = [
    { label: "Scholarships", icon: Award, x: 58, y: 1110, color: "#60A5FA" },
    { label: "Schools", icon: GraduationCap, x: 70, y: 1265, color: "#38BDF8" },
    { label: "Grants", icon: Sparkles, x: 518, y: 1120, color: GOLD },
    { label: "Jobs", icon: BriefcaseBusiness, x: 610, y: 1278, color: GREEN },
  ];

  return (
    <AbsoluteFill style={{ opacity, padding: 70 }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.38,
          transform: `scale(${imageScale}) translateY(${move(lf, 0, 110, -40, 10)}px)`,
        }}
      >
        <Img
          src={asset("globe.png")}
          style={{
            position: "absolute",
            width: 800,
            height: 800,
            objectFit: "contain",
            left: 145,
            top: 190,
            filter: "drop-shadow(0 40px 80px rgba(56,189,248,0.3))",
          }}
        />
      </div>
      <Kicker style={{ opacity: title, transform: `translateY(${move(title, 0, 1, 36, 0)}px)` }}>
        Built for ambition
      </Kicker>
      <BigTitle
        size={92}
        style={{
          marginTop: 36,
          opacity: title,
          transform: `translateY(${move(title, 0, 1, 42, 0)}px)`,
        }}
      >
        Everything worth
        <br />
        applying for.
      </BigTitle>
      <BodyCopy style={{ marginTop: 28, maxWidth: 820, opacity: title }}>
        A clean feed for students and young professionals who need signal, not noise.
      </BodyCopy>
      {cards.map((item, index) => {
        const p = progress(lf, 24 + index * 9, 50 + index * 9);
        return (
          <FeaturePill
            key={item.label}
            label={item.label}
            icon={item.icon}
            color={item.color}
            style={{
              position: "absolute",
              left: item.x,
              top: item.y,
              opacity: p,
              transform: `translateY(${move(p, 0, 1, 55, 0)}px) scale(${move(p, 0, 1, 0.86, 1)})`,
            }}
          />
        );
      })}
      <div
        style={{
          position: "absolute",
          left: 80,
          right: 80,
          bottom: 126,
          height: 92,
          borderRadius: 999,
          border: "1px solid rgba(56,189,248,0.28)",
          background: "rgba(2,6,23,0.58)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: TEXT,
          ...baseFont,
          fontSize: 34,
          fontWeight: 900,
          opacity: progress(lf, 66, 90),
        }}
      >
        Start here. Move faster.
      </div>
    </AbsoluteFill>
  );
}

function HomeScreenMock() {
  return (
    <PhoneFrame>
      <MiniHeader title="Edutu" subtitle="Your launchpad" />
      <div style={{ padding: "8px 26px 0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <StatTile
          title="ACTIVE GOALS"
          value="12"
          icon={Target}
          gradient="linear-gradient(135deg, #1D4ED8, #38BDF8)"
        />
        <StatTile
          title="MATCHES"
          value="87"
          icon={Sparkles}
          gradient="linear-gradient(135deg, #2563EB, #0EA5E9)"
        />
        <StatTile
          title="APPLIED"
          value="8"
          icon={Check}
          gradient="linear-gradient(135deg, #0284C7, #22C55E)"
        />
        <StatTile
          title="DEADLINE"
          value="3d"
          icon={CalendarDays}
          gradient="linear-gradient(135deg, #1E40AF, #F6B64A)"
        />
      </div>
      <div style={{ padding: "32px 26px 0" }}>
        <div style={{ ...baseFont, color: TEXT, fontSize: 28, fontWeight: 900, marginBottom: 18 }}>
          Featured Opportunities
        </div>
        <OpportunityCard
          compact
          title="Global Youth Leadership Scholarship"
          org="Scholarship"
          match="94%"
          deadline="3d left"
        />
        <div style={{ height: 18 }} />
        <OpportunityCard
          compact
          title="Remote Product Internship"
          org="Career"
          match="88%"
          deadline="Rolling"
          accent="#22C55E"
        />
      </div>
    </PhoneFrame>
  );
}

function HomeScene() {
  const frame = useCurrentFrame();
  const [start, end] = scenes.home;
  const opacity = sceneOpacity(frame, start, end);
  const lf = local(frame, "home");
  const phoneEnter = progress(lf, 6, 38);
  const copyEnter = progress(lf, 18, 48);

  return (
    <AbsoluteFill style={{ opacity, padding: 70 }}>
      <div
        style={{
          position: "absolute",
          left: 64,
          top: 160,
          width: 375,
          opacity: copyEnter,
          transform: `translateX(${move(copyEnter, 0, 1, -70, 0)}px)`,
        }}
      >
        <Kicker>Personal feed</Kicker>
        <BigTitle size={82} style={{ marginTop: 34 }}>
          Your next step,
          <br />
          ranked.
        </BigTitle>
        <BodyCopy style={{ marginTop: 28 }}>
          Matched opportunities, active goals, tracked applications, and the deadline that matters next.
        </BodyCopy>
      </div>
      <div
        style={{
          position: "absolute",
          right: 74,
          top: 400,
          transform: `translateX(${move(phoneEnter, 0, 1, 140, 0)}px) rotate(${move(phoneEnter, 0, 1, 8, 0)}deg)`,
          opacity: phoneEnter,
        }}
      >
        <HomeScreenMock />
      </div>
      <FeaturePill
        label="1000+ opportunities"
        icon={Globe2}
        style={{
          position: "absolute",
          left: 82,
          bottom: 430,
          opacity: progress(lf, 64, 92),
        }}
      />
      <FeaturePill
        label="Deadline-first tracking"
        icon={CalendarDays}
        color={GOLD}
        style={{
          position: "absolute",
          left: 168,
          bottom: 300,
          opacity: progress(lf, 78, 106),
        }}
      />
    </AbsoluteFill>
  );
}

function LogoStrip() {
  const logos = ["harvard.png", "mit.png", "oxford.png", "stanford.png", "unilag.png"];
  return (
    <div
      style={{
        display: "flex",
        gap: 18,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {logos.map((logo) => (
        <div
          key={logo}
          style={{
            width: 116,
            height: 116,
            borderRadius: 999,
            background: "rgba(255,255,255,0.94)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 18px 45px rgba(0,0,0,0.18)",
            overflow: "hidden",
          }}
        >
          <Img src={asset(logo)} style={{ width: 82, height: 82, objectFit: "contain" }} />
        </div>
      ))}
    </div>
  );
}

function MatchingEnginePanel({ frame }: { frame: number }) {
  const pulse = 0.78 + Math.sin(frame / 12) * 0.08;
  const nodes = [
    { x: 58, y: 82, label: "Profile" },
    { x: 314, y: 72, label: "Goals" },
    { x: 92, y: 286, label: "Skills" },
    { x: 298, y: 302, label: "Deadlines" },
  ];

  return (
    <GlassCard
      style={{
        width: 470,
        height: 470,
        position: "relative",
        overflow: "hidden",
        background:
          "radial-gradient(circle at 50% 50%, rgba(56,189,248,0.28), transparent 32%), linear-gradient(150deg, rgba(37,99,235,0.44), rgba(2,6,23,0.72))",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 44,
          borderRadius: "50%",
          border: "1px solid rgba(56,189,248,0.22)",
          transform: `scale(${pulse})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: 142,
          height: 142,
          borderRadius: 42,
          background: "linear-gradient(135deg, #2563EB, #38BDF8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 0 70px rgba(56,189,248,0.58)",
          zIndex: 3,
        }}
      >
        <Sparkles style={iconStyle(58, TEXT)} />
      </div>
      {nodes.map((node, index) => (
        <React.Fragment key={node.label}>
          <div
            style={{
              position: "absolute",
              left: node.x + 45,
              top: node.y + 28,
              width: 135,
              height: 2,
              background:
                "linear-gradient(90deg, rgba(56,189,248,0.12), rgba(56,189,248,0.82), rgba(56,189,248,0.12))",
              transform: `rotate(${index % 2 === 0 ? 28 : -30}deg)`,
              transformOrigin: "left center",
              opacity: 0.55,
            }}
          />
          <div
            style={{
              ...baseFont,
              position: "absolute",
              left: node.x,
              top: node.y,
              minWidth: 116,
              borderRadius: 999,
              padding: "12px 16px",
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.18)",
              color: TEXT,
              fontSize: 17,
              fontWeight: 900,
              textAlign: "center",
            }}
          >
            {node.label}
          </div>
        </React.Fragment>
      ))}
      <div
        style={{
          ...baseFont,
          position: "absolute",
          left: 40,
          right: 40,
          bottom: 34,
          color: BLUE_BRIGHT,
          textAlign: "center",
          fontSize: 22,
          fontWeight: 950,
          textTransform: "uppercase",
        }}
      >
        AI matching engine
      </div>
    </GlassCard>
  );
}

function MatchScene() {
  const frame = useCurrentFrame();
  const [start, end] = scenes.match;
  const opacity = sceneOpacity(frame, start, end);
  const lf = local(frame, "match");
  const card1 = progress(lf, 25, 50);
  const card2 = progress(lf, 45, 72);
  const card3 = progress(lf, 65, 94);

  return (
    <AbsoluteFill style={{ opacity, padding: 70 }}>
      <div
        style={{
          position: "absolute",
          left: 100,
          top: 150,
          right: 90,
          opacity: progress(lf, 4, 30),
        }}
      >
        <Kicker>AI-powered matching</Kicker>
        <BigTitle size={88} style={{ marginTop: 34 }}>
          Opportunities that
          <br />
          fit your profile.
        </BigTitle>
      </div>
      <div
        style={{
          position: "absolute",
          right: 44,
          top: 430,
          opacity: 0.78,
          transform: `scale(${move(lf, 0, 100, 1.08, 1.0, EASE_SOFT)})`,
        }}
      >
        <MatchingEnginePanel frame={lf} />
      </div>
      <div style={{ position: "absolute", left: 70, right: 70, bottom: 156, opacity: progress(lf, 76, 108) }}>
        <LogoStrip />
      </div>
      <div
        style={{
          position: "absolute",
          left: 80,
          top: 625,
          width: 590,
          opacity: card1,
          transform: `translateX(${move(card1, 0, 1, -80, 0)}px)`,
        }}
      >
        <OpportunityCard
          title="Full tuition scholarship"
          org="For you"
          match="96% match"
          deadline="Closes Today"
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: 160,
          top: 855,
          width: 590,
          opacity: card2,
          transform: `translateX(${move(card2, 0, 1, 90, 0)}px)`,
        }}
      >
        <OpportunityCard
          title="Research fellowship abroad"
          org="Global"
          match="91% match"
          deadline="2w left"
          accent="#38BDF8"
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: 250,
          top: 1085,
          width: 590,
          opacity: card3,
          transform: `translateY(${move(card3, 0, 1, 70, 0)}px)`,
        }}
      >
        <OpportunityCard
          title="Young founders grant"
          org="Grant"
          match="88% match"
          deadline="Rolling"
          accent={GOLD}
        />
      </div>
    </AbsoluteFill>
  );
}

function ChatBubble({
  role,
  text,
  style,
}: {
  role: "ai" | "user";
  text: string;
  style?: Style;
}) {
  const isAi = role === "ai";
  return (
    <div
      style={{
        ...baseFont,
        maxWidth: isAi ? 360 : 330,
        alignSelf: isAi ? "flex-start" : "flex-end",
        borderRadius: isAi ? "24px 24px 24px 8px" : "24px 24px 8px 24px",
        padding: "18px 22px",
        color: TEXT,
        fontSize: 22,
        lineHeight: 1.18,
        fontWeight: 720,
        background: isAi ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg, #2563EB, #38BDF8)",
        border: isAi ? "1px solid rgba(255,255,255,0.16)" : "1px solid rgba(255,255,255,0.2)",
        ...style,
      }}
    >
      {text}
    </div>
  );
}

function AiPhoneMock() {
  return (
    <PhoneFrame innerStyle={{ background: "linear-gradient(180deg, #03103D, #020617)" }}>
      <MiniHeader title="AI Coach" subtitle="Ask anything" />
      <div style={{ padding: "18px 26px", display: "flex", flexDirection: "column", gap: 18 }}>
        <ChatBubble role="ai" text="I'm Edutu, your AI Coach." />
        <ChatBubble role="user" text="Find scholarships for engineering." />
        <ChatBubble role="ai" text="I found 12 strong matches. Want the best 3?" />
      </div>
      <div
        style={{
          position: "absolute",
          left: 26,
          right: 26,
          bottom: 34,
          borderRadius: 32,
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.14)",
          height: 78,
          display: "flex",
          alignItems: "center",
          padding: "0 22px",
          gap: 16,
        }}
      >
        <Mic style={iconStyle(30, BLUE_BRIGHT)} />
        <div style={{ ...baseFont, color: MUTED, fontSize: 20, fontWeight: 750 }}>Voice or text...</div>
      </div>
    </PhoneFrame>
  );
}

function VoiceWave({ frame }: { frame: number }) {
  return (
    <div style={{ display: "flex", gap: 9, alignItems: "center", justifyContent: "center" }}>
      {Array.from({ length: 18 }).map((_, index) => {
        const height = 24 + Math.abs(Math.sin(frame / 6 + index * 0.72)) * 82;
        return (
          <div
            key={index}
            style={{
              width: 9,
              height,
              borderRadius: 999,
              background:
                index % 3 === 0
                  ? "linear-gradient(180deg, #38BDF8, #2563EB)"
                  : "linear-gradient(180deg, rgba(255,255,255,0.88), rgba(56,189,248,0.55))",
            }}
          />
        );
      })}
    </div>
  );
}

function AiScene() {
  const frame = useCurrentFrame();
  const [start, end] = scenes.ai;
  const opacity = sceneOpacity(frame, start, end);
  const lf = local(frame, "ai");
  const phone = progress(lf, 10, 40);
  const copy = progress(lf, 28, 58);

  return (
    <AbsoluteFill style={{ opacity, padding: 70 }}>
      <div
        style={{
          position: "absolute",
          left: 72,
          top: 390,
          opacity: phone,
          transform: `translateX(${move(phone, 0, 1, -110, 0)}px) rotate(${move(phone, 0, 1, -8, 0)}deg)`,
        }}
      >
        <AiPhoneMock />
      </div>
      <div
        style={{
          position: "absolute",
          right: 66,
          top: 230,
          width: 430,
          opacity: copy,
          transform: `translateY(${move(copy, 0, 1, 65, 0)}px)`,
        }}
      >
        <Kicker>Guidance on demand</Kicker>
        <BigTitle size={79} style={{ marginTop: 34 }}>
          Ask the
          <br />
          AI coach.
        </BigTitle>
        <BodyCopy style={{ marginTop: 28 }}>
          Scholarships, career growth, skills, and application strategy without switching tabs.
        </BodyCopy>
      </div>
      <GlassCard
        style={{
          position: "absolute",
          right: 76,
          bottom: 365,
          width: 410,
          padding: "34px 24px",
          opacity: progress(lf, 72, 102),
        }}
      >
        <VoiceWave frame={lf} />
        <div
          style={{
            ...baseFont,
            color: TEXT,
            textAlign: "center",
            fontSize: 24,
            fontWeight: 900,
            marginTop: 24,
          }}
        >
          Voice-ready support
        </div>
      </GlassCard>
      <FeaturePill
        label="Career guidance"
        icon={MessageCircle}
        color={GOLD}
        style={{ position: "absolute", right: 86, bottom: 210, opacity: progress(lf, 88, 116) }}
      />
    </AbsoluteFill>
  );
}

function RoadmapPhoneMock() {
  const milestones = [
    { label: "Save opportunity", pct: 100 },
    { label: "Prepare documents", pct: 72 },
    { label: "Review essays", pct: 44 },
    { label: "Submit before deadline", pct: 18 },
  ];
  return (
    <PhoneFrame>
      <MiniHeader title="Roadmaps" subtitle="Track every move" />
      <div style={{ padding: "20px 28px" }}>
        <GlassCard
          style={{
            padding: 22,
            background: "linear-gradient(135deg, rgba(37,99,235,0.52), rgba(56,189,248,0.2))",
          }}
        >
          <div style={{ ...baseFont, color: TEXT, fontSize: 31, fontWeight: 940 }}>
            Scholarship application plan
          </div>
          <div style={{ ...baseFont, color: "#DCEBFF", fontSize: 19, fontWeight: 720, marginTop: 10 }}>
            4 weeks until submission
          </div>
        </GlassCard>
        <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 18 }}>
          {milestones.map((item, index) => (
            <GlassCard key={item.label} style={{ padding: 20, display: "flex", gap: 16 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  background: index === 0 ? GREEN : "rgba(56,189,248,0.17)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: "0 0 auto",
                }}
              >
                {index === 0 ? <Check style={iconStyle(22, TEXT)} /> : <Target style={iconStyle(22, BLUE_BRIGHT)} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ ...baseFont, color: TEXT, fontSize: 21, fontWeight: 860 }}>{item.label}</div>
                <div
                  style={{
                    height: 9,
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.14)",
                    marginTop: 14,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${item.pct}%`,
                      borderRadius: 999,
                      background: index === 0 ? GREEN : "linear-gradient(90deg, #2563EB, #38BDF8)",
                    }}
                  />
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      </div>
    </PhoneFrame>
  );
}

function RoadmapScene() {
  const frame = useCurrentFrame();
  const [start, end] = scenes.roadmap;
  const opacity = sceneOpacity(frame, start, end);
  const lf = local(frame, "roadmap");
  const phone = progress(lf, 10, 42);
  const copy = progress(lf, 28, 58);

  return (
    <AbsoluteFill style={{ opacity, padding: 70 }}>
      <div
        style={{
          position: "absolute",
          right: 74,
          top: 390,
          opacity: phone,
          transform: `translateX(${move(phone, 0, 1, 120, 0)}px) rotate(${move(phone, 0, 1, 8, 0)}deg)`,
        }}
      >
        <RoadmapPhoneMock />
      </div>
      <div
        style={{
          position: "absolute",
          left: 76,
          top: 230,
          width: 430,
          opacity: copy,
          transform: `translateY(${move(copy, 0, 1, 60, 0)}px)`,
        }}
      >
        <Kicker>From saved to submitted</Kicker>
        <BigTitle size={76} style={{ marginTop: 34 }}>
          Turn goals
          <br />
          into action.
        </BigTitle>
        <BodyCopy style={{ marginTop: 28 }}>
          Roadmaps, reminders, progress, and deadline clarity for every opportunity.
        </BodyCopy>
      </div>
      <FeaturePill
        label="Roadmaps"
        icon={Target}
        color={GOLD}
        style={{ position: "absolute", left: 78, bottom: 440, opacity: progress(lf, 76, 104) }}
      />
      <FeaturePill
        label="Deadline alerts"
        icon={CalendarDays}
        style={{ position: "absolute", left: 158, bottom: 310, opacity: progress(lf, 90, 118) }}
      />
    </AbsoluteFill>
  );
}

function CvMock() {
  return (
    <PhoneFrame innerStyle={{ background: "linear-gradient(180deg, #F8FAFC, #DBEAFE)" }}>
      <div style={{ padding: "78px 30px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ ...baseFont, color: "#0F172A", fontSize: 34, fontWeight: 940 }}>CV Builder</div>
            <div style={{ ...baseFont, color: "#475569", fontSize: 18, fontWeight: 700, marginTop: 4 }}>
              Tailored for real applications
            </div>
          </div>
          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: 999,
              background: "linear-gradient(135deg, #2563EB, #38BDF8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <FileText style={iconStyle(28, TEXT)} />
          </div>
        </div>
        <div
          style={{
            marginTop: 34,
            borderRadius: 28,
            background: "#FFFFFF",
            boxShadow: "0 24px 70px rgba(37,99,235,0.16)",
            padding: 24,
            minHeight: 510,
          }}
        >
          <div style={{ ...baseFont, color: "#0F172A", fontSize: 28, fontWeight: 940 }}>Amina Okafor</div>
          <div style={{ ...baseFont, color: BLUE, fontSize: 17, fontWeight: 850, marginTop: 8 }}>
            Engineering scholarship candidate
          </div>
          {["Education", "Projects", "Leadership", "Awards"].map((label, index) => (
            <div key={label} style={{ marginTop: index === 0 ? 30 : 26 }}>
              <div style={{ ...baseFont, color: "#0F172A", fontSize: 19, fontWeight: 900 }}>{label}</div>
              <div
                style={{
                  height: 10,
                  width: `${92 - index * 11}%`,
                  borderRadius: 999,
                  background: "linear-gradient(90deg, #2563EB, #38BDF8)",
                  marginTop: 12,
                }}
              />
              <div
                style={{
                  height: 8,
                  width: `${72 - index * 8}%`,
                  borderRadius: 999,
                  background: "#CBD5E1",
                  marginTop: 10,
                }}
              />
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 24 }}>
          <div
            style={{
              ...baseFont,
              color: TEXT,
              background: "linear-gradient(135deg, #2563EB, #38BDF8)",
              borderRadius: 22,
              padding: "20px 16px",
              fontSize: 19,
              fontWeight: 900,
              textAlign: "center",
            }}
          >
            Generate
          </div>
          <div
            style={{
              ...baseFont,
              color: "#0F172A",
              background: "#FFFFFF",
              borderRadius: 22,
              padding: "20px 16px",
              fontSize: 19,
              fontWeight: 900,
              textAlign: "center",
            }}
          >
            Tailor
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}

function CvScene() {
  const frame = useCurrentFrame();
  const [start, end] = scenes.cv;
  const opacity = sceneOpacity(frame, start, end);
  const lf = local(frame, "cv");
  const phone = progress(lf, 8, 40);
  const copy = progress(lf, 26, 58);

  return (
    <AbsoluteFill style={{ opacity, padding: 70 }}>
      <div
        style={{
          position: "absolute",
          left: 74,
          top: 388,
          opacity: phone,
          transform: `translateX(${move(phone, 0, 1, -130, 0)}px) rotate(${move(phone, 0, 1, -9, 0)}deg)`,
        }}
      >
        <CvMock />
      </div>
      <div
        style={{
          position: "absolute",
          right: 62,
          top: 250,
          width: 420,
          opacity: copy,
          transform: `translateY(${move(copy, 0, 1, 60, 0)}px)`,
        }}
      >
        <Kicker>Apply stronger</Kicker>
        <BigTitle size={77} style={{ marginTop: 34 }}>
          Build the CV
          <br />
          for the moment.
        </BigTitle>
        <BodyCopy style={{ marginTop: 28 }}>
          Draft, preview, tailor to real opportunities, and share when it is ready.
        </BodyCopy>
      </div>
      <FeaturePill
        label="AI drafts"
        icon={Zap}
        style={{ position: "absolute", right: 92, bottom: 410, opacity: progress(lf, 74, 102) }}
      />
      <FeaturePill
        label="Opportunity fit"
        icon={FileText}
        color={GOLD}
        style={{ position: "absolute", right: 162, bottom: 280, opacity: progress(lf, 88, 116) }}
      />
    </AbsoluteFill>
  );
}

function FinalScene() {
  const frame = useCurrentFrame();
  const [start, end] = scenes.final;
  const opacity = sceneOpacity(frame, start, end);
  const lf = local(frame, "final");
  const logo = progress(lf, 8, 36);
  const copy = progress(lf, 30, 68);
  const cta = progress(lf, 72, 106);
  const halo = move(lf % 90, 0, 90, 0.9, 1.28, EASE_SOFT);

  return (
    <AbsoluteFill
      style={{
        opacity,
        padding: 78,
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 720,
          height: 720,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(56,189,248,0.28), transparent 66%)",
          transform: `scale(${halo})`,
          opacity: move(lf % 90, 0, 90, 0.8, 0.2, EASE_SOFT),
        }}
      />
      <LogoMark
        size={240}
        style={{
          opacity: logo,
          transform: `translateY(${move(logo, 0, 1, 70, 0)}px) scale(${move(logo, 0, 1, 0.76, 1)})`,
        }}
      />
      <div
        style={{
          opacity: copy,
          transform: `translateY(${move(copy, 0, 1, 60, 0)}px)`,
          marginTop: 54,
        }}
      >
        <div
          style={{
            ...baseFont,
            color: BLUE_BRIGHT,
            fontSize: 46,
            fontWeight: 950,
            letterSpacing: 0,
          }}
        >
          EDUTU
        </div>
        <BigTitle size={100} style={{ marginTop: 24 }}>
          Launch your
          <br />
          next opportunity.
        </BigTitle>
        <BodyCopy style={{ marginTop: 28, maxWidth: 800 }}>
          Personalized matches. AI guidance. Roadmaps. CV tools. Built for ambition.
        </BodyCopy>
      </div>
      <div
        style={{
          ...baseFont,
          position: "absolute",
          bottom: 158,
          left: 112,
          right: 112,
          height: 104,
          borderRadius: 999,
          background: "linear-gradient(135deg, #2563EB, #38BDF8)",
          color: TEXT,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 34,
          fontWeight: 950,
          opacity: cta,
          transform: `translateY(${move(cta, 0, 1, 42, 0)}px)`,
          boxShadow: "0 26px 80px rgba(37,99,235,0.42)",
        }}
      >
        Start here
      </div>
    </AbsoluteFill>
  );
}

function TopProgress() {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const width = interpolate(frame, [0, durationInFrames - 1], [0, 100], clamp);
  return (
    <div
      style={{
        position: "absolute",
        left: 48,
        right: 48,
        top: 48,
        height: 7,
        borderRadius: 999,
        background: "rgba(255,255,255,0.12)",
        overflow: "hidden",
        zIndex: 50,
      }}
    >
      <div
        style={{
          width: `${width}%`,
          height: "100%",
          borderRadius: 999,
          background: "linear-gradient(90deg, #2563EB, #38BDF8, #F6B64A)",
        }}
      />
    </div>
  );
}

export const EdutuLaunchVideo = () => {
  return (
    <AbsoluteFill style={{ ...baseFont, background: NAVY, overflow: "hidden" }}>
      <BlueBackdrop />
      <IntroScene />
      <OpportunityBurstScene />
      <HomeScene />
      <MatchScene />
      <AiScene />
      <RoadmapScene />
      <CvScene />
      <FinalScene />
      <TopProgress />
      <div
        style={{
          position: "absolute",
          left: 54,
          bottom: 46,
          display: "flex",
          alignItems: "center",
          gap: 12,
          opacity: 0.72,
          zIndex: 60,
        }}
      >
        <LogoMark size={38} glow={false} />
        <span style={{ ...baseFont, color: "#DCEBFF", fontSize: 20, fontWeight: 850 }}>
          Edutu Launch
        </span>
      </div>
    </AbsoluteFill>
  );
};

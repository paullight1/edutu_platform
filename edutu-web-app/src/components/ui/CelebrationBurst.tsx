import { useEffect, useMemo, type CSSProperties } from "react";

/**
 * A brief, CSS-only confetti burst for big wins (e.g. an application reaching
 * Offer). No sound, no dependencies; it renders a fixed, pointer-events-none
 * overlay for ~2 seconds and then calls `onDone` so the parent can unmount it.
 * Respects prefers-reduced-motion by skipping the animation entirely.
 */

const PIECE_COLORS = [
  "bg-brand",
  "bg-success",
  "bg-warning",
  "bg-info",
  "bg-danger",
];

interface ConfettiPiece {
  left: number; // starting horizontal position, vw
  delay: number; // seconds
  duration: number; // seconds
  drift: number; // horizontal drift while falling, px
  size: number; // px
  colorClass: string;
  round: boolean;
}

/** Deterministic PRNG so the burst layout is stable across renders. */
function seededRandom(seed: number) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function buildPieces(count: number): ConfettiPiece[] {
  const random = seededRandom(1349);
  return Array.from({ length: count }, (_, index) => ({
    left: 2 + random() * 96,
    delay: random() * 0.35,
    duration: 1.2 + random() * 0.8,
    drift: (random() - 0.5) * 160,
    size: 6 + Math.round(random() * 6),
    colorClass: PIECE_COLORS[index % PIECE_COLORS.length],
    round: random() > 0.5,
  }));
}

export default function CelebrationBurst({
  onDone,
  durationMs = 2200,
  pieceCount = 28,
}: {
  onDone?: () => void;
  durationMs?: number;
  pieceCount?: number;
}) {
  const prefersReducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches),
    [],
  );

  const pieces = useMemo(() => buildPieces(pieceCount), [pieceCount]);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => onDone?.(),
      prefersReducedMotion ? 0 : durationMs,
    );
    return () => window.clearTimeout(timeout);
  }, [durationMs, onDone, prefersReducedMotion]);

  if (prefersReducedMotion) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[100] overflow-hidden"
      aria-hidden="true"
    >
      <style>{`
        @keyframes edutu-confetti-fall {
          0% { transform: translate3d(0, -8vh, 0) rotate(0deg); opacity: 1; }
          100% { transform: translate3d(var(--confetti-drift, 0px), 108vh, 0) rotate(680deg); opacity: 0.85; }
        }
      `}</style>
      {pieces.map((piece, index) => (
        <span
          key={index}
          className={`absolute top-0 block ${piece.colorClass} ${piece.round ? "rounded-full" : "rounded-[2px]"}`}
          style={
            {
              left: `${piece.left}vw`,
              width: piece.size,
              height: piece.round ? piece.size : piece.size * 1.6,
              "--confetti-drift": `${piece.drift}px`,
              animation: `edutu-confetti-fall ${piece.duration}s ease-in ${piece.delay}s forwards`,
              opacity: 0,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

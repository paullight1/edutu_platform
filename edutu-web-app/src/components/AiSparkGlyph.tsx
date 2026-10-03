interface AiSparkGlyphProps {
  size?: number;
  color?: string;
  filled?: boolean;
}

// Keep these paths in sync with edutumobile/components/ui/AiSparkGlyph.tsx.
const SPARK =
  "M12 2.2C12.62 7.5 16.5 11.38 21.8 12C16.5 12.62 12.62 16.5 12 21.8C11.38 16.5 7.5 12.62 2.2 12C7.5 11.38 11.38 7.5 12 2.2Z";
const SPARKLET =
  "M19.3 2.6C19.5 4.3 20.3 5.1 22 5.3C20.3 5.5 19.5 6.3 19.3 8C19.1 6.3 18.3 5.5 16.6 5.3C18.3 5.1 19.1 4.3 19.3 2.6Z";

export default function AiSparkGlyph({
  size = 24,
  color = "currentColor",
  filled = true,
}: AiSparkGlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={SPARK}
        stroke={filled ? "none" : color}
        strokeWidth={1.7}
        strokeLinejoin="round"
        fill={filled ? color : "none"}
      />
      <path d={SPARKLET} fill={color} opacity={filled ? 1 : 0.9} />
    </svg>
  );
}

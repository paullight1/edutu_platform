import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemeMode } from "../hooks/useTheme";

const MODE_OPTIONS: Array<{
  value: ThemeMode;
  label: string;
  icon: typeof Sun;
}> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export default function AppearanceSettings() {
  const { mode, setMode } = useTheme();

  return (
    <section className="mb-6 rounded-2xl border border-subtle bg-surface-layer p-5 shadow-soft">
      <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-muted">
        Appearance
      </h2>
      <p className="mt-1 text-sm text-text-secondary">
        Choose between Edutu&apos;s light and dark palettes.
      </p>

      {/* Light / Dark / System */}
      <div
        role="radiogroup"
        aria-label="Theme mode"
        className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-surface-elevated p-1"
      >
        {MODE_OPTIONS.map((option) => {
          const Icon = option.icon;
          const active = mode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setMode(option.value)}
              className={`flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-xs font-semibold transition ${
                active
                  ? "bg-surface-layer text-brand shadow-soft"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              <Icon size={18} />
              {option.label}
            </button>
          );
        })}
      </div>

    </section>
  );
}

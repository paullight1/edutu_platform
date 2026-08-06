import { Check, Monitor, Moon, Sun } from "lucide-react";
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
  const { mode, setMode, isDarkMode, themePack, setThemePack, themePacks } =
    useTheme();

  return (
    <section className="mb-6 rounded-2xl border border-subtle bg-surface-layer p-5 shadow-soft">
      <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-muted">
        Appearance
      </h2>
      <p className="mt-1 text-sm text-text-secondary">
        Choose how Edutu looks. System follows your device.
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

      {/* Accent theme packs */}
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Theme</h3>
          <span className="text-xs text-text-muted">Accent color</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-6">
          {themePacks.map((pack) => {
            const active = themePack === pack.id;
            const color = isDarkMode ? pack.swatchDark : pack.swatch;
            return (
              <button
                key={pack.id}
                type="button"
                aria-pressed={active}
                aria-label={`${pack.label} theme`}
                onClick={() => setThemePack(pack.id)}
                className={`group flex flex-col items-center gap-1.5 rounded-xl border p-2.5 transition ${
                  active
                    ? "border-brand bg-brand/10"
                    : "border-subtle hover:border-brand/40"
                }`}
              >
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full shadow-soft ring-2 ring-surface-layer"
                  style={{ backgroundColor: color }}
                >
                  {active ? (
                    <Check size={16} className="text-white" strokeWidth={3} />
                  ) : null}
                </span>
                <span
                  className={`text-2xs font-medium ${
                    active ? "text-text-primary" : "text-text-muted"
                  }`}
                >
                  {pack.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

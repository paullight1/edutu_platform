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
    <div className="border-b border-subtle px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-text-primary">Appearance</p>
        <p className="mt-0.5 text-xs text-text-muted">Light, dark or device setting</p>
      </div>
      <div
        role="radiogroup"
        aria-label="Theme mode"
        className="mt-2 grid grid-cols-3 border-t border-subtle"
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
              className={`relative flex min-h-11 items-center justify-center gap-1.5 px-1 text-xs font-semibold transition ${
                active
                  ? "text-brand"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              <Icon size={15} />
              {option.label}
              {active ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

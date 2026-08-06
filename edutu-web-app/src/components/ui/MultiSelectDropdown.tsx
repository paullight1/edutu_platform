import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react";

interface MultiSelectDropdownProps {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  /** When true, a non-matching search term can be added as a custom value. */
  allowCustom?: boolean;
  /** Renders an emoji/flag prefix per option (e.g. country flags). */
  optionPrefix?: (option: string) => string | undefined;
}

const sameValue = (a: string, b: string) =>
  a.toLowerCase() === b.toLowerCase();

/**
 * A searchable multi-select: closed it reads like a normal input showing the
 * chosen values as removable chips; open it lists every option with a check
 * users can tap. Replaces the old wall-of-pills TagPicker pattern.
 */
export default function MultiSelectDropdown({
  label,
  options,
  selected,
  onToggle,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  allowCustom = false,
  optionPrefix,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listboxId = useId();

  // Custom values the member added earlier stay visible/toggleable even
  // though they aren't part of the preset options.
  const allOptions = useMemo(() => {
    const customSelected = selected.filter(
      (value) => !options.some((option) => sameValue(option, value)),
    );
    return [...customSelected, ...options];
  }, [options, selected]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return allOptions;
    return allOptions.filter((option) =>
      option.toLowerCase().includes(term),
    );
  }, [allOptions, query]);

  const trimmedQuery = query.trim();
  const canAddCustom =
    allowCustom &&
    trimmedQuery.length > 0 &&
    !allOptions.some((option) => sameValue(option, trimmedQuery));

  const isSelected = (value: string) =>
    selected.some((entry) => sameValue(entry, value));

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  };

  const addCustom = () => {
    if (!canAddCustom) return;
    onToggle(trimmedQuery);
    setQuery("");
  };

  return (
    <div ref={rootRef} className="relative" onKeyDown={handleKeyDown}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={label}
        onClick={() => {
          setOpen((value) => !value);
          setQuery("");
        }}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-subtle bg-surface-layer px-3 py-2 text-left transition hover:border-strong focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        {selected.length === 0 ? (
          <span className="text-sm font-medium text-text-muted">
            {placeholder}
          </span>
        ) : (
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {selected.map((value) => (
              <span
                key={value}
                className="inline-flex items-center gap-1 rounded-full bg-brand/10 py-0.5 pl-2.5 pr-1 text-xs font-semibold text-brand"
              >
                {optionPrefix?.(value) ? `${optionPrefix(value)} ` : null}
                {value}
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Remove ${value}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggle(value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      onToggle(value);
                    }
                  }}
                  className="flex h-4 w-4 items-center justify-center rounded-full transition hover:bg-brand/20"
                >
                  <X size={11} />
                </span>
              </span>
            ))}
          </span>
        )}
        <span className="flex shrink-0 items-center gap-2">
          {selected.length > 0 ? (
            <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-semibold text-text-muted">
              {selected.length}
            </span>
          ) : null}
          <ChevronDown
            size={16}
            className={`text-text-muted transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {open ? (
        <div className="absolute inset-x-0 z-30 mt-2 overflow-hidden rounded-xl border border-subtle bg-surface-layer shadow-lg">
          <div className="flex items-center gap-2 border-b border-subtle px-3">
            <Search size={14} className="shrink-0 text-text-muted" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (canAddCustom) {
                    addCustom();
                  } else if (filtered.length === 1) {
                    onToggle(filtered[0]);
                    setQuery("");
                  }
                }
              }}
              placeholder={searchPlaceholder}
              className="h-10 w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
            />
          </div>
          <ul
            id={listboxId}
            role="listbox"
            aria-label={label}
            aria-multiselectable="true"
            className="max-h-60 overflow-y-auto overscroll-contain p-1"
          >
            {canAddCustom ? (
              <li>
                <button
                  type="button"
                  onClick={addCustom}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-brand transition hover:bg-brand/10"
                >
                  <Plus size={15} className="shrink-0" />
                  Add “{trimmedQuery}”
                </button>
              </li>
            ) : null}
            {filtered.map((option) => {
              const active = isSelected(option);
              return (
                <li key={option}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => onToggle(option)}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
                      active
                        ? "bg-brand/10 text-brand"
                        : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
                    }`}
                  >
                    <span className="min-w-0 truncate">
                      {optionPrefix?.(option)
                        ? `${optionPrefix(option)} `
                        : null}
                      {option}
                    </span>
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${
                        active
                          ? "border-brand bg-brand text-white"
                          : "border-subtle bg-surface-body text-transparent"
                      }`}
                    >
                      <Check size={12} strokeWidth={3} />
                    </span>
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && !canAddCustom ? (
              <li className="px-3 py-4 text-center text-sm text-text-muted">
                No matches found
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

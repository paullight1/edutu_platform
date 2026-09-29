interface ProfileCompletenessProps {
  percent: number;
  updatedAt?: string | null;
}

export function ProfileCompleteness({ percent, updatedAt }: ProfileCompletenessProps) {
  if (percent >= 100) return null;

  const safePercent = Math.max(0, Math.min(Math.round(percent), 100));

  return (
    <aside className="mt-4 max-w-sm" aria-label="Profile completeness">
      <div className="flex items-center justify-between gap-3 text-xs font-semibold">
        <span className="text-text-secondary">Profile completeness</span>
        <span className="shrink-0 text-brand">{safePercent}%</span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-body"
        role="progressbar"
        aria-label="Profile completeness"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={safePercent}
      >
        <div
          className="h-full rounded-full bg-brand transition-[width]"
          style={{ width: `${safePercent}%` }}
        />
      </div>
      {updatedAt ? (
        <p className="mt-2 text-2xs font-medium text-text-muted">
          Updated {updatedAt}
        </p>
      ) : null}
    </aside>
  );
}

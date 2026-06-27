const PageSuspense = () => {
  return (
    <div
      className="flex min-h-[calc(100dvh-180px)] items-center justify-center px-6 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="max-w-sm">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-brand-500/25 border-t-brand-500" />
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Loading…
        </p>
      </div>
    </div>
  );
};

export default PageSuspense;

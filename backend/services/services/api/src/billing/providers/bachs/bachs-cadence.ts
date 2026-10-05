/** Bachs recurring subscriptions use one USD card charge per approved period. */
export function matchesBachsCadence(
  cycle: Record<string, unknown> | null,
  cadence: string | null,
): boolean {
  const interval = { weekly: "week", monthly: "month", yearly: "year" }[
    cadence ?? ""
  ];
  return Boolean(
    interval && cycle?.interval === interval && cycle.frequency === 1,
  );
}

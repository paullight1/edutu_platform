export function parsePageParam(
  value: string | null,
  totalPages?: number,
): number {
  const parsed = Number(value);
  const page = Number.isInteger(parsed) && parsed > 0 ? parsed : 1;

  if (typeof totalPages === "number" && Number.isFinite(totalPages)) {
    return Math.min(page, Math.max(1, Math.floor(totalPages)));
  }

  return page;
}

export function buildPageHref(
  pathname: string,
  searchParams: URLSearchParams,
  page: number,
): string {
  const next = new URLSearchParams(searchParams);

  if (page <= 1) {
    next.delete("page");
  } else {
    next.set("page", String(page));
  }

  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

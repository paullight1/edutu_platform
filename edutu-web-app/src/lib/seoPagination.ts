export function parsePageParam(
  value: string | null | undefined,
  totalPages?: number,
): number {
  const parsed = Number(value);
  const page =
    Number.isInteger(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;

  if (
    typeof totalPages !== "number" ||
    !Number.isFinite(totalPages) ||
    totalPages < 1
  ) {
    return page;
  }

  return Math.min(page, Math.floor(totalPages));
}

export function buildPageHref(
  pathname: string,
  searchParams: URLSearchParams,
  page: number,
): string {
  const next = new URLSearchParams(searchParams);
  const normalizedPage = parsePageParam(String(page));

  if (normalizedPage <= 1) next.delete("page");
  else next.set("page", String(normalizedPage));

  const query = next.toString();
  return `${pathname}${query ? `?${query}` : ""}`;
}

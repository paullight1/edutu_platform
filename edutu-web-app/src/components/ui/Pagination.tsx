import React, { type MouseEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
  /**
   * When supplied, pagination is rendered as real anchors so crawlers and
   * no-JavaScript readers can reach every archive page. The callback still
   * handles ordinary clicks for smooth in-app navigation.
   */
  getPageHref?: (page: number) => string;
}

type PageItem = number | "ellipsis";

/**
 * Build the list of page controls. Small archives show every page; large ones
 * keep the first and last page reachable while windowing around the current
 * page.
 */
function getPageItems(page: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const items: PageItem[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);

  if (start > 2) items.push("ellipsis");
  for (let current = start; current <= end; current += 1) {
    items.push(current);
  }
  if (end < totalPages - 1) items.push("ellipsis");

  items.push(totalPages);
  return items;
}

function shouldHandleClientSide(event: MouseEvent<HTMLAnchorElement>): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

const pageControlClass =
  "flex h-10 w-10 items-center justify-center rounded-full border border-subtle text-sm font-semibold text-text-secondary transition-colors hover:border-brand/50 hover:text-brand";
const activePageClass =
  "flex h-10 w-10 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white shadow-soft";
const previousClass =
  "inline-flex h-10 items-center gap-1 rounded-full border border-subtle pl-3 pr-4 text-sm font-semibold text-text-secondary transition-colors hover:border-brand/50 hover:text-brand disabled:cursor-not-allowed disabled:opacity-40";
const nextClass =
  "inline-flex h-10 items-center gap-1 rounded-full border border-subtle pl-4 pr-3 text-sm font-semibold text-text-secondary transition-colors hover:border-brand/50 hover:text-brand disabled:cursor-not-allowed disabled:opacity-40";

const Pagination: React.FC<PaginationProps> = ({
  page,
  totalPages,
  onPageChange,
  className = "",
  getPageHref,
}) => {
  if (totalPages <= 1) return null;

  const items = getPageItems(page, totalPages);
  const previousPage = Math.max(1, page - 1);
  const nextPage = Math.min(totalPages, page + 1);

  const handleLinkClick = (
    event: MouseEvent<HTMLAnchorElement>,
    targetPage: number,
  ) => {
    if (!shouldHandleClientSide(event)) return;
    event.preventDefault();
    onPageChange(targetPage);
  };

  return (
    <nav
      aria-label="Pagination"
      className={`flex flex-wrap items-center justify-center gap-2 ${className}`}
    >
      {getPageHref && page > 1 ? (
        <a
          href={getPageHref(previousPage)}
          rel="prev"
          aria-label="Previous page"
          className={previousClass}
          onClick={(event) => handleLinkClick(event, previousPage)}
        >
          <ChevronLeft size={16} aria-hidden="true" />
          Prev
        </a>
      ) : (
        <button
          type="button"
          onClick={() => onPageChange(previousPage)}
          disabled={page === 1}
          aria-label="Previous page"
          className={previousClass}
        >
          <ChevronLeft size={16} aria-hidden="true" />
          Prev
        </button>
      )}

      {items.map((item, index) =>
        item === "ellipsis" ? (
          <span
            key={`ellipsis-${index}`}
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center text-sm font-semibold text-text-muted"
          >
            …
          </span>
        ) : getPageHref ? (
          <a
            key={item}
            href={getPageHref(item)}
            aria-label={`Page ${item}`}
            aria-current={item === page ? "page" : undefined}
            className={item === page ? activePageClass : pageControlClass}
            onClick={(event) => handleLinkClick(event, item)}
          >
            {item}
          </a>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => onPageChange(item)}
            aria-label={`Page ${item}`}
            aria-current={item === page ? "page" : undefined}
            className={item === page ? activePageClass : pageControlClass}
          >
            {item}
          </button>
        ),
      )}

      {getPageHref && page < totalPages ? (
        <a
          href={getPageHref(nextPage)}
          rel="next"
          aria-label="Next page"
          className={nextClass}
          onClick={(event) => handleLinkClick(event, nextPage)}
        >
          Next
          <ChevronRight size={16} aria-hidden="true" />
        </a>
      ) : (
        <button
          type="button"
          onClick={() => onPageChange(nextPage)}
          disabled={page === totalPages}
          aria-label="Next page"
          className={nextClass}
        >
          Next
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      )}
    </nav>
  );
};

export default Pagination;

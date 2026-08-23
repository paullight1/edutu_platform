import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  getPageHref?: (page: number) => string;
  className?: string;
}

/**
 * Build the list of page controls to render. For small counts we show every
 * page; past that we window around the current page and collapse the gaps with
 * ellipses, always keeping the first and last page reachable.
 */
function getPageItems(page: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const items: (number | 'ellipsis')[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);

  if (start > 2) items.push('ellipsis');
  for (let i = start; i <= end; i += 1) items.push(i);
  if (end < totalPages - 1) items.push('ellipsis');

  items.push(totalPages);
  return items;
}

/**
 * Shared numbered pagination used by the blog and opportunities listings.
 * Callers may provide `getPageHref` to expose real crawlable links while still
 * handling ordinary left-clicks in the SPA. Existing callers retain button
 * behavior when no href builder is supplied.
 */
const Pagination: React.FC<PaginationProps> = ({
  page,
  totalPages,
  onPageChange,
  getPageHref,
  className = '',
}) => {
  if (totalPages <= 1) return null;

  const items = getPageItems(page, totalPages);
  const previousPage = Math.max(1, page - 1);
  const nextPage = Math.min(totalPages, page + 1);
  const previousNextClass =
    'inline-flex h-10 items-center gap-1 rounded-full border border-subtle text-sm font-semibold text-text-secondary transition-colors hover:border-brand/50 hover:text-brand';
  const pageClass =
    'flex h-10 w-10 items-center justify-center rounded-full border border-subtle text-sm font-semibold text-text-secondary transition-colors hover:border-brand/50 hover:text-brand';
  const currentPageClass =
    'flex h-10 w-10 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white shadow-soft';

  const handleAnchorClick = (
    event: React.MouseEvent<HTMLAnchorElement>,
    targetPage: number,
  ) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    onPageChange(targetPage);
  };

  return (
    <nav
      aria-label="Pagination"
      className={`flex flex-wrap items-center justify-center gap-2 ${className}`}
    >
      {getPageHref ? (
        page === 1 ? (
          <span
            aria-disabled="true"
            aria-label="Previous page"
            className={`${previousNextClass} cursor-not-allowed py-2 pl-3 pr-4 opacity-40`}
          >
            <ChevronLeft size={16} />
            Prev
          </span>
        ) : (
          <a
            href={getPageHref(previousPage)}
            onClick={(event) => handleAnchorClick(event, previousPage)}
            aria-label="Previous page"
            className={`${previousNextClass} py-2 pl-3 pr-4 no-underline`}
          >
            <ChevronLeft size={16} />
            Prev
          </a>
        )
      ) : (
        <button
          type="button"
          onClick={() => onPageChange(previousPage)}
          disabled={page === 1}
          aria-label="Previous page"
          className={`${previousNextClass} pl-3 pr-4 disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <ChevronLeft size={16} />
          Prev
        </button>
      )}

      {items.map((item, index) =>
        item === 'ellipsis' ? (
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
            onClick={(event) => handleAnchorClick(event, item)}
            aria-label={`Page ${item}`}
            aria-current={item === page ? 'page' : undefined}
            className={`${item === page ? currentPageClass : pageClass} no-underline`}
          >
            {item}
          </a>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => onPageChange(item)}
            aria-label={`Page ${item}`}
            aria-current={item === page ? 'page' : undefined}
            className={item === page ? currentPageClass : pageClass}
          >
            {item}
          </button>
        ),
      )}

      {getPageHref ? (
        page === totalPages ? (
          <span
            aria-disabled="true"
            aria-label="Next page"
            className={`${previousNextClass} cursor-not-allowed py-2 pl-4 pr-3 opacity-40`}
          >
            Next
            <ChevronRight size={16} />
          </span>
        ) : (
          <a
            href={getPageHref(nextPage)}
            onClick={(event) => handleAnchorClick(event, nextPage)}
            aria-label="Next page"
            className={`${previousNextClass} py-2 pl-4 pr-3 no-underline`}
          >
            Next
            <ChevronRight size={16} />
          </a>
        )
      ) : (
        <button
          type="button"
          onClick={() => onPageChange(nextPage)}
          disabled={page === totalPages}
          aria-label="Next page"
          className={`${previousNextClass} pl-4 pr-3 disabled:cursor-not-allowed disabled:opacity-40`}
        >
          Next
          <ChevronRight size={16} />
        </button>
      )}
    </nav>
  );
};

export default Pagination;

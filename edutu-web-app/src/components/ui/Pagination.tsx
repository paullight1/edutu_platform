import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/**
 * Build the list of page buttons to render. For small counts we show every
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
 * Shared numbered pagination used by the blog and opportunities listings so
 * long lists page instead of scrolling endlessly. Purely presentational — the
 * parent owns `page` state and scroll-restoration on change.
 */
const Pagination: React.FC<PaginationProps> = ({
  page,
  totalPages,
  onPageChange,
  className = '',
}) => {
  if (totalPages <= 1) return null;

  const items = getPageItems(page, totalPages);

  return (
    <nav
      aria-label="Pagination"
      className={`flex flex-wrap items-center justify-center gap-2 ${className}`}
    >
      <button
        type="button"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page === 1}
        aria-label="Previous page"
        className="inline-flex h-10 items-center gap-1 rounded-full border border-subtle pl-3 pr-4 text-sm font-semibold text-text-secondary transition-colors hover:border-brand/50 hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronLeft size={16} />
        Prev
      </button>

      {items.map((item, index) =>
        item === 'ellipsis' ? (
          <span
            key={`ellipsis-${index}`}
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center text-sm font-semibold text-text-muted"
          >
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => onPageChange(item)}
            aria-label={`Page ${item}`}
            aria-current={item === page ? 'page' : undefined}
            className={
              item === page
                ? 'flex h-10 w-10 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white shadow-soft'
                : 'flex h-10 w-10 items-center justify-center rounded-full border border-subtle text-sm font-semibold text-text-secondary transition-colors hover:border-brand/50 hover:text-brand'
            }
          >
            {item}
          </button>
        ),
      )}

      <button
        type="button"
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        aria-label="Next page"
        className="inline-flex h-10 items-center gap-1 rounded-full border border-subtle pl-4 pr-3 text-sm font-semibold text-text-secondary transition-colors hover:border-brand/50 hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next
        <ChevronRight size={16} />
      </button>
    </nav>
  );
};

export default Pagination;

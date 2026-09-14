'use client';

/**
 * Grid pager — port of motvin-ui/COMPONENT/Pagination.js.
 *
 * Window of page numbers with ellipses: everything up to 5 pages, otherwise a
 * sliding window anchored to the first and last page.
 */

type Props = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

const ELLIPSIS = '...' as const;

function pageWindow(page: number, totalPages: number): (number | typeof ELLIPSIS)[] {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  if (page <= 3) return [1, 2, 3, 4, ELLIPSIS, totalPages];
  if (page >= totalPages - 2) {
    return [1, ELLIPSIS, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, ELLIPSIS, page - 1, page, page + 1, ELLIPSIS, totalPages];
}

const ChevronIcon = ({ flipped }: { flipped?: boolean }) => (
  <svg
    className="mi-page-nav-icon"
    style={flipped ? { transform: 'rotate(180deg)' } : undefined}
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M6 12L10 8L6 4"
      stroke="currentColor"
      strokeWidth="1.33333"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function Pagination({ page, totalPages, onPageChange }: Props) {
  const change = (next: number) => {
    if (next === page || next < 1 || next > totalPages) return;
    onPageChange(next);
  };

  return (
    <div
      className="mi-pagination-wrapper"
      id="pagination-wrapper"
      style={{ display: totalPages <= 1 ? 'none' : 'flex' }}
    >
      <div className="mi-pagination-bar" id="pagination-bar">
        <button
          className="mi-page-nav-btn"
          id="btn-page-prev"
          disabled={page === 1}
          onClick={() => change(page - 1)}
        >
          <ChevronIcon flipped />
          <span>Prev</span>
        </button>

        {pageWindow(page, totalPages).map((entry, index) =>
          entry === ELLIPSIS ? (
            <div
              key={`gap-${index}`}
              className="mi-page-btn"
              style={{ cursor: 'default', background: 'none' }}
            >
              {ELLIPSIS}
            </div>
          ) : (
            <div
              key={entry}
              className={`mi-page-btn${entry === page ? ' is-active' : ''}`}
              data-page={entry}
              onClick={() => change(entry)}
            >
              {entry}
            </div>
          ),
        )}

        <button
          className="mi-page-nav-btn is-next"
          id="btn-page-next"
          disabled={page === totalPages}
          onClick={() => change(page + 1)}
        >
          <span>Next</span>
          <ChevronIcon />
        </button>
      </div>
    </div>
  );
}

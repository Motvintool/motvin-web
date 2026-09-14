'use client';

import { memo } from 'react';
import type { LibraryItem } from '@/lib/api/normalize';
import type { Category } from '@/lib/config/categories';
import { renderForCategory } from '@/lib/render';

/**
 * One grid cell — port of iconCard() in motvin-ui/JS/motvin-icons.js.
 *
 * The preview is generated markup rather than JSX because the render pipeline
 * rewrites the source library's own paths (stroke, fill, transforms) as a
 * string, exactly as the original did. It is our own output built from API
 * data, not arbitrary third-party HTML.
 */

type Props = {
  item: LibraryItem;
  category: Category;
  selected: boolean;
  saved: boolean;
  globals: { size: number; stroke: number; color: string };
  onOpen: (item: LibraryItem) => void;
  onToggleSelect: (item: LibraryItem) => void;
  onCopy: (item: LibraryItem) => void;
  onToggleSave: (item: LibraryItem) => void;
};

function ItemCardImpl({
  item,
  category,
  selected,
  saved,
  globals,
  onOpen,
  onToggleSelect,
  onCopy,
  onToggleSave,
}: Props) {
  return (
    <div
      className={`mi-card${selected ? ' is-selected' : ''}`}
      data-id={item.id}
      role="listitem"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(item);
        }
      }}
    >
      <div
        className="mi-card-cmp"
        // Empty-string, matching legacy icons.html — some CSS/JS matches
        // `[data-cmp=""]` which fails against React's boolean serialisation.
        data-cmp=""
        aria-label="Select for compare"
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect(item);
        }}
      />
      <div className="mi-card-actions">
        <button
          className="mi-card-act"
          data-act="copy"
          title="Copy SVG"
          onClick={(e) => {
            e.stopPropagation();
            onCopy(item);
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
        <button
          className={`mi-card-act${saved ? ' is-active' : ''}`}
          data-act="save"
          title="Save"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSave(item);
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill={saved ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
      </div>
      <div
        className="mi-card-preview"
        dangerouslySetInnerHTML={{ __html: renderForCategory(category, item, globals) }}
      />
      <div className="mi-card-name" title={item.name}>
        {item.name}
      </div>
      <div className="mi-card-source">
        <span>{item.sourceName}</span>
      </div>
    </div>
  );
}

// A page is 60 cards, each re-rendering a full SVG string. Without memo, any
// selection change re-renders every one of them.
export const ItemCard = memo(ItemCardImpl);

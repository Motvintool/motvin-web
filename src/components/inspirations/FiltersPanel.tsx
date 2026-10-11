'use client';

import { useRef, useState } from 'react';
import { formatCount } from '@/lib/inspirations/taxonomy';
import { onTriggerKeyDown, useDismiss } from './FilterToolbar';
import { CheckIcon, CloseIcon, SearchIcon } from './Icons';

/**
 * The screen filters as one "Filters" pill and a panel (search box, then a section of chips per dimension),
 * plus a removable pill per applied value — shared by the search page and the Screens / UI Elements toolbar.
 */

export type FilterSection = {
  key: string;
  label: string;
  options: { value: string; label: string; count?: number }[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
};

/** How many chips a section shows before "Show more". */
const SECTION_PREVIEW = 8;

/**
 * One "Filters" pill for every screen filter (Categories, Screen type, State, Element, Style), so the toolbar
 * stays short. It opens a panel of sections; picking a value applies it straight away, and the footer button
 * shows how many results the current choice gives.
 */
export function FiltersPill({
  sections,
  onClearAll,
  total,
  unit,
}: {
  sections: FilterSection[];
  onClearAll: () => void;
  total: number | null;
  unit: string;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);
  const q = query.trim().toLowerCase();
  // Searching narrows every section to the matching values and drops sections with none.
  const visibleSections = q
    ? sections
        .map((s) => ({ ...s, options: s.options.filter((o) => o.label.toLowerCase().includes(q) || o.value.includes(q)) }))
        .filter((s) => s.options.length > 0)
    : sections;
  const active = sections.reduce((n, s) => n + s.selected.length, 0);
  const expand = (key: string) => setExpanded((cur) => new Set(cur).add(key));

  return (
    <div className="ins-popwrap" ref={ref}>
      <button
        type="button"
        className={`ins-fpill ${active ? 'is-applied' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={active ? `Filters, ${active} applied` : 'Filters'}
        onClick={() => {
          setQuery('');
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => onTriggerKeyDown(e, open, setOpen)}
      >
        Filters
        {active > 0 && <span className="ins-fpill-more">{active}</span>}
        <span className="ins-fpill-chev" aria-hidden />
      </button>
      {open && (
        <div className="ins-popover ins-fpanel" role="dialog" aria-label="Filters">
          <div className="ins-uielements-search">
            <SearchIcon size={18} />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search filters..."
              aria-label="Search filters"
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpen(false);
              }}
            />
          </div>
          <div className="ins-fpanel-body">
            {visibleSections.length === 0 && <p className="ins-popover-empty">No matching filters</p>}
            {visibleSections.map((section) => {
              // Picked values always stay in view, even past the preview; a search shows every match.
              const showAll = Boolean(q) || expanded.has(section.key) || section.options.length <= SECTION_PREVIEW + 2;
              const shown = showAll
                ? section.options
                : section.options.filter((o, i) => i < SECTION_PREVIEW || section.selected.includes(o.value));
              const hidden = section.options.length - shown.length;
              return (
                <section key={section.key} className="ins-fpanel-section">
                  <div className="ins-fpanel-section-head">
                    <h3>
                      {section.label}
                      {section.selected.length > 0 && <span className="ins-fpanel-badge">{section.selected.length}</span>}
                    </h3>
                    {section.selected.length > 0 && (
                      <button type="button" className="ins-fpanel-link" onClick={section.onClear}>
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="ins-fpanel-options">
                    {shown.map((o) => {
                      const on = section.selected.includes(o.value);
                      const empty = !on && o.count === 0;
                      return (
                        <button
                          key={o.value}
                          type="button"
                          className={`ins-fpanel-option ${on ? 'is-on' : ''} ${empty ? 'is-empty' : ''}`}
                          aria-pressed={on}
                          disabled={empty}
                          onClick={() => section.onToggle(o.value)}
                        >
                          {on && <CheckIcon size={12} strokeWidth={3} />}
                          {o.label}
                          {o.count !== undefined && <span className="ins-fpanel-count">{formatCount(o.count)}</span>}
                        </button>
                      );
                    })}
                    {hidden > 0 && (
                      <button type="button" className="ins-fpanel-link ins-fpanel-more" onClick={() => expand(section.key)}>
                        Show {hidden} more
                      </button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
          <div className="ins-fpanel-foot">
            <button type="button" className="ins-fpanel-link" onClick={onClearAll} disabled={!active}>
              Clear all
            </button>
            <button type="button" className="ins-fpanel-done" onClick={() => setOpen(false)}>
              {total === null ? 'Done' : `Show ${formatCount(total)} ${unit}${total === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Each applied value as its own pill, so what's narrowing the results is readable from the row. */
export function AppliedFilterPills({ sections }: { sections: FilterSection[] }) {
  return (
    <>
      {sections.flatMap((section) =>
        section.selected.map((value) => {
          const label = section.options.find((o) => o.value === value)?.label ?? value;
          return (
            <button
              key={`${section.key}:${value}`}
              type="button"
              className="ins-fpill is-applied"
              aria-label={`Remove ${section.label}: ${label}`}
              onClick={() => section.onToggle(value)}
            >
              {label}
              <span className="ins-fpill-x" aria-hidden>
                <CloseIcon size={10} strokeWidth={4} />
              </span>
            </button>
          );
        }),
      )}
    </>
  );
}

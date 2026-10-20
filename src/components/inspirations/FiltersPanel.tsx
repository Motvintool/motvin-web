'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { formatCount } from '@/lib/inspirations/taxonomy';
import { onTriggerKeyDown, useDismiss } from './FilterToolbar';
import { CheckIcon, CloseIcon, SearchIcon } from './Icons';
import { useToast } from './Toast';

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
  atEnd = false,
  onOpenChange,
  openSignal = 0,
}: {
  sections: FilterSection[];
  onClearAll: () => void;
  total: number | null;
  unit: string;
  /** On the right edge (the app lists): the sort button's look and icon, the panel opening leftwards. */
  atEnd?: boolean;
  /** Told when the panel opens or closes (the app filters load App Store numbers only once it's open). */
  onOpenChange?: (open: boolean) => void;
  /** Bumped to open the panel from elsewhere (the "+N more" pill beside the applied filters). */
  openSignal?: number;
}) {
  const [open, setOpen] = useState(false);
  // The side panel slides back out before it goes (CSS), so closing it is a short "closing" state first.
  const [closing, setClosing] = useState(false);
  const [seenSignal, setSeenSignal] = useState(openSignal);
  if (openSignal !== seenSignal) {
    setSeenSignal(openSignal);
    setOpen(true);
    setClosing(false);
  }
  const close = () => (atEnd ? setClosing(true) : setOpen(false));
  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, DRAWER_OUT_MS);
    return () => clearTimeout(timer);
  }, [closing]);
  const { show: showToast } = useToast();
  // "Save filters": the picks already apply as they're made, so saving closes the panel and confirms what
  // the list now holds, with a one-tap way back.
  const save = () => {
    close();
    const shown = total === null ? '' : ` · ${formatCount(total)} ${unit}${total === 1 ? '' : 's'}`;
    showToast(`Filters saved${shown}`, { action: { label: 'Clear', onClick: onClearAll } });
  };
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  // The side panel (atEnd) lives in a portal outside `ref`; a click outside it, or Esc, closes it instead.
  const drawerRef = useRef<HTMLElement>(null);
  useDismiss(open && !atEnd, () => setOpen(false), ref);
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);
  useEffect(() => {
    if (!open || !atEnd) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setClosing(true);
      // Tab goes round the panel's own controls, not out into the dimmed page.
      const drawer = drawerRef.current;
      if (e.key !== 'Tab' || !drawer) return;
      const focusable = [...drawer.querySelectorAll<HTMLElement>('button:not(:disabled), input')].filter(
        (el) => !el.closest('[inert]'),
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (!drawer.contains(document.activeElement) || (e.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    // Over a dimmed page, as Motvin Buddy opens: a click anywhere outside it — the dimmed page, or its own
    // button, which toggles it — closes it.
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!drawerRef.current?.contains(target) && !ref.current?.contains(target)) setClosing(true);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    // The page behind stays still while the panel is open, as under the other modals.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const trigger = ref.current?.querySelector<HTMLElement>('button');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
      document.body.style.overflow = previousOverflow;
      // Closed with the keyboard, focus goes back to the Filters button rather than the top of the page.
      if (!document.activeElement || document.activeElement === document.body || !document.activeElement.isConnected) trigger?.focus({ preventScroll: true });
    };
  }, [open, atEnd]);
  const q = query.trim().toLowerCase();
  // Searching narrows every section to the matching values and drops sections with none.
  const visibleSections = q
    ? sections
        .map((s) => ({ ...s, options: s.options.filter((o) => o.label.toLowerCase().includes(q) || o.value.includes(q)) }))
        .filter((s) => s.options.length > 0)
    : sections;
  const active = sections.reduce((n, s) => n + s.selected.length, 0);
  const expand = (key: string) => setExpanded((cur) => new Set(cur).add(key));
  const collapse = (key: string) =>
    setExpanded((cur) => {
      const next = new Set(cur);
      next.delete(key);
      return next;
    });

  const search = (
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
          if (e.key === 'Escape') close();
        }}
      />
    </div>
  );

  // Beside its button, a popover with the search on top; on the right edge (the app lists), a side panel the
  // size of Motvin Buddy whose top bar is the search itself, beside the close button.
  const wrap = (content: ReactNode) =>
    atEnd ? (
      createPortal(
        <>
          <div className={`ins-fdrawer-backdrop ${closing ? 'is-closing' : ''}`} aria-hidden />
          <aside ref={drawerRef} className={`ins-fdrawer ins-fpanel ${closing ? 'is-closing' : ''}`} role="dialog" aria-modal aria-label="Filters">
            <div className="ins-fdrawer-top">
              {search}
              <button type="button" className="ins-fdrawer-close" onClick={close} aria-label="Close filters" title="Close">
                <CloseIcon size={16} />
              </button>
            </div>
            {content}
          </aside>
        </>,
        // Inside the library's root, so its fonts and colour tokens still apply.
        document.querySelector('.ins-root') ?? document.body,
      )
    ) : (
      <div className="ins-popover ins-fpanel" role="dialog" aria-label="Filters">
        {search}
        {content}
      </div>
    );

  return (
    <div className="ins-popwrap" ref={ref}>
      <button
        type="button"
        className={atEnd ? 'ins-fsort' : `ins-fpill ${active ? 'is-applied' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open && !closing}
        aria-label={active ? `Filters, ${active} applied` : 'Filters'}
        onClick={() => {
          if (open && !closing) {
            close();
            return;
          }
          setQuery('');
          setOpen(true);
          setClosing(false);
        }}
        onKeyDown={(e) => onTriggerKeyDown(e, open, setOpen)}
      >
        {atEnd && <img src="/ASSET/Icons/Motvin/sort-curated.svg" alt="" className="ins-fsort-icon" width={20} height={20} />}
        Filters
        {/* Keyed on the count, so it bumps (CSS) each time a pick changes it. */}
        {active > 0 && <span key={active} className="ins-fpill-more">{active}</span>}
        {!atEnd && <span className="ins-fpill-chev" aria-hidden />}
      </button>
      {open && wrap(
        <>
          <div className="ins-fpanel-body">
            {visibleSections.length === 0 && <p className="ins-popover-empty">No matching filters</p>}
            {visibleSections.map((section, index) => {
              const chips = section.options.map((o) => {
                const on = section.selected.includes(o.value);
                const empty = !on && o.count === 0;
                return {
                  key: o.value,
                  pinned: on,
                  node: (
                    <button
                      key={o.value}
                      type="button"
                      className={`ins-fpanel-option ${on ? 'is-on' : ''} ${empty ? 'is-empty' : ''}`}
                      aria-pressed={on}
                      disabled={empty}
                      title={empty ? 'Nothing matches this with your other filters' : undefined}
                      onClick={() => section.onToggle(o.value)}
                    >
                      {/* Always there, grown in and out (CSS) when picked, so the chip widens smoothly instead of jumping. */}
                      <span className="ins-fpanel-check" aria-hidden>
                        <CheckIcon size={12} strokeWidth={3} />
                      </span>
                      {o.label}
                      {o.count !== undefined && <span className="ins-fpanel-count">{formatCount(o.count)}</span>}
                    </button>
                  ),
                };
              });
              return (
                // --i staggers the sections in, one after another, as the side panel opens.
                <section key={section.key} className="ins-fpanel-section" style={{ '--i': index } as CSSProperties}>
                  <div className="ins-fpanel-section-head">
                    <h3>
                      {section.label}
                      {section.selected.length > 0 && (
                        <span key={section.selected.length} className="ins-fpanel-badge">
                          {section.selected.length}
                        </span>
                      )}
                    </h3>
                    {section.selected.length > 0 && (
                      <button type="button" className="ins-fpanel-link" onClick={section.onClear}>
                        Clear
                      </button>
                    )}
                  </div>
                  {/* A search shows every match; otherwise two rows, then "+N more". */}
                  <TwoRowOptions
                    chips={chips}
                    searching={Boolean(q)}
                    expanded={expanded.has(section.key)}
                    onMore={() => expand(section.key)}
                    onLess={() => collapse(section.key)}
                  />
                </section>
              );
            })}
          </div>
          {/* The side panel's footer rises into view once something is picked (nothing to clear or apply
              before) and slides away when the last pick is cleared; the popover's is always there, with its
              count. Kept in the page while hidden so it can animate both ways, and inert then. */}
          <div
            className={`ins-fpanel-foot ${atEnd ? (active > 0 ? 'is-shown' : 'is-hidden') : ''}`}
            inert={atEnd && active === 0}
          >
            {(atEnd || active > 0) && (
              <button type="button" className="ins-fpanel-link" onClick={onClearAll}>
                Clear all
              </button>
            )}
            <button type="button" className="ins-fpanel-done" onClick={atEnd ? save : close}>
              {/* The side panel's picks apply as they're made; its button just closes it. */}
              {atEnd
                ? 'Save filters'
                : total === null
                  ? 'Done'
                  : total === 0
                    ? 'No matches'
                    : `Show ${formatCount(total)} ${unit}${total === 1 ? '' : 's'}`}
            </button>
          </div>
        </>,
      )}
    </div>
  );
}

/** How long the side panel takes to slide out (insFdrawerOut). */
const DRAWER_OUT_MS = 180;

/** Each applied value as its own pill, so what's narrowing the results is readable from the row. */
/** How many applied filters show as pills before "+N more". */
export const APPLIED_PILLS_MAX = 3;

/**
 * The applied filters, as pills in the toolbar row — at most `max` of them, so a long selection doesn't
 * stack the row into several lines: past that, "+N more" opens the Filters panel, where they all are (and
 * its "Clear all"). Each pill names its section on hover, since the same word can be picked in two ("Modal"
 * a screen, and a UI element).
 */
export function AppliedFilterPills({
  sections,
  max = Infinity,
  onMore,
}: {
  sections: FilterSection[];
  max?: number;
  /** Opens the panel with every filter; without it the pills all show. */
  onMore?: () => void;
}) {
  const { show: showToast } = useToast();
  // The newest sections, for an Undo pressed after the list has re-rendered without the removed value.
  const latest = useRef(sections);
  useEffect(() => {
    latest.current = sections;
  });
  // Removing a pill says so, with a way back: Undo puts the same value back in its section.
  const remove = (section: FilterSection, value: string, label: string) => {
    section.onToggle(value);
    showToast(`Removed ${label}`, {
      action: {
        label: 'Undo',
        onClick: () => {
          const now = latest.current.find((s) => s.key === section.key);
          if (now && !now.selected.includes(value)) now.onToggle(value);
        },
      },
    });
  };
  const applied = sections.flatMap((section) =>
    section.selected.map((value) => ({ section, value, label: section.options.find((o) => o.value === value)?.label ?? value })),
  );
  const limit = onMore ? max : Infinity;
  const shown = applied.slice(0, limit);
  const hidden = applied.length - shown.length;
  return (
    <>
      {shown.map(({ section, value, label }) => (
        <button
          key={`${section.key}:${value}`}
          type="button"
          className="ins-fpill is-applied"
          aria-label={`Remove ${section.label}: ${label}`}
          title={`${section.label}: ${label}`}
          onClick={() => remove(section, value, label)}
        >
          {label}
          <span className="ins-fpill-x" aria-hidden>
            <CloseIcon size={10} strokeWidth={4} />
          </span>
        </button>
      ))}
      {hidden > 0 && (
        <button
          type="button"
          className="ins-fpill ins-fpill--more"
          onClick={onMore}
          aria-label={`${hidden} more filters — open Filters`}
          title={applied.slice(limit).map((a) => a.label).join(', ')}
        >
          <span className="ins-fpill-more-text">+{hidden} more</span>
        </button>
      )}
    </>
  );
}

type Chip = { key: string; node: ReactNode; pinned: boolean };

/** Chips a section shows before its two rows are measured: about what two rows hold in the panel. */
const FIRST_CUT = 5;

/**
 * A section's chips, cut to the two rows that fit, with "+N more" at the end of the second. Chips differ
 * in width, so the cut is measured, not counted: an invisible copy of the whole set, laid out at the same
 * width, says which chips land on the first two rows and how many must give way for the button. Measured in
 * a frame callback (and again whenever the panel's width changes), never by showing everything first, so
 * nothing jumps. A picked chip always stays in view.
 */
function TwoRowOptions({
  chips,
  searching,
  expanded,
  onMore,
  onLess,
}: {
  chips: Chip[];
  /** A search shows every match, with no cut. */
  searching: boolean;
  /** "+N more" was clicked: everything shows, with "Show less" to fold it back. */
  expanded: boolean;
  onMore: () => void;
  onLess: () => void;
}) {
  const all = searching || expanded;
  const measureRef = useRef<HTMLDivElement>(null);
  const [limit, setLimit] = useState<number | null>(null);
  // A pick widens its chip (tick, count), which can move the cut, so it's part of what triggers a new one.
  const keys = chips.map((c) => `${c.key}${c.pinned ? '*' : ''}`).join('|');

  useEffect(() => {
    const el = measureRef.current;
    if (!el || all) return;
    const measure = () => {
      // The chips themselves (their wrappers have no box of their own).
      const items = [...el.querySelectorAll<HTMLElement>('[data-chip] > *')];
      const more = el.querySelector<HTMLElement>('[data-more]');
      if (!items.length || !more) return;
      const tops = [...new Set(items.map((c) => c.offsetTop))].sort((a, b) => a - b);
      if (tops.length <= 2) {
        setLimit(chips.length);
        return;
      }
      // Everything on the first two rows, less as many from the end as the button needs room for.
      let fit = items.filter((c) => c.offsetTop <= tops[1]).length;
      const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
      while (fit > 0) {
        const last = items[fit - 1];
        if (last.offsetTop < tops[1] || last.offsetLeft + last.offsetWidth + gap + more.offsetWidth <= el.clientWidth) break;
        fit -= 1;
      }
      setLimit(fit);
    };
    const frame = requestAnimationFrame(measure);
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
    // `keys` stands in for the chips: a new set of options, or a new pick, is what needs a new cut.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, all]);

  // Until the first measurement (a frame after opening), a short cut rather than every chip, so a long
  // section never flashes open before folding to two rows.
  const cut = all ? chips.length : (limit ?? Math.min(chips.length, FIRST_CUT));
  const shown = chips.filter((c, i) => i < cut || c.pinned);
  const hidden = chips.length - shown.length;

  return (
    <div className="ins-fpanel-options-wrap">
      <div className="ins-fpanel-options">
        {shown.map((c) => c.node)}
        {hidden > 0 && (
          <button type="button" className="ins-fpanel-link ins-fpanel-more" onClick={onMore}>
            +{hidden} more
          </button>
        )}
        {/* The cut measured before expanding still says whether there is anything to fold back. */}
        {expanded && !searching && limit !== null && limit < chips.length && (
          <button type="button" className="ins-fpanel-link ins-fpanel-more" onClick={onLess}>
            Show less
          </button>
        )}
      </div>
      {!all && (
        <div ref={measureRef} className="ins-fpanel-options ins-fpanel-options--measure" aria-hidden inert>
          {chips.map((c) => (
            <span key={c.key} data-chip className="ins-fpanel-measure-item">
              {c.node}
            </span>
          ))}
          <span data-more className="ins-fpanel-link ins-fpanel-more">
            +{chips.length} more
          </span>
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import type { App } from '@/lib/inspirations/types';
import { MENU_ITEM_SELECTOR, onMenuKeyDown, useDismiss } from './FilterToolbar';
import { AppLogo } from './AppLogo';
import { CheckIcon, SearchIcon } from './Icons';

/**
 * The search page's app picker: a search box, a checkbox list of the apps in the results (A–Z, each with its
 * logo) and a Clear / Apply footer. A flat list, not grouped: the platform switch already limits the results to
 * one platform. Nothing ticked means "All apps".
 */

export function AppTreePill({ apps, selected, onApply }: { apps: App[]; selected: string[]; onApply: (appIds: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<string[]>(selected);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);

  useEffect(() => {
    if (open) inputRef.current?.focus({ preventScroll: true });
  }, [open]);

  const q = query.trim().toLowerCase();
  const shown = apps
    .filter((a) => !q || a.name.toLowerCase().includes(q))
    .sort((x, y) => x.name.localeCompare(y.name));
  const toggleApp = (id: string) => setPending((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const label = selected.length ? (apps.find((a) => a.id === selected[0])?.name ?? 'Apps') : 'All apps';

  return (
    <div className="ins-popwrap" ref={ref}>
      <button
        type="button"
        className="ins-fsort"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={selected.length ? `Apps: ${label}` : 'Filter by app'}
        onClick={() => {
          // Opening starts from what's applied, not from checks left behind by a dismissed menu.
          if (!open) {
            setQuery('');
            setPending(selected);
          }
          setOpen((o) => !o);
        }}
      >
        <img src="/ASSET/Icons/Motvin/sort-curated.svg" alt="" className="ins-fsort-icon" width={20} height={20} />
        {label}
        {selected.length > 1 && <span className="ins-fpill-more">+{selected.length - 1}</span>}
      </button>
      {open && (
        <div className={`ins-uielements-menu ins-apptree-menu ${q ? 'is-searching' : ''}`}>
          <div className="ins-uielements-search">
            <SearchIcon size={18} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search apps..."
              aria-label="Search apps"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  optionsRef.current?.querySelector<HTMLElement>(MENU_ITEM_SELECTOR)?.focus({ preventScroll: true });
                }
              }}
            />
          </div>
          <div className="ins-uielements-options" ref={optionsRef} onKeyDown={onMenuKeyDown}>
            {shown.length === 0 ? (
              <p className="ins-popover-empty">No matching apps</p>
            ) : (
              <ul className="ins-flowtree">
                {shown.map((app) => {
                  const checked = pending.includes(app.id);
                  return (
                    <li key={app.id} className="ins-flowtree-node" style={{ '--depth': 0 } as React.CSSProperties}>
                      <div className={`ins-flowtree-row ${checked ? 'is-active' : ''}`}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={checked}
                          className="ins-flowtree-name ins-flowtree-checkbox-name"
                          onClick={() => toggleApp(app.id)}
                        >
                          <span className={`ins-uielements-checkbox ${checked ? 'is-checked' : ''}`} aria-hidden="true">
                            {checked && <CheckIcon size={12} strokeWidth={3} />}
                          </span>
                          <span className="ins-flowtree-label" title={app.name}>
                            {app.name}
                          </span>
                          <AppLogo app={app} size={20} className="ins-apptree-logo" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="ins-flowtree-menu-footer">
            <button type="button" className="ins-flowtree-clear" onClick={() => setPending([])}>
              Clear
            </button>
            <button
              type="button"
              className="ins-flowtree-apply"
              onClick={() => {
                onApply(pending);
                setOpen(false);
              }}
            >
              Apply{pending.length > 0 ? ` (${pending.length})` : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

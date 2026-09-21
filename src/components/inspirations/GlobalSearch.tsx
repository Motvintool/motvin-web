'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { suggestQueries, type SearchSuggestion } from '@/lib/inspirations/search';
import { CloseIcon, SearchIcon } from './Icons';

/**
 * Global search — the heart of the product. Debounced suggestions, keyboard
 * navigation, ⌘K / Ctrl K to focus from anywhere, Enter to run the query.
 */
export function GlobalSearch({ autoFocus = false, className = '' }: { autoFocus?: boolean; className?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get('q') ?? '');
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // Keep the field in sync when the URL query changes (Back/Forward). Adjusts
  // state during render — React's documented pattern for deriving from props.
  const urlQuery = params.get('q') ?? '';
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery);
  if (urlQuery !== seenUrlQuery) {
    setSeenUrlQuery(urlQuery);
    setValue(urlQuery);
  }

  // ⌘K / Ctrl K focuses search; "/" too when not typing elsewhere.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Debounced suggestions.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      suggestQueries(value).then((s: SearchSuggestion[]) => {
        if (!cancelled) {
          setSuggestions(s);
          setActive(-1);
        }
      });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [value, open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const submit = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      const q = value.trim();
      if (!q) return;
      setOpen(false);
      router.push(INSPIRATIONS_ROUTES.searchFor(q));
    },
    [router, value],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === 'Enter' && active >= 0 && suggestions[active]) {
      e.preventDefault();
      setOpen(false);
      router.push(suggestions[active].href);
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div className={`ins-search ${open ? 'is-open' : ''} ${className}`} ref={rootRef} role="search">
      <form onSubmit={submit} className="ins-search-form">
        <SearchIcon size={16} className="ins-search-icon" />
        <input
          ref={inputRef}
          type="search"
          className="ins-search-input"
          placeholder="Search apps, flows & screens"
          value={value}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          aria-label="Search apps, flows and screens"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          role="combobox"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        {value ? (
          <button
            type="button"
            className="ins-search-clear"
            aria-label="Clear search"
            onClick={() => {
              setValue('');
              inputRef.current?.focus();
            }}
          >
            <CloseIcon size={13} />
          </button>
        ) : (
          <span className="ins-kbd-group" aria-hidden>
            <kbd className="ins-kbd">⌘</kbd>
            <kbd className="ins-kbd">K</kbd>
          </span>
        )}
      </form>

      {open && suggestions.length > 0 && (
        <ul className="ins-search-menu" id={listId} role="listbox">
          {!value.trim() && <li className="ins-search-menu-head" aria-hidden>Try searching</li>}
          {suggestions.map((s, i) => (
            <li key={`${s.href}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={`ins-search-item ${i === active ? 'is-active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => {
                  setOpen(false);
                  router.push(s.href);
                }}
              >
                <SearchIcon size={13} className="ins-search-item-icon" />
                <span className="ins-search-item-label">{s.label}</span>
                <span className="ins-search-item-hint">{s.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

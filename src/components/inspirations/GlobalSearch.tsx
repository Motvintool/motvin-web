'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { EMPTY_FILTERS } from '@/lib/inspirations/filters';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { inspirationsApi } from '@/lib/inspirations/api';
import { suggestQueries, type SearchSuggestion } from '@/lib/inspirations/search';
import type { App, Screen } from '@/lib/inspirations/types';
import { CloseIcon, FlowIcon, FolderIcon, GridIcon, LayersIcon, SearchIcon, SparklesIcon } from './Icons';

const FIGMA_APP_ART = '/ASSET/search-modal/figma-02.png';
const FIGMA_SCREEN_CARDS = [
  ['Login', '/ASSET/search-modal/figma-01.png'],
  ['Signup', '/ASSET/search-modal/figma-03.png'],
  ['Home', '/ASSET/search-modal/figma-04.png'],
  ['Dashboard', '/ASSET/search-modal/figma-05.png'],
  ['Search', '/ASSET/search-modal/figma-06.png'],
  ['Checkout', '/ASSET/search-modal/figma-07.png'],
  ['Setting', '/ASSET/search-modal/figma-08.png'],
] as const;
const FIGMA_ELEMENTS = ['Card', 'Toast', 'Banner', 'Dialog', 'Button'];

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
  const [section, setSection] = useState<'top' | 'categories' | 'screens' | 'elements' | 'flows'>('top');
  const [topApps, setTopApps] = useState<App[]>([]);
  const [topScreens, setTopScreens] = useState<Screen[]>([]);
  const [topElements, setTopElements] = useState<{ kind: string; count: number }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const modalInputRef = useRef<HTMLInputElement>(null);
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
        const input = open ? modalInputRef.current : inputRef.current;
        input?.focus();
        input?.select();
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        (open ? modalInputRef.current : inputRef.current)?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (open) modalInputRef.current?.focus();
  }, [open]);

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
    let cancelled = false;
    Promise.all([
      inspirationsApi.listApps(undefined, 'rating'),
      inspirationsApi.listScreens(EMPTY_FILTERS, 0, 'curated'),
      inspirationsApi.listElements(),
    ]).then(([apps, screens, elements]) => {
      if (cancelled) return;
      setTopApps(apps.slice(0, 7));
      setTopScreens(screens.items.slice(0, FIGMA_SCREEN_CARDS.length));
      setTopElements(elements.slice(0, 5));
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!rootRef.current?.contains(target) && !document.querySelector('.ins-search-overlay')?.contains(target)) setOpen(false);
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
    } else if (e.key === 'Enter') {
      // No suggestion highlighted — run the plain query. Handled explicitly
      // rather than left to the browser's implicit submit-on-Enter, which
      // doesn't reliably fire for a `type="search"` input in every
      // environment; every other key here is already explicit, so Enter
      // shouldn't be the one exception.
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const close = () => {
    setOpen(false);
    modalInputRef.current?.blur();
    inputRef.current?.blur();
  };
  const modalSuggestions = suggestions.slice(0, 12);
  const featuredApps = topApps.length
    ? Array.from({ length: 7 }, (_, index) => topApps[index % topApps.length])
    : [];
  const featuredElements = topElements.length
    ? Array.from({ length: 5 }, (_, index) => topElements[index % topElements.length])
    : [];
  const modalSections = [
    { key: 'top' as const, label: 'Top rated', Icon: SparklesIcon },
    { key: 'categories' as const, label: 'Categories', Icon: FolderIcon },
    { key: 'screens' as const, label: 'Screens', Icon: LayersIcon },
    { key: 'elements' as const, label: 'UI Elements', Icon: GridIcon },
    { key: 'flows' as const, label: 'Flows', Icon: FlowIcon },
  ];

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

      {open && typeof document !== 'undefined' && createPortal(
        <div className="ins-search-overlay" onClick={close}>
        <div className="ins-search-modal" id={listId} role="dialog" aria-label="Search results" aria-modal="true" onClick={(event) => event.stopPropagation()}>
          <form className="ins-search-modal-head" onSubmit={submit}>
            <div className="ins-search-modal-field">
              <SearchIcon size={26} />
              <input
                ref={modalInputRef}
                type="search"
                value={value}
                placeholder="Search apps, flows & screens"
                autoComplete="off"
                spellCheck={false}
                aria-label="Search apps, flows and screens"
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={onKeyDown}
              />
            </div>
            <div className="ins-search-modal-platforms" aria-hidden="true">
              <img src="/ASSET/Icons/Motvin/apple.svg" alt="" width={24} height={24} />
              <img src="/ASSET/Icons/Motvin/android.svg" alt="" width={24} height={24} />
              <img src="/ASSET/Icons/Motvin/web.svg" alt="" width={24} height={24} />
            </div>
          </form>
          {!value.trim() && (
            <div className="ins-search-chips" aria-label="Suggested searches">
              <button type="button" onClick={() => setValue('Airbnb')}><img src={FIGMA_APP_ART} alt="" width={28} height={28} />Airbnb</button>
              {[
                ['List', LayersIcon],
                ['Home', GridIcon],
                ['Setting', GridIcon],
                ['Authentication', FlowIcon],
              ].map(([chip, Icon]) => (
                <button key={chip as string} type="button" onClick={() => setValue(chip as string)}><Icon size={20} />{chip}</button>
              ))}
            </div>
          )}
          <div className="ins-search-modal-body">
            <nav className="ins-search-modal-nav" aria-label="Search sections">
              {modalSections.map(({ key, label, Icon }) => (
                <button key={key} type="button" className={section === key ? 'is-active' : ''} onClick={() => setSection(key)}><Icon size={20} />{label}</button>
              ))}
            </nav>
            <div className="ins-search-modal-results" role="listbox">
              {(value.trim() || section !== 'top') && <div className="ins-search-modal-title">{value.trim() ? 'Search results' : section === 'categories' ? 'Categories' : section === 'screens' ? 'New User Experience' : section === 'elements' ? 'UI Elements' : 'Flows'}</div>}
              {!value.trim() && section === 'top' ? (
                <div className="ins-search-top-rated">
                  <div className="ins-search-top-apps" aria-label="Top rated apps">
                    {featuredApps.map((app, index) => (
                      <button key={`${app.id}-${index}`} type="button" onClick={() => { close(); router.push(INSPIRATIONS_ROUTES.app(app)); }}>
                        <img src={FIGMA_APP_ART} alt="" width={82} height={82} />
                        <strong>Airbnb</strong>
                      </button>
                    ))}
                  </div>
                  <div className="ins-search-top-heading">Screens</div>
                  <div className="ins-search-top-screens">
                    {topScreens.map((screen, index) => (
                      <button key={screen.id} type="button" className={index === 0 ? 'is-featured' : ''} onClick={() => { close(); router.push(INSPIRATIONS_ROUTES.screen(screen)); }}>
                        <strong>{FIGMA_SCREEN_CARDS[index][0]}</strong>
                        <img src={FIGMA_SCREEN_CARDS[index][1]} alt="" />
                      </button>
                    ))}
                  </div>
                  <div className="ins-search-top-heading">UI Elements</div>
                  <div className="ins-search-top-elements">
                    {featuredElements.map((element, index) => <button key={`${element.kind}-${index}`} type="button" onClick={() => router.push(`${INSPIRATIONS_ROUTES.uiElements}?kind=${encodeURIComponent(element.kind)}`)}>{FIGMA_ELEMENTS[index]}</button>)}
                  </div>
                </div>
              ) : (
                <div className="ins-search-modal-list">
                  {modalSuggestions.map((s, i) => (
                  <button
                    key={`${s.href}-${i}`}
                    type="button"
                    className={`ins-search-modal-item ${i === active ? 'is-active' : ''}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => { close(); router.push(s.href); }}
                  >
                    <span className="ins-search-modal-item-mark">{s.label.slice(0, 1)}</span>
                    <span><strong>{s.label}</strong><small>{s.hint}</small></span>
                  </button>
                  ))}
                  {modalSuggestions.length === 0 && (
                    <div className="ins-search-modal-empty">Start typing to search the library</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        </div>
      , document.body)}
    </div>
  );
}

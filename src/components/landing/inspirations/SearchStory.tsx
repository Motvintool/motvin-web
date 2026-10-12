'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { AppGallery, type GalleryItem } from './AppGallery';
import type { LandingApp } from './useLandingLibrary';

/** Searches that return plenty of real screens in the library. `label` is what gets typed; `q` is what is searched. */
const QUERIES = [
  { label: 'Login screens', q: 'login' },
  { label: 'Checkout flows', q: 'checkout' },
  { label: 'Empty states', q: 'empty state' },
  { label: 'Onboarding', q: 'onboarding' },
  { label: 'Delivery address', q: 'delivery address' },
  { label: 'Permission prompts', q: 'permission' },
  { label: 'Settings pages', q: 'settings' },
];

const RESULTS = 8;
const TYPE_MS = 55;
const DELETE_MS = 24;
const HOLD_MS = 2800;

type Shot = { id: string; src: string; appId: string };

/** Up to eight phone screens for each query, fetched once. */
function useQueryShots(): Record<string, Shot[]> {
  const [shots, setShots] = useState<Record<string, Shot[]>>({});

  useEffect(() => {
    let cancelled = false;
    QUERIES.forEach(({ q }) => {
      inspirationsApi
        .search(q, undefined, undefined, { limit: 24 })
        .then((res) => {
          if (cancelled) return;
          const phones = res.screens.filter((s) => s.platform === 'ios');
          // One screen per app first, so the row shows variety.
          const seen = new Set<string>();
          const picked = [
            ...phones.filter((s) => (seen.has(s.appId) ? false : (seen.add(s.appId), true))),
            ...phones,
          ]
            .filter((s, i, all) => all.findIndex((t) => t.id === s.id) === i)
            .slice(0, RESULTS)
            .map((s) => ({ id: s.id, src: inspirationsApi.mediaUrl(s.url) ?? '', appId: s.appId }))
            .filter((s) => s.src);
          setShots((prev) => ({ ...prev, [q]: picked }));
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return shots;
}

/** The library's app covers, shown in the gallery until the first search has results. */
function coverItems(apps: LandingApp[]): GalleryItem[] {
  return apps.map((app) => ({
    key: app.id,
    src: app.cover,
    wide: app.wide,
    href: app.href,
    title: app.name,
    subtitle: app.industry,
    logo: app.logo,
  }));
}

/**
 * Motvin search demo: a search bar that types real queries by itself, and the
 * gallery below filled with what each one finds.
 * The gallery keeps the last results on show while the next query is typed.
 */
export function SearchStory({ apps }: { apps: LandingApp[] }) {
  const shots = useQueryShots();
  const rootRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(0);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState('');
  const [visible, setVisible] = useState(false);
  // Becomes true the first time the story is on screen, so the underline draws once.
  const [seen, setSeen] = useState(false);
  // The query whose results the gallery is showing; null until the first one lands.
  const [shownQuery, setShownQuery] = useState<string | null>(null);

  // Only animate while the story or its gallery is on screen.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
      if (entry.isIntersecting) setSeen(true);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Type a query, show what it finds, delete it, move on to the next one.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    void (async () => {
      await sleep(0);
      if (reduce) {
        if (cancelled) return;
        setIndex(0);
        setTyped(QUERIES[0].label);
        setShownQuery(QUERIES[0].q);
        return;
      }
      while (!cancelled) {
        const i = indexRef.current;
        const label = QUERIES[i].label;
        setIndex(i);
        for (let n = 1; n <= label.length; n++) {
          if (cancelled) return;
          setTyped(label.slice(0, n));
          await sleep(TYPE_MS);
        }
        await sleep(120);
        if (cancelled) return;
        setShownQuery(QUERIES[i].q);
        await sleep(HOLD_MS);
        await sleep(400);
        for (let n = label.length - 1; n >= 0; n--) {
          if (cancelled) return;
          setTyped(label.slice(0, n));
          await sleep(DELETE_MS);
        }
        indexRef.current = (i + 1) % QUERIES.length;
        await sleep(200);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible]);

  const query = QUERIES[index];
  const byId = new Map(apps.map((app) => [app.id, app]));
  const found = shownQuery ? (shots[shownQuery] ?? []) : [];
  const resultItems: GalleryItem[] = found.map((shot) => {
    const app = byId.get(shot.appId);
    return {
      key: shot.id,
      src: shot.src,
      wide: false,
      href: app?.href ?? INSPIRATIONS_ROUTES.searchFor(shownQuery ?? ''),
      title: app?.name ?? 'Motvin Inspirations',
      subtitle: app?.industry ?? '',
      logo: app?.logo ?? null,
    };
  });
  const items = resultItems.length ? resultItems : coverItems(apps);
  const shownLabel = QUERIES.find((entry) => entry.q === shownQuery)?.label;

  return (
    <div ref={rootRef}>
      <section className={`lpi-story${seen ? ' is-seen' : ''}`}>
        <div className="lpi-story-inner">
          <span className="lpi-story-chip">
            <span className="lpi-story-dots" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
            Motvin Search
            <span className="lpi-story-chip-sep" aria-hidden="true" />
            <span className="lpi-story-chip-note">iOS &amp; web</span>
          </span>

          <h2 className="lpi-story-title">
            Stop digging through screenshots.
            <br />
            <span className="is-muted">Search</span>{' '}
            <span className="is-accent">
              real apps
              <svg className="lpi-story-underline" viewBox="0 0 300 18" preserveAspectRatio="none" aria-hidden="true">
                <path d="M3 13 C 60 5, 140 3, 297 9" pathLength={1} />
              </svg>
            </span>{' '}
            <span className="is-muted">instead.</span>
          </h2>

          <Link
            href={INSPIRATIONS_ROUTES.searchFor(query.q)}
            className="lpi-searchbar"
            aria-label={`Search Motvin Inspirations for ${query.label}`}
          >
            <svg className="lpi-searchbar-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <span className="lpi-searchbar-text" aria-hidden="true">
              {typed ? typed : <span className="lpi-searchbar-placeholder">Search apps, flows &amp; screens</span>}
              <span className="lpi-searchbar-caret" />
            </span>
            <kbd className="lpi-searchbar-kbd" aria-hidden="true">⌘ K</kbd>
            <span className="lpi-searchbar-go" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="m13 6 6 6-6 6" />
              </svg>
            </span>
          </Link>
        </div>
      </section>

      <AppGallery
        items={items}
        label={shownLabel ? `Screens found for ${shownLabel}` : 'Apps in Motvin Inspirations'}
      />
    </div>
  );
}

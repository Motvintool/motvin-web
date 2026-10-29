'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import { EMPTY_FILTERS } from '@/lib/inspirations/filters';
import { rankSimilar } from '@/lib/inspirations/similarScreens';
import { screenTypeLabel } from '@/lib/inspirations/taxonomy';
import { isDesktopPlatform, type App, type Flow, type Screen, type ScreenType } from '@/lib/inspirations/types';
import { AppLogo } from './AppLogo';
import { FloatCollectionBar } from './FloatCollectionBar';
import { Screenshot } from './Screenshot';
import { useApps } from './useApps';
import { useScreenContextMenu } from './useScreenContextMenu';

/** The section a screen's similar screens come from: Webs (web apps and websites) or iOS. */
const sectionOf = (screen: Screen): Screen['platform'][] => (isDesktopPlatform(screen.platform) ? ['webapp', 'web'] : ['ios']);

/** How many the grid holds: a 3 × 3 grid of wide web pages, 5 × 3 of phones, this screen in the middle. */
const cellsOf = (screen: Screen) => (isDesktopPlatform(screen.platform) ? 9 : 15);

// One load per screen type and section, shared: the screen view asks ahead (to show "Scroll to similar" only
// when there's something to see), so the grid opens on screens already fetched. Each is kept once it arrives
// too, so a grid whose data is in can draw it at once — no empty first frame, no reshuffle when flows land.
const candidateLoads = new Map<string, Promise<Screen[]>>();
const candidatesIn = new Map<string, Screen[]>();
const candidateKey = (screen: Screen) => `${screen.screenType}:${sectionOf(screen).join(',')}`;
export function similarCandidates(screen: Screen): Promise<Screen[]> {
  const key = candidateKey(screen);
  let load = candidateLoads.get(key);
  if (!load) {
    load = inspirationsApi
      .listScreens({ ...EMPTY_FILTERS, platforms: sectionOf(screen), screenTypes: [screen.screenType as ScreenType] }, 0, 'curated', { limit: 80 })
      .then((page) => {
        candidatesIn.set(key, page.items);
        return page.items;
      });
    // A failed load isn't kept, so the next ask tries again.
    load.catch(() => candidateLoads.delete(key));
    candidateLoads.set(key, load);
  }
  return load;
}

// Every flow, for ranking by journey: loaded once, indexed once — each screen to the most specific journey
// it's a step of (the task, "Logging in", over its section, "Onboarding").
let flowsLoad: Promise<Map<string, Flow>> | null = null;
let flowsIn: Map<string, Flow> | null = null;
function similarFlows(): Promise<Map<string, Flow>> {
  if (!flowsLoad) {
    flowsLoad = inspirationsApi.listFlows().then((flows) => {
      const index = new Map<string, Flow>();
      for (const flow of flows) {
        for (const id of flow.screenIds) {
          const had = index.get(id);
          if (!had || (flow.parentId && !had.parentId)) index.set(id, flow);
        }
      }
      flowsIn = index;
      return index;
    });
    flowsLoad.catch(() => (flowsLoad = null));
  }
  return flowsLoad;
}

const rank = (current: Screen, currentFlow: Flow | null, candidates: Screen[], flows: Map<string, Flow>) => {
  const flowOf = (id: string) => flows.get(id) ?? null;
  return rankSimilar(current, flowOf(current.id) ?? currentFlow, candidates, flowOf, cellsOf(current) - 1);
};

/** The grid's screens, if everything they're ranked from is already in; else null. */
function similarNow(current: Screen, currentFlow: Flow | null): Screen[] | null {
  const candidates = candidatesIn.get(candidateKey(current));
  return candidates && flowsIn ? rank(current, currentFlow, candidates, flowsIn) : null;
}

async function loadSimilar(current: Screen, currentFlow: Flow | null): Promise<Screen[]> {
  const [candidates, flows] = await Promise.all([similarCandidates(current), similarFlows()]);
  return rank(current, currentFlow, candidates, flows);
}

/** Whether any other app in the screen's section has a screen of its type (and the flows, fetched alongside). */
export async function hasSimilar(screen: Screen): Promise<boolean> {
  void similarFlows().catch(() => undefined);
  return (await similarCandidates(screen)).some((s) => s.appId !== screen.appId);
}

// Fetches and decodes the grid's screenshots ahead — on the first sign of zooming out (the pill hovered, the
// first scroll down) — so they're drawn as the zoom plays, not after it. Once per screen.
const warmed = new Set<string>();
export function warmSimilar(screen: Screen): void {
  if (warmed.has(screen.id)) return;
  warmed.add(screen.id);
  void loadSimilar(screen, null)
    .then((list) => {
      for (const s of list) {
        const src = inspirationsApi.mediaUrl(s.url);
        if (!src) continue;
        const img = new Image();
        img.src = src;
        void img.decode().catch(() => undefined);
      }
    })
    .catch(() => warmed.delete(screen.id));
}

/**
 * The screen view zoomed out: the screen being looked at, smaller, in the middle of a grid of the same
 * screen from other apps — on its own section only (web screens in Webs, iPhone ones in iOS), the same
 * step of the same kind of flow first. Picking one zooms into it; picking this screen zooms back.
 */
export function SimilarScreens({
  current,
  currentFlow,
  onPick,
  onBack,
  onSummary,
}: {
  current: Screen;
  currentFlow: Flow | null;
  onPick: (screen: Screen) => void;
  onBack: () => void;
  /** What the grid shows, for the header that names it: "Login screens in other apps". */
  onSummary?: (summary: { title: string }) => void;
}) {
  const web = isDesktopPlatform(current.platform);
  const cells = cellsOf(current);
  const apps = useApps();

  // Drawn at once when its data is in (asked ahead by the screen view), else once it all arrives — never in
  // two steps, so the screens don't shuffle as they appear.
  const [loaded, setLoaded] = useState<{ id: string; list: Screen[] } | null>(() => {
    const list = similarNow(current, currentFlow);
    return list ? { id: current.id, list } : null;
  });
  const ready = loaded?.id === current.id;
  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    loadSimilar(current, currentFlow)
      .catch(() => [] as Screen[])
      .then((list) => !cancelled && setLoaded({ id: current.id, list }));
    return () => {
      cancelled = true;
    };
  }, [ready, current, currentFlow]);
  const others = useMemo(() => (ready && loaded ? loaded.list : []), [ready, loaded]);
  // This screen sits in the middle (or as near it as a short list allows).
  const middle = Math.min(Math.floor(cells / 2), Math.floor(others.length / 2) + (others.length % 2));
  const grid: Array<{ screen: Screen; isCurrent: boolean }> = others.map((screen) => ({ screen, isCurrent: false }));
  grid.splice(middle, 0, { screen: current, isCurrent: true });

  // Ticked screens (the circle, or Save), saved together from the collection bar — as on the app page's grid.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelection = (id: string) =>
    setSelectedIds((now) => {
      const next = new Set(now);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectedScreens = others.filter((screen) => selectedIds.has(screen.id));
  // Escape with screens ticked clears the ticks first (the screen view's own Escape would leave the grid).
  const hasSelection = selectedIds.size > 0;
  useEffect(() => {
    if (!hasSelection) return;
    const onKey = (e: KeyboardEvent) => {
      // A right-click menu open over the grid closes first, on its own.
      if (e.key !== 'Escape' || document.querySelector('.ins-context-menu')) return;
      e.stopPropagation();
      setSelectedIds(new Set());
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [hasSelection]);

  const waiting = !ready;
  const blanks = (n: number, side: string) => Array.from({ length: n }, (_, i) => <span key={`${side}-${i}`} className="ins-similar-blank" aria-hidden />);

  const typeLabel = screenTypeLabel(current.screenType).toLowerCase();
  const title = waiting ? 'Finding similar screens…' : others.length ? `${screenTypeLabel(current.screenType)} screens in other apps` : `No other app has ${typeLabel} screens yet`;
  useEffect(() => {
    onSummary?.({ title });
  }, [onSummary, title]);
  return (
    <div className={`ins-similar ${web ? 'is-web' : ''}`} role="region" aria-label={`${screenTypeLabel(current.screenType)} screens in other apps`}>
      <div className="ins-similar-grid" role="list">
        {/* While the others load, their places hold soft blanks round this screen, so the grid doesn't jump. */}
        {waiting && blanks(Math.floor(cells / 2), 'before')}
        {grid.map(({ screen, isCurrent }, i) => (
          <SimilarCell
            key={screen.id}
            screen={screen}
            app={apps.get(screen.appId)}
            isCurrent={isCurrent}
            step={Math.abs(i - middle)}
            label={isCurrent ? 'Back to this screen' : `Open ${apps.get(screen.appId)?.name ?? 'this app'}'s ${typeLabel} screen`}
            onOpen={() => (isCurrent ? onBack() : onPick(screen))}
            selected={selectedIds.has(screen.id)}
            onToggleSelect={() => toggleSelection(screen.id)}
          />
        ))}
        {waiting && blanks(cells - 1 - Math.floor(cells / 2), 'after')}
      </div>
      {selectedScreens.length > 0 && (
        <FloatCollectionBar
          screens={selectedScreens}
          // The ticked screens are from different apps: each shows its own logo.
          apps={selectedScreens
            .map((screen) => apps.get(screen.appId))
            .filter((app): app is App => Boolean(app))
            .reverse()}
          onClose={() => setSelectedIds(new Set())}
          onSaved={() => setSelectedIds(new Set())}
        />
      )}
    </div>
  );
}

/**
 * One screen in the grid. The others are a screen card's own (ScreenCard): the select circle, and on hover the
 * app's logo, name and tagline over a fade with Save (ticks it for the collection bar) and Copy (the PNG), and
 * its right-click menu. This screen, ringed, only goes back.
 */
function SimilarCell({
  screen,
  app,
  isCurrent,
  step,
  label,
  onOpen,
  selected,
  onToggleSelect,
}: {
  screen: Screen;
  app?: App;
  isCurrent: boolean;
  step: number;
  label: string;
  onOpen: () => void;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  // The link the menu copies: this page with the screen open (`screen` is ScreenPreviewModal's SCREEN_PARAM,
  // written out — that file imports this one).
  const shotMenu = useScreenContextMenu(screen, app ?? null, () => `${window.location.origin}${window.location.pathname}?screen=${screen.id}`);
  return (
    <div
      role="listitem"
      className={`ins-card ins-similar-cell ${isCurrent ? 'is-current' : ''} ${selected ? 'is-selected' : ''} ${screen.style?.includes('dark') ? 'is-dark-shot' : ''}`}
      style={{ '--i': step } as CSSProperties}
    >
      <span className="ins-similar-shot" onContextMenu={isCurrent ? undefined : shotMenu.onContextMenu}>
        {!isCurrent && (
          <button
            type="button"
            className={`ins-card-select-ring ${selected ? 'is-selected' : ''}`}
            aria-label={selected ? `Remove ${app?.name ?? 'this'} screen from selection` : `Select ${app?.name ?? 'this'} screen`}
            aria-pressed={selected}
            onClick={onToggleSelect}
          >
            {selected && <span className="ins-card-select-check" aria-hidden />}
          </button>
        )}
        <button type="button" className="ins-similar-open" aria-label={label} onClick={onOpen}>
          <Screenshot screen={screen} priority={step < 4} />
        </button>
        {!isCurrent && (
          <span className="ins-card-hover-footer">
            {app && (
              <span className="ins-card-hover-app">
                <AppLogo app={app} size={48} className="ins-card-hover-logo" />
                <span className="ins-card-hover-app-text">
                  <span className="ins-card-hover-title">{app.name}</span>
                  {app.tagline && <span className="ins-card-hover-tagline">{app.tagline}</span>}
                </span>
              </span>
            )}
            <span className="ins-card-hover-actions">
              <button type="button" className="ins-btn-save" onClick={() => !selected && onToggleSelect()}>
                {selected ? 'Saved' : 'Save'}
              </button>
              <button type="button" className="ins-btn-copy" onClick={(e) => void shotMenu.copyPng(e)}>
                Copy
              </button>
            </span>
          </span>
        )}
      </span>
      {shotMenu.menu}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';

import { inspirationsApi } from '@/lib/inspirations/api';
import type { App, Platform, Screen } from '@/lib/inspirations/types';
import { savedAppId } from '@/lib/inspirations/savedApps';
import { AppCard } from './AppCard';
import { WebCard } from './WebCard';
import { EmptyState } from './EmptyState';
import { FloatCollectionBar } from './FloatCollectionBar';
import { FolderIcon } from './Icons';

import { useAppSelection } from './useAppSelection';
import { ScreenGridSkeleton } from './Skeletons';

/** How many cards come in at a time, as the visitor scrolls. */
const PAGE = 8;
const EMPTY_CARDS = new Map<string, Screen[]>();

/**
 * A grid of app cards — each showing one of the app's own screens, same as
 * ScreenCard (see AppCard.tsx) — with click-through to that app's detail
 * page. Shared by AppsView (the dedicated /apps page) and FilteredGallery's
 * "By app" sort, so browsing by app looks and behaves the same everywhere.
 *
 * Also owns the selection session behind the float-collection bar: checking
 * a card here is the only way to reach it, so the Set lives at this level
 * and both the cards (to render checked/unchecked) and the bar (to render
 * the logo stack and save into a real collection) read from it.
 */
export function AppsGrid({
  apps,
  loading = false,
  emptyTitle = 'No apps to show',
  emptyDescription,
  emptyAction,
  emptyPlay = false,
  webLayout = false,
  platforms,
}: {
  apps: App[];
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: { label: string; href?: string; onClick?: () => void };
  /** The empty grid is a no-match (filters found nothing): show the playful empty state. */
  emptyPlay?: boolean;
  webLayout?: boolean;
  /** The platforms being browsed: an app on several shows only these platforms' screens on its card (and its card opens on them). */
  platforms?: readonly Platform[];
}) {
  const { selected, toggle, clear } = useAppSelection();

  // The cards come in pages as the visitor scrolls: each page asks only for
  // its apps' card screens (inspirationsApi.appCards), so the first cards show
  // without waiting for the whole list. Cards already known stay up when the
  // list changes (a filter, a sort) instead of dropping back to placeholders —
  // that flash shook the page under the Filters panel on every pick.
  const platformsKey = platforms?.join(',') ?? '';
  const [want, setWant] = useState(PAGE);
  const [known, setKnown] = useState<{ platforms: string; cards: Map<string, Screen[]> }>(() => ({ platforms: platformsKey, cards: new Map() }));
  const cards = known.platforms === platformsKey ? known.cards : EMPTY_CARDS;
  const missing = apps.slice(0, want).map((a) => a.id).filter((id) => !cards.has(id));
  const missingKey = missing.join(',');

  useEffect(() => {
    if (!missingKey) return;
    let cancelled = false;
    const ids = missingKey.split(',');
    const chunks = Array.from({ length: Math.ceil(ids.length / PAGE) }, (_, i) => ids.slice(i * PAGE, (i + 1) * PAGE));
    Promise.all(chunks.map((chunk) => inspirationsApi.appCards(chunk, platformsKey ? platformsKey.split(',') : undefined)))
      // An app whose card screens couldn't be read shows its card without them rather than holding the grid.
      .catch(() => [new Map(ids.map((id) => [id, [] as Screen[]]))])
      .then((answers) => {
        if (cancelled) return;
        setKnown((prev) => ({
          platforms: platformsKey,
          cards: new Map([...(prev.platforms === platformsKey ? prev.cards : []), ...answers.flatMap((m) => [...m])]),
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [missingKey, platformsKey]);

  // The cards shown: those wanted so far, up to the first still loading, so none jump into place out of order.
  const firstMissing = apps.findIndex((a, i) => i < want && !cards.has(a.id));
  const shownApps = apps.slice(0, firstMissing === -1 ? Math.min(want, apps.length) : firstMissing);
  const more = shownApps.length < apps.length;

  // Near the end of the shown cards, the next page is wanted.
  // Held in state, not a ref: the marker comes and goes with `more`, and a new one must be watched again.
  const [endEl, setEndEl] = useState<HTMLDivElement | null>(null);
  const canGrow = more && missing.length === 0;
  useEffect(() => {
    const el = endEl;
    if (!el || !canGrow) return;
    const near = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setWant((w) => w + PAGE);
    }, { rootMargin: '800px 0px' });
    near.observe(el);
    return () => near.disconnect();
  }, [endEl, canGrow, shownApps.length]);

  if (loading || (shownApps.length === 0 && apps.length > 0)) {
    // On the cards' own grid (and web layout), one placeholder per app being
    // loaded — a row of five while the list itself is still on its way — so
    // neither the columns nor the count jump when the cards land.
    return <ScreenGridSkeleton count={Math.min(apps.length || 5, PAGE)} apps web={webLayout} />;
  }

  if (!loading && apps.length === 0) {
    return (
      <EmptyState
        play={emptyPlay}
        icon={<FolderIcon size={22} />}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  // Most-recently-checked first, so the bar's logo stack fronts whichever
  // app the user just checked rather than whichever rendered first in the
  // grid — Set iterates in insertion order, so this is just a reverse.
  const selectedApps = [...selected]
    .reverse()
    .map((id) => apps.find((a) => a.id === id))
    .filter((a): a is App => !!a);

  return (
    <>
      <div className={`ins-grid ins-app-grid ${webLayout ? 'ins-web-grid' : ''}`} role="list">
        {shownApps.map((app) => (
          webLayout ? <WebCard
            key={app.id}
            app={app}
            previewScreens={cards.get(app.id)}
            selected={selected.has(app.id)}
            selectable
            onToggleSelect={() => toggle(app.id)}
          /> : <AppCard
            key={app.id}
            app={app}
            previewScreens={cards.get(app.id)}
            selected={selected.has(app.id)}
            selectable
            onToggleSelect={() => toggle(app.id)}
          />
        ))}
      </div>
      {more && (
        <div ref={setEndEl} className="ins-app-grid-more">
          {missing.length > 0 && <ScreenGridSkeleton count={Math.min(apps.length - shownApps.length, PAGE)} apps web={webLayout} />}
        </div>
      )}
      {selectedApps.length > 0 && (
        <FloatCollectionBar
          apps={selectedApps}
          // An app on several platforms is saved as the one this grid shows.
          items={selectedApps.map((app) => ({ type: 'app' as const, id: savedAppId(app.id, app.platforms.find((p) => platforms?.includes(p)), app.platforms.length > 1 && Boolean(platforms?.length)) }))}
          onClose={clear}
          onSaved={clear}
        />
      )}
    </>
  );
}

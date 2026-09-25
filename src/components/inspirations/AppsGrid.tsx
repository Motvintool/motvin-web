'use client';

import { coverScreen } from '@/lib/inspirations/cover';

import { inspirationsApi } from '@/lib/inspirations/api';
import type { App } from '@/lib/inspirations/types';
import { AppCard } from './AppCard';
import { EmptyState } from './EmptyState';
import { FloatCollectionBar } from './FloatCollectionBar';
import { FolderIcon } from './Icons';

import { useAppSelection } from './useAppSelection';
import { useAsync } from './useAsync';
import { ScreenGridSkeleton } from './Skeletons';

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
}: {
  apps: App[];
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: { label: string; href?: string; onClick?: () => void };
}) {
  const key = apps.map((a) => a.id).join(',');
  const { data: previews, loading: previewsLoading } = useAsync(async () => {
    // AppCard shows one of the app's own screens on its card, the same as a
    // screen card — so each app needs its first screen alongside its record.
    const details = await Promise.all(apps.map((app) => inspirationsApi.getApp(app.id)));
    return new Map(apps.map((app, i) => [app.id, coverScreen(details[i]?.screens ?? [])]));
  }, `apps-grid-previews:${key}`);
  const { selected, toggle, clear } = useAppSelection();

  if (loading || previewsLoading) {
    return <ScreenGridSkeleton count={4} />;
  }

  if (!loading && !previewsLoading && apps.length === 0) {
    return (
      <EmptyState
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
      <div className="ins-grid" role="list">
        {apps.map((app) => (
          <AppCard
            key={app.id}
            app={app}
            preview={previews?.get(app.id)}
            selected={selected.has(app.id)}
            selectable
            onToggleSelect={() => toggle(app.id)}
          />
        ))}
      </div>
      {selectedApps.length > 0 && <FloatCollectionBar apps={selectedApps} onClose={clear} onSaved={clear} />}
    </>
  );
}

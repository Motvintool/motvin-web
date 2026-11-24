'use client';

import { inSection, isWebsiteItem, readSavedAppId } from '@/lib/inspirations/savedApps';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { browsedPlatforms } from '@/lib/inspirations/filters';
import { useState } from 'react';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { isDesktopPlatform, type App, type Collection, type SavedItemType } from '@/lib/inspirations/types';
import { AppLogo } from './AppLogo';
import { askConfirm } from './ConfirmDialog';
import { useToast } from './Toast';
import { inspirationsApi } from '@/lib/inspirations/api';
import { useAsync } from './useAsync';
import { useDeleteCollection } from './useDeleteCollection';
import { useLibrary } from './useLibrary';

/**
 * Collection board tile: up to four cover screens, name, item count, and
 * inline rename/delete. Opens the saved view filtered to the collection.
 */
export function CollectionCard({ collection, apps }: { collection: Collection; apps: Map<string, App> }) {
  const { renameCollection } = useLibrary();
  const deleteWithUndo = useDeleteCollection();
  const { show } = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(collection.name);
  // The section's items only (Apps: iOS; Webs: the web), as the collection itself shows them.
  const section = browsedPlatforms(useSearchParams());
  const appPlatforms = new Map([...apps.values()].map((app) => [app.id, app.platforms]));
  const items = collection.items.filter((item) => inSection(item, section, appPlatforms));
  // Opening it keeps the section (Webs opens the collection's web side).
  const openHref = `${INSPIRATIONS_ROUTES.collections}?collection=${collection.id}${section.every(isDesktopPlatform) ? '&platform=web' : ''}`;
  const coverApps = items
    .filter((item) => item.type === 'app')
    // "claude@webapp": the app it names (saved on one of its platforms).
    .map((item) => apps.get(readSavedAppId(item.id).appId))
    .filter((app): app is App => Boolean(app))
    .slice(-3);
  const coverPositions = ['back', 'middle', 'front'].slice(-coverApps.length);
  const coverAppsByPosition = new Map(coverPositions.map((position, index) => [position, coverApps[index]]));
  // A site's saved full pages and sections are counted apart from app screens, each by its own name; which is
  // which comes from the site sections list (the Sites page's own request, so it is read once).
  const siteItems = items.filter((item) => isWebsiteItem(item, appPlatforms));
  const { data: siteSections } = useAsync(
    () => (siteItems.length ? inspirationsApi.listSiteScreens('section', '', 1000) : Promise.resolve([])),
    siteItems.length ? 'sites:section' : 'sites:none',
  );
  const sectionIds = new Set((siteSections ?? []).map((s) => s.id));
  const sectionCount = siteItems.filter((item) => sectionIds.has(item.id)).length;
  const pageCount = siteSections ? siteItems.length - sectionCount : 0;
  const counts = items.reduce<Record<SavedItemType, number>>(
    (total, item) => (isWebsiteItem(item, appPlatforms) ? total : { ...total, [item.type]: total[item.type] + 1 }),
    { screen: 0, app: 0, flow: 0, pattern: 0, component: 0, icon: 0, storeShots: 0 },
  );
  // Every kind saved, by count. An empty collection says so ("0 Apps · 0 Screens · 0 Flows"); otherwise the line
  // keeps only what is there, and past three kinds ends in "+N more" so it fits one line (the full list on hover).
  const parts = [
    `${counts.app} ${counts.app === 1 ? 'App' : 'Apps'}`,
    `${counts.screen} ${counts.screen === 1 ? 'Screen' : 'Screens'}`,
    ...(pageCount ? [`${pageCount} ${pageCount === 1 ? 'Full Page' : 'Full Pages'}`] : []),
    ...(sectionCount ? [`${sectionCount} ${sectionCount === 1 ? 'Section' : 'Sections'}`] : []),
    ...(counts.storeShots ? [`${counts.storeShots} ${counts.storeShots === 1 ? 'Screenshot set' : 'Screenshot sets'}`] : []),
    `${counts.flow} ${counts.flow === 1 ? 'Flow' : 'Flows'}`,
    ...(counts.component ? [`${counts.component} ${counts.component === 1 ? 'UI element' : 'UI elements'}`] : []),
    ...(counts.pattern ? [`${counts.pattern} ${counts.pattern === 1 ? 'Pattern' : 'Patterns'}`] : []),
  ];
  const saved = parts.filter((part) => !part.startsWith('0 '));
  const rest = saved.slice(3).reduce((sum, part) => sum + parseInt(part, 10), 0);
  const details = !saved.length ? parts.filter((part) => /Apps|Screens|Flows/.test(part)) : rest ? [...saved.slice(0, 3), `+${rest} more`] : saved;

  const commit = () => {
    if (!editing) return;
    const next = name.trim();
    if (next && next !== collection.name) {
      const final = renameCollection(collection.id, next);
      show(final && final !== next ? `Renamed to “${final}” — that name was taken` : 'Collection renamed');
      if (final) setName(final);
    } else setName(collection.name);
    setEditing(false);
  };

  return (
    <div className="ins-collection-card">
      <Link href={openHref} className="ins-collection-covers" aria-label={`Open ${collection.name}`}>
        {['back', 'middle', 'front'].map((position) => {
          const app = coverAppsByPosition.get(position);
          return (
            <span key={position} className={`ins-collection-cover-layer ins-collection-cover-layer--${position}`}>
              {app && <AppLogo app={app} size={200} />}
            </span>
          );
        })}
        <span className="ins-collection-cover-fade" />
      </Link>
      <div className="ins-collection-meta">
        {/* Renaming edits the name where it stands, in its own type: no box or
            ring, the counts line kept under it. Enter or leaving it saves;
            Escape puts the old name back. */}
        <div className="ins-collection-text">
          {editing ? (
            <form
              className="ins-collection-rename"
              onSubmit={(e) => {
                e.preventDefault();
                commit();
              }}
            >
              <input
                className="ins-collection-name ins-collection-name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onFocus={(e) => {
                  // A blinking cursor after the name, nothing selected.
                  const end = e.currentTarget.value.length;
                  e.currentTarget.setSelectionRange(end, end);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setName(collection.name);
                    setEditing(false);
                  }
                }}
                autoFocus
                aria-label="Collection name"
                maxLength={48}
                onBlur={commit}
              />
            </form>
          ) : (
            <p className="ins-collection-name" title={collection.name}>
              {/* Opens it too, as the covers do; one tab stop is enough. */}
              <Link href={openHref} className="ins-collection-name-link" tabIndex={-1}>
                {collection.name}
              </Link>
            </p>
          )}
          <p className="ins-collection-sub" title={saved.length > 3 ? saved.join(' · ') : undefined}>
            {details.join(' · ')}
          </p>
        </div>
        <div className="ins-collection-actions">
          <button type="button" className="ins-iconbtn ins-iconbtn--plain" aria-label="Rename collection" onClick={() => setEditing(true)}>
            <img src="/ASSET/Icons/Motvin/edit.svg" alt="" width={16} height={16} />
          </button>
          <button
            type="button"
            className="ins-iconbtn ins-iconbtn--plain"
            aria-label="Delete collection"
            onClick={() => {
              void askConfirm({
                title: `Delete “${collection.name}”?`,
                description: 'This will delete the collection and everything saved in it.',
                confirmLabel: 'Delete collection',
              }).then((ok) => {
                if (!ok) return;
                deleteWithUndo(collection.id);
              });
            }}
          >
            <img src="/ASSET/Icons/Motvin/delete.svg" alt="" width={16} height={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

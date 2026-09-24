'use client';

import Link from 'next/link';
import { useState } from 'react';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import type { App, Collection, SavedItemType } from '@/lib/inspirations/types';
import { AppLogo } from './AppLogo';
import { useLibrary } from './useLibrary';

/**
 * Collection board tile: up to four cover screens, name, item count, and
 * inline rename/delete. Opens the saved view filtered to the collection.
 */
export function CollectionCard({ collection, apps }: { collection: Collection; apps: Map<string, App> }) {
  const { renameCollection, deleteCollection } = useLibrary();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(collection.name);
  const coverApps = collection.items
    .filter((item) => item.type === 'app')
    .map((item) => apps.get(item.id))
    .filter((app): app is App => Boolean(app))
    .slice(-3);
  const coverPositions = ['back', 'middle', 'front'].slice(-coverApps.length);
  const coverAppsByPosition = new Map(coverPositions.map((position, index) => [position, coverApps[index]]));
  const counts = collection.items.reduce<Record<SavedItemType, number>>(
    (total, item) => ({ ...total, [item.type]: total[item.type] + 1 }),
    { screen: 0, app: 0, flow: 0, pattern: 0, component: 0, icon: 0 },
  );
  const details = [
    `${counts.app} ${counts.app === 1 ? 'App' : 'Apps'}`,
    `${counts.screen} ${counts.screen === 1 ? 'Screen' : 'Screens'}`,
    `${counts.flow} ${counts.flow === 1 ? 'Flow' : 'Flows'}`,
  ];

  const commit = () => {
    renameCollection(collection.id, name);
    setEditing(false);
  };

  return (
    <div className="ins-collection-card">
      <Link href={`${INSPIRATIONS_ROUTES.collections}?collection=${collection.id}`} className="ins-collection-covers" aria-label={`Open ${collection.name}`}>
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
        {editing ? (
          <form
            className="ins-collection-rename"
            onSubmit={(e) => {
              e.preventDefault();
              commit();
            }}
          >
            <input className="ins-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-label="Collection name" maxLength={48} onBlur={commit} />
          </form>
        ) : (
          <div className="ins-collection-text">
            <p className="ins-collection-name">{collection.name}</p>
            <p className="ins-collection-sub">{details.join(' · ')}</p>
          </div>
        )}
        <div className="ins-collection-actions">
          <button type="button" className="ins-iconbtn ins-iconbtn--plain" aria-label="Rename collection" onClick={() => setEditing(true)}>
            <img src="/ASSET/Icons/Motvin/colletion-edit.svg" alt="" width={20} height={20} />
          </button>
          <button
            type="button"
            className="ins-iconbtn ins-iconbtn--plain"
            aria-label="Delete collection"
            onClick={() => {
              if (window.confirm(`Delete "${collection.name}"?`)) deleteCollection(collection.id);
            }}
          >
            <img src="/ASSET/Icons/Motvin/colletion-delete.svg" alt="" width={20} height={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

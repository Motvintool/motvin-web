'use client';

import Link from 'next/link';
import { useState } from 'react';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import type { Collection, Screen } from '@/lib/inspirations/types';
import { FolderIcon, PencilIcon, TrashIcon } from './Icons';
import { Screenshot } from './Screenshot';
import { useLibrary } from './useLibrary';

/**
 * Collection board tile: up to four cover screens, name, item count, and
 * inline rename/delete. Opens the saved view filtered to the collection.
 */
export function CollectionCard({ collection, covers }: { collection: Collection; covers: Screen[] }) {
  const { renameCollection, deleteCollection } = useLibrary();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(collection.name);

  const commit = () => {
    renameCollection(collection.id, name);
    setEditing(false);
  };

  return (
    <div className="ins-collection-card">
      <Link href={`${INSPIRATIONS_ROUTES.saved}?collection=${collection.id}`} className="ins-collection-covers" aria-label={`Open ${collection.name}`}>
        {covers.slice(0, 4).map((s) => (
          <div className="ins-collection-thumb" key={s.id}>
            <Screenshot screen={s} />
          </div>
        ))}
        {covers.length === 0 && (
          <div className="ins-collection-empty">
            <FolderIcon size={22} />
          </div>
        )}
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
            <p className="ins-collection-sub">{collection.items.length} {collection.items.length === 1 ? 'item' : 'items'}</p>
          </div>
        )}
        <div className="ins-collection-actions">
          <button type="button" className="ins-iconbtn ins-iconbtn--plain" aria-label="Rename collection" onClick={() => setEditing(true)}>
            <PencilIcon size={14} />
          </button>
          <button
            type="button"
            className="ins-iconbtn ins-iconbtn--plain"
            aria-label="Delete collection"
            onClick={() => {
              if (window.confirm(`Delete "${collection.name}"? Items stay in Saved.`)) deleteCollection(collection.id);
            }}
          >
            <TrashIcon size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

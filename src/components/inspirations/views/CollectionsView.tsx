'use client';

import { useState, type FormEvent } from 'react';
import { SCREEN_BY_ID } from '@/lib/inspirations/data/build';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import type { Screen } from '@/lib/inspirations/types';
import { CollectionCard } from '../CollectionCard';
import { EmptyState } from '../EmptyState';
import { FolderIcon, PlusIcon } from '../Icons';
import { PageHeading } from '../PageHeading';
import { useLibrary } from '../useLibrary';

const STARTERS = ['My Inspiration', 'Dashboard Ideas', 'Checkout References', 'AI Products', 'Mobile Navigation'];

/** /inspirations/collections — the user's visual boards. */
export function CollectionsView() {
  const { collections, createCollection } = useLibrary();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createCollection(name);
    setName('');
    setCreating(false);
  };

  return (
    <>
      <PageHeading
        title="Collections"
        count={collections.length ? String(collections.length) : undefined}
        actions={
          creating ? (
            <form className="ins-inline-form" onSubmit={onCreate}>
              <input className="ins-input" placeholder="Collection name" value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-label="New collection name" maxLength={48} />
              <button type="submit" className="ins-btn ins-btn--primary">Create</button>
              <button type="button" className="ins-btn ins-btn--ghost" onClick={() => setCreating(false)}>Cancel</button>
            </form>
          ) : (
            <button type="button" className="ins-btn ins-btn--primary" onClick={() => setCreating(true)}>
              <PlusIcon size={15} /> New collection
            </button>
          )
        }
      />

      {collections.length === 0 ? (
        <>
          <EmptyState
            icon={<FolderIcon size={22} />}
            title="No collections yet"
            description="Collections are visual boards. Save screens, apps, flows and patterns into them as you explore."
            action={{ label: 'Start exploring', href: INSPIRATIONS_ROUTES.explore }}
          />
          <div className="ins-starters">
            <p className="ins-muted">Start with a board:</p>
            <div className="ins-chips">
              {STARTERS.map((s) => (
                <button key={s} type="button" className="ins-chip" onClick={() => createCollection(s)}>
                  <PlusIcon size={12} /> {s}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="ins-collection-grid">
          {collections.map((c) => (
            <CollectionCard
              key={c.id}
              collection={c}
              covers={c.items.filter((i) => i.type === 'screen').map((i) => SCREEN_BY_ID.get(i.id)).filter((s): s is Screen => Boolean(s))}
            />
          ))}
        </div>
      )}
    </>
  );
}

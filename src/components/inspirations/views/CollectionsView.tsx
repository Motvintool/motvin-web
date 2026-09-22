'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { CollectionCard } from '../CollectionCard';
import { EmptyState } from '../EmptyState';
import { FolderIcon, PlusIcon } from '../Icons';
import { useApps } from '../useApps';
import { useLibrary } from '../useLibrary';

const STARTERS = ['My Inspiration', 'Dashboard Ideas', 'Checkout References', 'AI Products', 'Mobile Navigation'];

/** /inspirations/collections — the visitor's own boards, stored in this browser. */
export function CollectionsView() {
  const { collections, createCollection } = useLibrary();
  const apps = useApps();
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
    <section className="ins-collections-page">
      <header className="ins-collections-header">
        <div className="ins-collections-heading">
          <Link href={INSPIRATIONS_ROUTES.explore} className="ins-collections-back" aria-label="Back to inspirations">
            <img src="/ASSET/Icons/Motvin/colletion-back.svg" alt="" width={58} height={58} />
          </Link>
          <h1 className="ins-title">Collections</h1>
        </div>
        <div className="ins-collections-actions">
          {creating ? (
            <form className="ins-collections-create" onSubmit={onCreate}>
              <input
                className="ins-collections-create-input"
                placeholder="Collection Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                aria-label="New collection name"
                maxLength={48}
              />
              <button type="button" className="ins-collections-cancel" onClick={() => setCreating(false)}>
                Cancel
              </button>
            </form>
          ) : (
            <button type="button" className="ins-collections-new" onClick={() => setCreating(true)}>
              <img src="/ASSET/Icons/Motvin/colletion-new.svg" alt="" width={16} height={16} />
              New collection
            </button>
          )}
        </div>
      </header>

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
            <CollectionCard key={c.id} collection={c} apps={apps} />
          ))}
        </div>
      )}
    </section>
  );
}

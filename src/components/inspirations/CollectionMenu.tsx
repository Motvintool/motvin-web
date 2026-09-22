'use client';

import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import type { SavedItemType } from '@/lib/inspirations/types';
import { CheckIcon, FolderIcon, PlusIcon } from './Icons';
import { useToast } from './Toast';
import { useLibrary } from './useLibrary';

/**
 * "+ Collection" popover. Lists the user's boards with check marks for the
 * ones already containing this item, plus an inline "New collection" form.
 */
export function CollectionMenu({
  type,
  id,
  variant = 'icon',
  align = 'right',
  className = '',
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: {
  type: SavedItemType;
  id: string;
  variant?: 'icon' | 'button';
  align?: 'left' | 'right';
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}) {
  const { collections, collectionsContaining, createCollection, toggleInCollection } = useLibrary();
  const { show } = useToast();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const inside = new Set(collectionsContaining(type, id).map((c) => c.id));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  const toggle = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(!open);
    setCreating(false);
  };

  const onPick = (collectionId: string, collectionName: string) => {
    const added = toggleInCollection(collectionId, { type, id });
    show(added ? `Added to ${collectionName}` : `Removed from ${collectionName}`);
  };

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!name.trim()) return;
    const c = createCollection(name);
    toggleInCollection(c.id, { type, id });
    show(`Added to ${c.name}`);
    setName('');
    setCreating(false);
    setOpen(false);
  };

  return (
    <div className={`ins-popwrap ${className}`} ref={rootRef} onClick={(e) => e.stopPropagation()}>
      {!hideTrigger && (variant === 'icon' ? (
        <button type="button" className={`ins-iconbtn ${inside.size ? 'is-active' : ''}`} aria-label="Add to collection" aria-expanded={open} aria-haspopup="menu" title="Add to collection" onClick={toggle}>
          <PlusIcon size={15} />
        </button>
      ) : (
        <button type="button" className="ins-btn" aria-expanded={open} aria-haspopup="menu" onClick={toggle}>
          <FolderIcon size={15} />
          <span>Add to Collection</span>
        </button>
      ))}

      {open && (
        <div className={`ins-popover ins-popover--${align}`} role="menu" aria-label="Collections">
          <p className="ins-popover-title">Add to collection</p>
          {collections.length === 0 && !creating && (
            <p className="ins-popover-empty">No collections yet.</p>
          )}
          <ul className="ins-popover-list">
            {collections.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={inside.has(c.id)}
                  className="ins-popover-item"
                  onClick={(e) => {
                    e.preventDefault();
                    onPick(c.id, c.name);
                  }}
                >
                  <FolderIcon size={14} />
                  <span className="ins-popover-item-label">{c.name}</span>
                  <span className="ins-popover-item-count">{c.items.length}</span>
                  {inside.has(c.id) && <CheckIcon size={14} className="ins-popover-check" />}
                </button>
              </li>
            ))}
          </ul>
          {creating ? (
            <form className="ins-popover-form" onSubmit={onCreate}>
              <input
                ref={inputRef}
                className="ins-input"
                placeholder="Collection name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="New collection name"
                maxLength={48}
              />
              <button type="submit" className="ins-btn ins-btn--primary ins-btn--sm">Create</button>
            </form>
          ) : (
            <button type="button" className="ins-popover-item ins-popover-item--new" onClick={() => setCreating(true)}>
              <PlusIcon size={14} />
              <span>New collection</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { type MouseEvent, useState } from 'react';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import type { SavedItemType } from '@/lib/inspirations/types';
import { useToast } from './Toast';
import { useLibrary } from './useLibrary';
import { FloatCollectionBar } from './FloatCollectionBar';

/**
 * Save toggle used on cards, detail pages and panels. `icon` is the floating
 * card action; `button` and `pill` carry a label for detail pages.
 */
export function SaveButton({
  type,
  id,
  variant = 'icon',
  className = '',
  label,
}: {
  type: SavedItemType;
  id: string;
  variant?: 'icon' | 'button' | 'pill';
  className?: string;
  label?: string;
}) {
  const { collectionsContaining, toggleInCollection, deleteCollection } = useLibrary();
  const { show } = useToast();
  const router = useRouter();
  const [floatOpen, setFloatOpen] = useState(false);
  const [floatRemovedOpen, setFloatRemovedOpen] = useState(false);
  const saved = collectionsContaining(type, id).length > 0;

  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (saved) {
      const collections = collectionsContaining(type, id);
      collections.forEach(c => {
        toggleInCollection(c.id, { type, id });
        if (c.items.length === 1) deleteCollection(c.id);
      });
      setFloatRemovedOpen(true);
      setTimeout(() => setFloatRemovedOpen(false), 1600);
    } else {
      setFloatOpen(true);
    }
  };

  const text = label ?? (saved ? 'Saved' : 'Save');

  const floats = (
    <>
      {floatOpen && (
        <FloatCollectionBar
          items={[{ type, id }]}
          onClose={() => setFloatOpen(false)}
          onSaved={() => setFloatOpen(false)}
        />
      )}
      {floatRemovedOpen && (
        <div className="ins-float-collection" role="status" aria-live="polite">
          <div className="ins-float-collection-success">
            <span className="ins-float-collection-success-check" aria-hidden>
              <span />
            </span>
            Removed from collection
          </div>
        </div>
      )}
    </>
  );

  if (variant === 'icon') {
    return (
      <>
        <button
          type="button"
          className={`ins-iconbtn ${saved ? 'is-active' : ''} ${className}`}
          aria-label={saved ? 'Remove from saved' : 'Save'}
          aria-pressed={saved}
          title={saved ? 'Saved' : 'Save'}
          onClick={onClick}
        >
          <img src={`/ASSET/Icons/Motvin/${saved ? 'saved.svg' : 'unsaved.svg'}`} alt="" width={16} height={16} />
        </button>
        {floats}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`ins-btn ${variant === 'pill' ? 'ins-btn--pill' : ''} ${saved ? 'is-active' : ''} ${className}`}
        aria-pressed={saved}
        onClick={onClick}
      >
        <img src={`/ASSET/Icons/Motvin/${saved ? 'saved.svg' : 'unsaved.svg'}`} alt="" width={16} height={16} />
        <span>{text}</span>
      </button>
      {floats}
    </>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { forwardRef, type MouseEvent, useState } from 'react';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import type { App, SavedItemType } from '@/lib/inspirations/types';
import { useLibrary } from './useLibrary';
import { sameItem, useRemoveWithUndo } from './useRemoveWithUndo';
import { FloatCollectionBar } from './FloatCollectionBar';

/**
 * Save toggle used on cards, detail pages and panels. `icon` is the floating
 * card action; `button` and `pill` carry a label for detail pages.
 *
 * `app`, when given, is only for the float bar's logo stack (the same face
 * ScreenGrid's bulk-select bar shows via `screenApp`) — a single Save here
 * always saves the one `{type, id}` item regardless of it.
 *
 * Forwards its ref to the underlying `<button>` so callers that also wire up
 * a keyboard shortcut (ScreenPreviewModal's `S`) can trigger the exact same
 * click handler instead of duplicating the saved/unsaved branching.
 */
export const SaveButton = forwardRef<HTMLButtonElement, {
  type: SavedItemType;
  id: string;
  variant?: 'icon' | 'button' | 'pill';
  className?: string;
  label?: string;
  app?: App;
}>(function SaveButton({
  type,
  id,
  variant = 'icon',
  className = '',
  label,
  app,
}, ref) {
  const { collectionsContaining } = useLibrary();
  const router = useRouter();
  const [floatOpen, setFloatOpen] = useState(false);
  const removeWithUndo = useRemoveWithUndo();
  const saved = collectionsContaining(type, id).length > 0;

  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (saved) {
      // Out of every collection it's in; the collections themselves stay,
      // even if this was the last thing in one.
      removeWithUndo(collectionsContaining(type, id).map((c) => ({ collectionId: c.id, match: sameItem(type, id) })));
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
          apps={app ? [app] : undefined}
          onClose={() => setFloatOpen(false)}
          onSaved={() => setFloatOpen(false)}
        />
      )}
    </>
  );

  if (variant === 'icon') {
    return (
      <>
        <button
          ref={ref}
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
        ref={ref}
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
});

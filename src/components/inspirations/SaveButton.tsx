'use client';

import { useRouter } from 'next/navigation';
import type { MouseEvent } from 'react';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import type { SavedItemType } from '@/lib/inspirations/types';
import { BookmarkIcon } from './Icons';
import { useToast } from './Toast';
import { useLibrary } from './useLibrary';

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
  const { isSaved, toggleSaved } = useLibrary();
  const { show } = useToast();
  const router = useRouter();
  const saved = isSaved(type, id);

  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const nowSaved = toggleSaved(type, id);
    show(nowSaved ? 'Saved' : 'Removed from saved', nowSaved ? { label: 'View', onClick: () => router.push(INSPIRATIONS_ROUTES.saved) } : undefined);
  };

  const text = label ?? (saved ? 'Saved' : 'Save');

  if (variant === 'icon') {
    return (
      <button
        type="button"
        className={`ins-iconbtn ${saved ? 'is-active' : ''} ${className}`}
        aria-label={saved ? 'Remove from saved' : 'Save'}
        aria-pressed={saved}
        title={saved ? 'Saved' : 'Save'}
        onClick={onClick}
      >
        <BookmarkIcon filled={saved} size={15} />
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`ins-btn ${variant === 'pill' ? 'ins-btn--pill' : ''} ${saved ? 'is-active' : ''} ${className}`}
      aria-pressed={saved}
      onClick={onClick}
    >
      <BookmarkIcon filled={saved} size={15} />
      <span>{text}</span>
    </button>
  );
}

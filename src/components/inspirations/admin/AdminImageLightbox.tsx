'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from '../Icons';

/**
 * Full-screen view of one stored screen image, opened from the admin tabs'
 * thumbnails. ScreenLightbox needs a published Screen record; the admin lists
 * hold bare stored files, so this takes just an image URL and a label and
 * reuses the same overlay look (.ins-lightbox). Closes on Escape, the close
 * button or a click outside the image; the page behind does not scroll.
 */

function subscribeNever() {
  return () => {};
}

export function AdminImageLightbox({ url, label, onClose }: { url: string; label: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const restore = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      restore?.focus?.();
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="ins-portal ins-lightbox" role="presentation">
      <div className="ins-lightbox-backdrop" onClick={onClose} />
      <div className="ins-lightbox-dialog" role="dialog" aria-modal="true" aria-label={`${label} — enlarged`}>
        <button ref={closeRef} type="button" className="ins-lightbox-close" aria-label="Close" onClick={onClose}>
          <CloseIcon size={18} />
        </button>
        <div className="ins-lightbox-shot" style={{ cursor: 'default' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={label} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

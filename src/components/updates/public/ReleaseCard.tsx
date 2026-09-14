'use client';

import { useCallback } from 'react';
import type { ReleaseNote } from '@/lib/firebase/updates';

/**
 * One release-note article — public feed layout ported from
 * motvin-ui/updates/script.110f497c05.js renderUpdate(). Sidebar carries a
 * sticky title + date; main column carries the image, description, changes
 * list and a share button that uses the Web Share API with a clipboard
 * fallback.
 */

type Props = {
  note: ReleaseNote;
  /** Position in the feed — feeds the staggered `animation-delay`. */
  index: number;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function releaseId(note: ReleaseNote): string {
  return note.share?.slug || slugify(note.title) || note.id;
}

function formatDate(date: Date | null): string {
  if (!date) return '';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function collectChangeItems(changes: NonNullable<ReleaseNote['changes']> = {}): string[] {
  return [
    ...(changes.features ?? []),
    ...(changes.improvements ?? []),
    ...(changes.fixes ?? []),
  ];
}

export function ReleaseCard({ note, index }: Props) {
  const changeItems = collectChangeItems(note.changes ?? {});
  const shareUrl =
    typeof window !== 'undefined'
      ? (() => {
          const url = new URL(window.location.href);
          url.searchParams.set('release', releaseId(note));
          return url.toString();
        })()
      : '#';
  const shareTitle = note.share?.title || note.title;
  const shareSummary =
    note.share?.summary || note.description || 'See what changed in Motvin.';

  const share = useCallback(
    async (button: HTMLButtonElement) => {
      try {
        if (typeof navigator !== 'undefined' && navigator.share) {
          await navigator.share({
            title: shareTitle,
            text: `${shareTitle} — ${shareSummary}`,
            url: shareUrl,
          });
          button.textContent = 'Shared';
        } else {
          await navigator.clipboard.writeText(shareUrl);
          button.textContent = 'Link copied';
        }
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        console.error('Share failed:', err);
      }
      window.setTimeout(() => {
        button.textContent = 'Share';
      }, 1800);
    },
    [shareTitle, shareSummary, shareUrl],
  );

  return (
    <article
      className="update"
      data-release-id={releaseId(note)}
      style={{ animationDelay: `${index * 0.07}s` }}
    >
      <div className="update-grid">
        <div className="update-sidebar">
          <div className="update-sidebar-sticky">
            <a className="update-title-link" href={shareUrl}>
              <h2 className="update-title">{note.title}</h2>
            </a>
            <time className="update-date">{formatDate(note.date)}</time>
          </div>
        </div>
        <div className="update-main">
          {note.image && (
            <div className="update-image">
              <img src={note.image} alt={note.title} loading="lazy" />
            </div>
          )}
          {note.description && <p className="update-desc">{note.description}</p>}
          {changeItems.length > 0 && (
            <div className="changes">
              <h3 className="changes-title">Changes</h3>
              <ul className="change-list change-list-flat">
                {changeItems.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="update-meta-row">
            <button
              className="update-share update-share-minimal"
              type="button"
              onClick={(e) => share(e.currentTarget)}
            >
              Share
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

'use client';

import { useCallback } from 'react';
import type { ReleaseNote } from '@/lib/firebase/updates';

/**
 * One release in the feed (first ported from motvin-ui/updates renderUpdate()).
 * The side column pins the date and title while the release scrolls past;
 * the main column holds the screenshot, the description, the list of
 * changes and a share button that uses the Web Share API with a clipboard
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

/** Every change in the release, in one list: features, then improvements, then fixes. */
function collectChangeItems(changes: NonNullable<ReleaseNote['changes']> = {}): string[] {
  return [...(changes.features ?? []), ...(changes.improvements ?? []), ...(changes.fixes ?? [])];
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
          button.dataset.label = 'Shared';
        } else {
          await navigator.clipboard.writeText(shareUrl);
          button.dataset.label = 'Link copied';
        }
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        console.error('Share failed:', err);
      }
      window.setTimeout(() => {
        delete button.dataset.label;
      }, 1800);
    },
    [shareTitle, shareSummary, shareUrl],
  );

  return (
    <article className="upd-entry" data-release-id={releaseId(note)} style={{ animationDelay: `${index * 0.07}s` }}>
      {/* Date and title, pinned while the release scrolls past. */}
      <div className="upd-entry-side">
        <div className="upd-entry-sticky">
          <span className="upd-entry-date">
            {index === 0 ? <span className="upd-latest">Latest</span> : null}
            <time>{formatDate(note.date)}</time>
          </span>
          <a className="upd-entry-title" href={shareUrl}>
            <h2>{note.title}</h2>
          </a>
        </div>
      </div>

      <div className="upd-card">
        {note.image && (
          <div className="upd-card-image">
            <img src={note.image} alt={note.title} loading="lazy" decoding="async" />
          </div>
        )}
        {note.description && <p className="upd-card-desc">{note.description}</p>}
        {changeItems.length > 0 && (
          <div className="upd-changes">
            <h3>Changes</h3>
            <ul>
              {changeItems.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="upd-card-foot">
          {/* The label swaps to "Shared" / "Link copied" for a moment (data-label). */}
          <button className="upd-share" type="button" onClick={(e) => share(e.currentTarget)}>
            <span>Share</span>
          </button>
        </div>
      </div>
    </article>
  );
}

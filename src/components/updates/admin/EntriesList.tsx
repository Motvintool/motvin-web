'use client';

import { slugifyRelease, type ReleaseNote } from '@/lib/firebase/updates';

/**
 * Sidebar list of published release notes — clicking a card starts editing
 * that entry. Loading / empty / error states mirror the reference at
 * admin.html:154-159 + admin.js load flow.
 */

type Props = {
  notes: ReleaseNote[];
  status: 'loading' | 'ready' | 'error';
  activeId: string | null;
  onEdit: (note: ReleaseNote) => void;
};

function formatDate(date: Date | null): string {
  if (!date) return '';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function EntriesList({ notes, status, activeId, onEdit }: Props) {
  return (
    <div className="entry-list">
      {status === 'loading' && (
        <div className="loading-state loading-state-compact">
          <div className="loading-spinner" />
          Loading existing notes...
        </div>
      )}
      {status === 'error' && (
        <div className="error-state">Unable to load release notes.</div>
      )}
      {status === 'ready' && notes.length === 0 && (
        <div className="empty-state">No release notes published yet.</div>
      )}
      {status === 'ready' &&
        notes.map((note) => (
          <button
            key={note.id}
            type="button"
            className={`entry-card${activeId === note.id ? ' is-active' : ''}`}
            onClick={() => onEdit(note)}
          >
            <span className="entry-title">{note.title}</span>
            <span className="entry-meta">
              {formatDate(note.date)} · {note.share?.slug || slugifyRelease(note.title)}
            </span>
            {note.description && <span className="entry-desc">{note.description}</span>}
          </button>
        ))}
    </div>
  );
}

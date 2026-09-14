'use client';

import { EntriesList } from './EntriesList';
import type { ReleaseNote } from '@/lib/firebase/updates';

/**
 * Admin sidebar section wrapping EntriesList with its own panel head.
 */

type Props = {
  notes: ReleaseNote[];
  status: 'loading' | 'ready' | 'error';
  activeId: string | null;
  onEdit: (note: ReleaseNote) => void;
};

export function EntriesPanel({ notes, status, activeId, onEdit }: Props) {
  return (
    <section className="admin-panel admin-panel-compact">
      <div className="panel-head panel-head-compact">
        <div>
          <h2 className="panel-title">Existing release notes</h2>
          <p className="panel-copy">Pick an entry to edit or remove it from the feed.</p>
        </div>
      </div>
      <EntriesList notes={notes} status={status} activeId={activeId} onEdit={onEdit} />
    </section>
  );
}

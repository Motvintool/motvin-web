'use client';

import type { AdminRecord, ReleaseNote } from '@/lib/firebase/updates';
import { AdminAccessPanel } from './AdminAccessPanel';
import { EntriesPanel } from './EntriesPanel';
import { SidebarInfoPanels } from './SidebarInfoPanels';

/**
 * Admin sidebar column — entries picker, owner-only admin allowlist, and the
 * static explainer cards. Composition only; every state slice is owned by the
 * parent page.
 */

type Props = {
  notes: ReleaseNote[];
  notesState: 'loading' | 'ready' | 'error';
  editingId: string | null;
  onEdit: (note: ReleaseNote) => void;
  isOwner: boolean;
  admins: AdminRecord[];
  onAddAdmin: (email: string) => Promise<void>;
  onRemoveAdmin: (email: string) => Promise<void>;
};

export function AdminSidebar({
  notes,
  notesState,
  editingId,
  onEdit,
  isOwner,
  admins,
  onAddAdmin,
  onRemoveAdmin,
}: Props) {
  return (
    <aside className="admin-sidebar">
      <EntriesPanel
        notes={notes}
        status={notesState}
        activeId={editingId}
        onEdit={onEdit}
      />
      {isOwner && (
        <AdminAccessPanel admins={admins} onAdd={onAddAdmin} onRemove={onRemoveAdmin} />
      )}
      <SidebarInfoPanels />
    </aside>
  );
}

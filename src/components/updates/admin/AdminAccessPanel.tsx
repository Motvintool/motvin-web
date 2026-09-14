'use client';

import { useState, type FormEvent } from 'react';
import { isOwnerAdmin, OWNER_ADMIN_EMAILS, type AdminRecord } from '@/lib/firebase/updates';

/**
 * Owner-only "Allowed admins" panel — invite or revoke publisher access.
 * Rendered by the admin page and never shown to non-owners.
 */

type Props = {
  admins: AdminRecord[];
  onAdd: (email: string) => Promise<void>;
  onRemove: (email: string) => Promise<void>;
};

function formatDate(date: Date | null | undefined): string {
  if (!date) return '';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

type Row = { email: string; kind: 'owner' | 'admin'; addedAt?: Date | null };

const OWNER_ROWS: Row[] = OWNER_ADMIN_EMAILS.map((email) => ({ email, kind: 'owner' }));

export function AdminAccessPanel({ admins, onAdd, onRemove }: Props) {
  const [email, setEmail] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    await onAdd(email);
    setEmail('');
  };

  const rows: Row[] = [
    ...OWNER_ROWS,
    ...admins
      .filter((a) => !isOwnerAdmin(a.email))
      .map<Row>((a) => ({ email: a.email, kind: 'admin', addedAt: a.addedAt })),
  ];

  return (
    <section className="admin-panel admin-panel-compact">
      <div className="panel-head panel-head-compact">
        <div>
          <h2 className="panel-title">Allowed admins</h2>
          <p className="panel-copy">
            Only these accounts can publish, edit, or delete release notes.
          </p>
        </div>
      </div>

      <form className="admin-access-form" onSubmit={submit}>
        <label className="field">
          <span className="field-label">Add admin email</span>
          <input
            className="field-input"
            type="email"
            placeholder="person@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button className="nav-btn" type="submit">
          Add admin
        </button>
      </form>

      <div className="entry-list admin-access-list">
        {rows.map((row) => (
          <div
            key={row.email}
            className={`entry-card${row.kind === 'owner' ? ' is-active' : ''}`}
          >
            <span className="entry-title">{row.email}</span>
            <span className="entry-meta">
              {row.kind === 'owner'
                ? 'Owner access'
                : row.addedAt
                  ? `Added ${formatDate(row.addedAt)}`
                  : 'Admin access'}
            </span>
            {row.kind === 'admin' && (
              <button
                type="button"
                className="nav-link nav-link-button nav-link-danger"
                onClick={() => onRemove(row.email)}
                style={{ marginTop: 8 }}
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

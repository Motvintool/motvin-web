'use client';

import { useState } from 'react';
import { adminApi, type AdminSourceRecord, type AdminState } from '@/lib/inspirations/admin';
import { PERMISSION_LABEL_SHORT } from '@/lib/inspirations/taxonomy';
import { CheckIcon } from '../Icons';

/**
 * The licensing gate, as a form.
 *
 * An app's screenshots are published only once its entry here is approved, and
 * the backend refuses to approve one without a permission basis. Licence,
 * licence URL and attribution are optional: they are shown on the screen page
 * when present, but several honest bases have no licence string to quote.
 * That is the point of this screen: it is where someone records the right to
 * show each product's UI, per app.
 */

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  review: 'In review',
  approved: 'Approved — published',
  rejected: 'Rejected',
};

const EMPTY: AdminSourceRecord = {
  sourceUrl: '',
  capturedAt: '',
  capturedBy: '',
  permission: '',
  license: '',
  licenseUrl: '',
  attribution: '',
  redistribution: 'view-only',
  status: 'pending',
  notes: '',
};

export function LicensingPanel({
  state,
  busy,
  run,
}: {
  state: AdminState;
  busy: boolean;
  run: (action: () => Promise<unknown>, onDone?: () => void) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState(state.apps[0]?.id ?? '');
  const [draft, setDraft] = useState<AdminSourceRecord>({ ...EMPTY, ...state.sources[state.apps[0]?.id ?? ''] });
  const [loadedFor, setLoadedFor] = useState(state.apps[0]?.id ?? '');

  // Swap the form when a different app is picked, without an effect.
  if (selected !== loadedFor) {
    setLoadedFor(selected);
    setDraft({ ...EMPTY, ...state.sources[selected] });
  }

  const set = (patch: Partial<AdminSourceRecord>) => setDraft((d) => ({ ...d, ...patch }));

  const approving = draft.status === 'approved';
  // Licence, licence URL and attribution are recorded when known but do not
  // gate approval: the permission basis is what says why this may be shown.
  const missing: string[] = approving && !draft.permission ? ['a permission basis'] : [];
  const thin = approving && (!draft.license?.trim() || !draft.attribution?.trim());

  const save = () => {
    if (!selected) return;
    void run(() => adminApi.saveSource(selected, draft));
  };

  if (state.apps.length === 0) {
    return <p className="ins-muted ins-admin-status">Add an app first; licensing is recorded per app.</p>;
  }

  return (
    <div className="ins-admin-panel">
      <p className="ins-admin-note">
        Screens stay unpublished until their app is approved here. Only the permission basis is required;
        the rest is recorded when you know it. Do not approve material you do not have the right to show.
      </p>

      <div className="ins-admin-row">
        <label className="ins-field">
          <span className="ins-field-label">App</span>
          <select className="ins-input" value={selected} onChange={(e) => setSelected(e.target.value)}>
            {state.apps.map((app) => {
              const status = state.sources[app.id]?.status ?? 'none';
              return (
                <option key={app.id} value={app.id}>
                  {app.name} — {status === 'none' ? 'no entry' : STATUS_LABEL[status] ?? status}
                </option>
              );
            })}
          </select>
        </label>

        <label className="ins-field">
          <span className="ins-field-label">Status</span>
          <select
            className="ins-input"
            value={draft.status}
            onChange={(e) => set({ status: e.target.value as AdminSourceRecord['status'] })}
          >
            {state.vocabulary.reviewStatuses.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s] ?? s}
              </option>
            ))}
          </select>
        </label>

        <label className="ins-field">
          <span className="ins-field-label">Visitors may</span>
          <select
            className="ins-input"
            value={draft.redistribution}
            onChange={(e) => set({ redistribution: e.target.value as AdminSourceRecord['redistribution'] })}
          >
            <option value="view-only">View only</option>
            <option value="allowed">View and download</option>
          </select>
        </label>
      </div>

      <div className="ins-admin-row">
        <label className="ins-field">
          <span className="ins-field-label">Permission basis{approving ? ' (required)' : ''}</span>
          <select className="ins-input" value={draft.permission} onChange={(e) => set({ permission: e.target.value })}>
            <option value="">Not recorded</option>
            {state.vocabulary.permissions.map((p) => (
              <option key={p} value={p}>
                {PERMISSION_LABEL_SHORT[p] ?? p}
              </option>
            ))}
          </select>
        </label>

        <label className="ins-field">
          <span className="ins-field-label">Licence (optional)</span>
          <input
            className="ins-input"
            value={draft.license}
            onChange={(e) => set({ license: e.target.value })}
            placeholder="CC BY 4.0"
          />
        </label>

        <label className="ins-field">
          <span className="ins-field-label">Licence URL (optional)</span>
          <input
            className="ins-input"
            type="url"
            value={draft.licenseUrl}
            onChange={(e) => set({ licenseUrl: e.target.value })}
            placeholder="https://…"
          />
        </label>
      </div>

      <div className="ins-admin-row">
        <label className="ins-field">
          <span className="ins-field-label">Attribution (optional)</span>
          <input
            className="ins-input"
            value={draft.attribution}
            onChange={(e) => set({ attribution: e.target.value })}
            placeholder="Acme Inc."
          />
        </label>

        <label className="ins-field">
          <span className="ins-field-label">Source URL</span>
          <input
            className="ins-input"
            type="url"
            value={draft.sourceUrl}
            onChange={(e) => set({ sourceUrl: e.target.value })}
            placeholder="https://acme.example"
          />
        </label>

        <label className="ins-field">
          <span className="ins-field-label">Captured on</span>
          <input
            className="ins-input"
            type="date"
            value={(draft.capturedAt ?? '').slice(0, 10)}
            onChange={(e) => set({ capturedAt: e.target.value })}
          />
        </label>

        <label className="ins-field">
          <span className="ins-field-label">Captured by</span>
          <input
            className="ins-input"
            value={draft.capturedBy}
            onChange={(e) => set({ capturedBy: e.target.value })}
            placeholder="motvin"
          />
        </label>
      </div>

      <label className="ins-field">
        <span className="ins-field-label">Notes</span>
        <textarea
          className="ins-input ins-textarea"
          rows={2}
          value={draft.notes}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="Where permission came from, who granted it, any conditions."
        />
      </label>

      {missing.length > 0 && <p className="ins-admin-err">Approving needs {missing.join(', ')}.</p>}

      {missing.length === 0 && thin && (
        <p className="ins-admin-note">
          No {!draft.license?.trim() && !draft.attribution?.trim()
            ? 'licence or attribution'
            : !draft.license?.trim()
              ? 'licence'
              : 'attribution'}{' '}
          recorded. This still publishes. The screen page will show
          {!draft.attribution?.trim() ? ' the app name as the credit and' : ''} &quot;Not recorded&quot; for the
          licence.
        </p>
      )}

      <div className="ins-admin-actions">
        <button
          type="button"
          className="ins-btn ins-btn--primary"
          onClick={save}
          disabled={busy || !selected || missing.length > 0}
        >
          <CheckIcon size={15} /> Save licence
        </button>
        <span className="ins-muted">
          {state.files.filter((f) => f.appId === selected).length} files stored for this app.
        </span>
      </div>
    </div>
  );
}

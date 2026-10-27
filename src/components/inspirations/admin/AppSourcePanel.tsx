'use client';

import { useState } from 'react';
import { adminApi, type AdminAppRecord, type AdminSourceRecord, type AdminState } from '@/lib/inspirations/admin';
import { CheckIcon } from '../Icons';

/**
 * An app's source and licence entry (sources.json), on the app's page.
 *
 * The status is what publishes: only an "approved" app's screens go public.
 * Moving an app off "approved" hides all its screens, so that asks first.
 * The stored permission basis is kept as it is; it is not edited here.
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

export function AppSourcePanel({
  app,
  state,
  busy,
  run,
}: {
  app: AdminAppRecord;
  state: AdminState;
  busy: boolean;
  run: (action: () => Promise<unknown>, onDone?: () => void) => Promise<boolean>;
}) {
  const saved: AdminSourceRecord = { ...EMPTY, ...state.sources[app.id] };
  const [draft, setDraft] = useState<AdminSourceRecord>(saved);
  const set = <K extends keyof AdminSourceRecord>(key: K, value: AdminSourceRecord[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const changed = JSON.stringify(draft) !== JSON.stringify(saved);
  const screens = state.files.filter((f) => f.appId === app.id).length;

  const save = () => {
    if (saved.status === 'approved' && draft.status !== 'approved') {
      const ok = window.confirm(`Move ${app.name} to "${STATUS_LABEL[draft.status ?? 'pending']}"?\n\nIts ${screens} screens stop being public until it is approved again.`);
      if (!ok) return;
    }
    void run(() => adminApi.saveSource(app.id, draft));
  };

  return (
    <form
      className="ins-wizard-card ins-app-details"
      aria-labelledby="ins-app-source-title"
      onSubmit={(e) => {
        e.preventDefault();
        if (changed) save();
      }}
    >
      <header className="ins-wizard-head">
        <h3 id="ins-app-source-title" className="ins-wizard-title">Source & licence</h3>
        <p className="ins-wizard-desc">Where the screens came from and on what basis they are shown. Only an approved app&apos;s screens are public.</p>
      </header>

      <div className="ins-wizard-body ins-app-details-body">
        <div className="ins-admin-row">
          <label className="ins-field">
            <span className="ins-field-label">Status</span>
            <select className="ins-input" value={draft.status} onChange={(e) => set('status', e.target.value as AdminSourceRecord['status'])}>
              {state.vocabulary.reviewStatuses.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s] ?? s}
                </option>
              ))}
            </select>
          </label>
          <label className="ins-field">
            <span className="ins-field-label">Redistribution</span>
            <select className="ins-input" value={draft.redistribution} onChange={(e) => set('redistribution', e.target.value as AdminSourceRecord['redistribution'])}>
              <option value="allowed">Allowed — screens can be downloaded</option>
              <option value="view-only">View only</option>
            </select>
          </label>
        </div>

        <div className="ins-admin-row">
          <label className="ins-field">
            <span className="ins-field-label">Licence</span>
            <input className="ins-input" value={draft.license} onChange={(e) => set('license', e.target.value)} placeholder="CC BY 4.0" />
          </label>
          <label className="ins-field">
            <span className="ins-field-label">Licence URL</span>
            <input className="ins-input" type="url" value={draft.licenseUrl} onChange={(e) => set('licenseUrl', e.target.value)} placeholder="https://creativecommons.org/licenses/by/4.0/" />
          </label>
          <label className="ins-field">
            <span className="ins-field-label">Attribution</span>
            <input className="ins-input" value={draft.attribution} onChange={(e) => set('attribution', e.target.value)} placeholder={app.name} />
          </label>
        </div>

        <div className="ins-admin-row">
          <label className="ins-field">
            <span className="ins-field-label">Source URL</span>
            <input className="ins-input" type="url" value={draft.sourceUrl} onChange={(e) => set('sourceUrl', e.target.value)} placeholder="https://apps.apple.com/…" />
          </label>
          <label className="ins-field">
            <span className="ins-field-label">Captured on</span>
            <input className="ins-input" type="date" value={(draft.capturedAt ?? '').slice(0, 10)} onChange={(e) => set('capturedAt', e.target.value)} />
          </label>
          <label className="ins-field">
            <span className="ins-field-label">Captured by</span>
            <input className="ins-input" value={draft.capturedBy} onChange={(e) => set('capturedBy', e.target.value)} placeholder="motvin-ios-crawler" />
          </label>
        </div>

        <label className="ins-field">
          <span className="ins-field-label">Notes</span>
          <textarea className="ins-input" rows={3} value={draft.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Who allowed it, and when." />
        </label>
      </div>

      <footer className="ins-wizard-foot">
        <button type="button" className="ins-btn ins-btn--ghost" onClick={() => setDraft(saved)} disabled={!changed || busy}>
          Undo changes
        </button>
        <span className="ins-wizard-note">{changed ? 'Unsaved changes' : 'All changes saved'}</span>
        <button type="submit" className="ins-btn ins-btn--primary" disabled={!changed || busy}>
          {busy ? <span className="ins-spinner" aria-hidden /> : <CheckIcon size={15} />} Save changes
        </button>
      </footer>
    </form>
  );
}

'use client';

import { useRef, useState } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import { adminApi, type AdminAppRecord, type AdminState } from '@/lib/inspirations/admin';
import { INDUSTRY_LABEL } from '@/lib/inspirations/taxonomy';
import { INDUSTRIES, type Industry } from '@/lib/inspirations/types';
import { PlusIcon, TrashIcon, UploadIcon } from '../Icons';
import { AppCardScreens } from './AppCardScreens';
import { AppVersionScreens } from './AppVersionScreens';

/**
 * App records: the products screenshots belong to.
 *
 * An app's id doubles as its folder name under `screens/<platform>/`, so it is
 * fixed once created; editing an existing app keeps the id and updates the
 * rest.
 */

const EMPTY: AdminAppRecord = { id: '', name: '', industry: 'saas', website: '', tagline: '' };

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function AppsPanel({
  state,
  busy,
  run,
}: {
  state: AdminState;
  busy: boolean;
  run: (action: () => Promise<unknown>, onDone?: () => void) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<AdminAppRecord>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [idTouched, setIdTouched] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoFor, setLogoFor] = useState<string | null>(null);
  // Which app has an inline panel open under its row, and which one — the
  // version manager or the card-carousel picker. One at a time: both are
  // tall, and two open at once is a wall of thumbnails.
  const [open, setOpen] = useState<{ id: string; panel: 'versions' | 'card' } | null>(null);
  const isOpen = (id: string, panel: 'versions' | 'card') => open?.id === id && open.panel === panel;
  const togglePanel = (id: string, panel: 'versions' | 'card') => setOpen(isOpen(id, panel) ? null : { id, panel });

  const startNew = () => {
    setDraft(EMPTY);
    setEditingId(null);
    setIdTouched(false);
  };

  const edit = (app: AdminAppRecord) => {
    setDraft({ ...EMPTY, ...app });
    setEditingId(app.id);
    setIdTouched(true);
  };

  const save = () => {
    void run(
      () =>
        adminApi.saveApp({
          ...draft,
          id: draft.id.trim(),
          name: draft.name.trim(),
        }),
      startNew,
    );
  };

  const remove = (app: AdminAppRecord) => {
    const files = state.files.filter((f) => f.appId === app.id).length;
    const flows = state.flows.filter((f) => f.appId === app.id).length;

    // Deleting an app deletes its files, so the confirmation counts them
    // rather than describing the action in the abstract.
    const parts = [
      `${files} ${files === 1 ? 'screenshot' : 'screenshots'}`,
      flows > 0 ? `${flows} ${flows === 1 ? 'flow' : 'flows'}` : null,
      'its licence entry',
    ].filter(Boolean);

    const message =
      `Delete "${app.name}" and everything stored for it?\n\n` +
      `This removes ${parts.join(', ')} from motvin-backend.\n\n` +
      `This cannot be undone.`;

    if (!window.confirm(message)) return;
    void run(() => adminApi.deleteApp(app.id));
  };

  const uploadLogo = (file: File) => {
    if (!logoFor) return;
    void run(() => adminApi.uploadLogo(logoFor, file.name, file), () => setLogoFor(null));
  };

  const valid = draft.id.trim().length > 0 && draft.name.trim().length > 0;

  return (
    <div className="ins-admin-panel">
      <p className="ins-field-hint">
        The products screenshots belong to. Open <strong>Versions</strong> on any app below to manage its dated
        captures — add or remove one, or rename one&rsquo;s date to change which is &ldquo;Latest&rdquo;. Open{' '}
        <strong>Card screens</strong> to pick the four screens its card cycles through on the Apps page. That is
        different from the <strong>Screens</strong> tab above, which lists every screen of every app in one place.
      </p>

      <form
        className="ins-admin-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save();
        }}
      >
        <p className="ins-admin-form-title">{editingId ? `Edit ${editingId}` : 'Add an app'}</p>

        <div className="ins-admin-row">
          <label className="ins-field">
            <span className="ins-field-label">Name</span>
            <input
              className="ins-input"
              value={draft.name}
              onChange={(e) => {
                const name = e.target.value;
                setDraft((d) => ({ ...d, name, id: idTouched ? d.id : slugify(name) }));
              }}
              placeholder="Acme"
              required
            />
          </label>

          <label className="ins-field">
            <span className="ins-field-label">Id / folder</span>
            <input
              className="ins-input"
              value={draft.id}
              onChange={(e) => {
                setIdTouched(true);
                setDraft((d) => ({ ...d, id: slugify(e.target.value) }));
              }}
              placeholder="acme"
              disabled={Boolean(editingId)}
              required
            />
            <span className="ins-field-hint">
              {editingId ? 'Fixed once created.' : 'Used as the folder name under screens/<platform>/.'}
            </span>
          </label>

          <label className="ins-field">
            <span className="ins-field-label">Industry</span>
            <select
              className="ins-input"
              value={draft.industry}
              onChange={(e) => setDraft((d) => ({ ...d, industry: e.target.value as Industry }))}
            >
              {INDUSTRIES.map((i) => (
                <option key={i} value={i}>
                  {INDUSTRY_LABEL[i]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="ins-admin-row">
          <label className="ins-field">
            <span className="ins-field-label">Website</span>
            <input
              className="ins-input"
              value={draft.website ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, website: e.target.value }))}
              placeholder="https://acme.example"
              type="url"
            />
          </label>
          <label className="ins-field ins-field--wide">
            <span className="ins-field-label">Tagline</span>
            <input
              className="ins-input"
              value={draft.tagline ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, tagline: e.target.value }))}
              placeholder="One line about the product."
            />
          </label>
        </div>

        <div className="ins-admin-actions">
          <button type="submit" className="ins-btn ins-btn--primary" disabled={!valid || busy}>
            <PlusIcon size={15} /> {editingId ? 'Save changes' : 'Add app'}
          </button>
          {editingId && (
            <button type="button" className="ins-btn ins-btn--ghost" onClick={startNew} disabled={busy}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="ins-admin-list">
        {state.apps.length === 0 && <p className="ins-muted">No apps yet.</p>}
        {state.apps.map((app) => {
          const logo = state.logos.find((f) => f.startsWith(`${app.id}.`));
          const logoUrl = logo ? inspirationsApi.mediaUrl(`/api/inspirations/logos/${logo}`) : null;
          const screens = state.files.filter((f) => f.appId === app.id);
          const published = screens.filter((f) => f.published).length;

          return (
            <div key={app.id} className="ins-admin-item">
              <div className="ins-admin-item-head">
                {logoUrl ? (
                  <img src={logoUrl} alt="" className="ins-admin-logo" />
                ) : (
                  <span className="ins-admin-logo ins-admin-logo--none" aria-hidden>
                    {app.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <div className="ins-admin-item-text">
                  <p className="ins-admin-item-title">
                    {app.name}
                    <span className="ins-admin-item-id">{app.id}</span>
                  </p>
                  <p className="ins-admin-item-sub">
                    {INDUSTRY_LABEL[app.industry] ?? app.industry} · {published} of {screens.length} screens published
                  </p>
                  {app.tagline && <p className="ins-admin-item-sub">{app.tagline}</p>}
                </div>
                <div className="ins-admin-item-actions">
                  <button
                    type="button"
                    className="ins-btn ins-btn--sm"
                    disabled={busy}
                    aria-expanded={isOpen(app.id, 'versions')}
                    onClick={() => togglePanel(app.id, 'versions')}
                  >
                    {isOpen(app.id, 'versions') ? 'Close' : 'Versions'}
                  </button>
                  <button
                    type="button"
                    className={`ins-btn ins-btn--sm ${(app.cardScreens?.length ?? 0) > 0 ? 'is-active' : ''}`}
                    disabled={busy}
                    aria-expanded={isOpen(app.id, 'card')}
                    title={
                      (app.cardScreens?.length ?? 0) > 0
                        ? `${app.cardScreens!.length} of 4 card screens picked`
                        : 'The card picks its screens automatically'
                    }
                    onClick={() => togglePanel(app.id, 'card')}
                  >
                    {isOpen(app.id, 'card') ? 'Close' : 'Card screens'}
                    {(app.cardScreens?.length ?? 0) > 0 && <span className="ins-chip-count">{app.cardScreens!.length}</span>}
                  </button>
                  <button
                    type="button"
                    className="ins-btn ins-btn--sm"
                    disabled={busy}
                    onClick={() => {
                      setLogoFor(app.id);
                      logoInputRef.current?.click();
                    }}
                  >
                    <UploadIcon size={13} /> Logo
                  </button>
                  <button type="button" className="ins-btn ins-btn--sm" onClick={() => edit(app)} disabled={busy}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="ins-iconbtn ins-iconbtn--plain"
                    aria-label={`Remove ${app.name}`}
                    onClick={() => remove(app)}
                    disabled={busy}
                  >
                    <TrashIcon size={14} />
                  </button>
                </div>
              </div>
              {isOpen(app.id, 'versions') && (
                <AppVersionScreens app={app} files={screens} busy={busy} run={run} />
              )}
              {isOpen(app.id, 'card') && (
                <AppCardScreens key={`${app.id}:${(app.cardScreens ?? []).join(',')}`} app={app} files={screens} busy={busy} run={run} />
              )}
            </div>
          );
        })}
      </div>

      <input
        ref={logoInputRef}
        type="file"
        accept="image/png,image/webp,image/jpeg,image/svg+xml"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadLogo(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}

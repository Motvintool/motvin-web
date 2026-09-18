'use client';

import { useState } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import { adminApi, type AdminScreenFile, type AdminState, type ScreenSidecar } from '@/lib/inspirations/admin';
import { PLATFORM_LABEL, SCREEN_TYPE_LABEL, STYLE_LABEL } from '@/lib/inspirations/taxonomy';
import { SCREEN_TYPES, STYLES, type ScreenType, type Style } from '@/lib/inspirations/types';
import { CheckIcon, PencilIcon, TrashIcon } from '../Icons';

/**
 * Every stored screenshot, published or not.
 *
 * Files the builder could not publish are listed first with the reason,
 * because those are the ones needing a decision. Metadata is edited in place
 * and written to the file's sidecar.
 */
export function ScreensPanel({
  state,
  busy,
  run,
}: {
  state: AdminState;
  busy: boolean;
  run: (action: () => Promise<unknown>, onDone?: () => void) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<string | null>(null);

  const files = [...state.files].sort((a, b) => {
    if (a.published !== b.published) return a.published ? 1 : -1;
    return a.appId.localeCompare(b.appId) || a.file.localeCompare(b.file);
  });

  if (files.length === 0) {
    return <p className="ins-muted ins-admin-status">No screenshots stored yet. Add some on the Upload tab.</p>;
  }

  return (
    <div className="ins-admin-panel">
      <p className="ins-admin-note">
        {files.filter((f) => f.published).length} published, {files.filter((f) => !f.published).length} held back.
      </p>

      <div className="ins-admin-list">
        {files.map((file) => (
          <ScreenRow
            key={`${file.platform}/${file.appId}/${file.file}`}
            file={file}
            state={state}
            busy={busy}
            run={run}
            editing={editing === file.id}
            onEdit={() => setEditing(editing === file.id ? null : file.id)}
            onClose={() => setEditing(null)}
          />
        ))}
      </div>
    </div>
  );
}

function ScreenRow({
  file,
  state,
  busy,
  run,
  editing,
  onEdit,
  onClose,
}: {
  file: AdminScreenFile;
  state: AdminState;
  busy: boolean;
  run: (action: () => Promise<unknown>, onDone?: () => void) => Promise<boolean>;
  editing: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  const sidecar = file.sidecar ?? {};
  const [name, setName] = useState(sidecar.name ?? '');
  const [screenType, setScreenType] = useState<ScreenType>(
    (sidecar.screenType as ScreenType) ?? (file.file.split('-')[0] as ScreenType) ?? 'other',
  );
  const [tags, setTags] = useState((sidecar.tags ?? []).join(', '));
  const [elements, setElements] = useState((sidecar.elements ?? []).join(', '));
  const [style, setStyle] = useState<Style[]>((sidecar.style as Style[]) ?? []);
  const [capturedAt, setCapturedAt] = useState(sidecar.capturedAt ?? '');

  const app = state.apps.find((a) => a.id === file.appId);
  const previewUrl = inspirationsApi.mediaUrl(
    `/api/inspirations/screens/${file.platform}/${file.appId}/${file.file}`,
  );

  const save = () => {
    const meta: ScreenSidecar = {
      name: name.trim() || undefined,
      screenType,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      elements: elements.split(',').map((t) => t.trim()).filter(Boolean),
      style,
      capturedAt: capturedAt.trim() || undefined,
    };
    void run(() => adminApi.saveScreenMeta(file.platform, file.appId, file.file, meta), onClose);
  };

  const remove = () => {
    if (!window.confirm(`Delete ${file.file} from ${file.appId}? The file is removed from the store.`)) return;
    void run(() => adminApi.deleteScreen(file.platform, file.appId, file.file));
  };

  return (
    <div className={`ins-admin-item ${file.published ? 'is-published' : 'is-held'}`}>
      <div className="ins-admin-item-head">
        {/* Published files are served by the API; held-back ones have no public
            URL, so only the record is shown. */}
        {file.published && previewUrl ? (
          <img src={previewUrl} alt="" className="ins-admin-thumb" loading="lazy" />
        ) : (
          <span className="ins-admin-thumb ins-admin-thumb--none" aria-hidden />
        )}

        <div className="ins-admin-item-text">
          <p className="ins-admin-item-title">
            {sidecar.name || file.file}
            <span className="ins-admin-item-id">{file.id}</span>
          </p>
          <p className="ins-admin-item-sub">
            {app?.name ?? file.appId} · {PLATFORM_LABEL[file.platform] ?? file.platform} ·{' '}
            {file.width && file.height ? `${file.width} × ${file.height}` : 'unreadable'} ·{' '}
            {Math.round(file.bytes / 1024)} KB
          </p>
          {file.published ? (
            <p className="ins-admin-ok">
              <CheckIcon size={12} /> Published
            </p>
          ) : (
            <p className="ins-admin-err">Held back: {file.blockedReason}</p>
          )}
        </div>

        <div className="ins-admin-item-actions">
          <button type="button" className="ins-btn ins-btn--sm" onClick={onEdit} disabled={busy}>
            <PencilIcon size={13} /> {editing ? 'Close' : 'Edit'}
          </button>
          <button type="button" className="ins-iconbtn ins-iconbtn--plain" aria-label={`Delete ${file.file}`} onClick={remove} disabled={busy}>
            <TrashIcon size={14} />
          </button>
        </div>
      </div>

      {editing && (
        <div className="ins-admin-edit">
          <div className="ins-admin-row">
            <label className="ins-field">
              <span className="ins-field-label">Screen name</span>
              <input className="ins-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Revenue overview" />
            </label>
            <label className="ins-field">
              <span className="ins-field-label">Screen type</span>
              <select className="ins-input" value={screenType} onChange={(e) => setScreenType(e.target.value as ScreenType)}>
                {SCREEN_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SCREEN_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="ins-field">
              <span className="ins-field-label">Captured</span>
              <input className="ins-input" type="date" value={capturedAt.slice(0, 10)} onChange={(e) => setCapturedAt(e.target.value)} />
            </label>
          </div>

          <label className="ins-field">
            <span className="ins-field-label">Tags</span>
            <input className="ins-input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="kpi, analytics" />
          </label>

          <label className="ins-field">
            <span className="ins-field-label">Components in this screen</span>
            <input
              className="ins-input"
              value={elements}
              onChange={(e) => setElements(e.target.value)}
              placeholder="navigation, sidebar, chart, table"
            />
            <span className="ins-field-hint">
              Drives the UI Elements page and which patterns match. Comma separated.
            </span>
          </label>

          <fieldset className="ins-field">
            <legend className="ins-field-label">Style</legend>
            <div className="ins-filter-options">
              {STYLES.map((s) => {
                const on = style.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    className={`ins-chip ins-chip--sm ${on ? 'is-active' : ''}`}
                    aria-pressed={on}
                    onClick={() => setStyle(on ? style.filter((v) => v !== s) : [...style, s])}
                  >
                    {STYLE_LABEL[s]}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="ins-admin-actions">
            <button type="button" className="ins-btn ins-btn--primary" onClick={save} disabled={busy}>
              Save details
            </button>
            <button type="button" className="ins-btn ins-btn--ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

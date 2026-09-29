'use client';

import { useRef, useState, type DragEvent } from 'react';
import { adminApi, safeFileName, type AdminState } from '@/lib/inspirations/admin';
import { localDateString } from '@/lib/inspirations/dates';
import { INDUSTRY_LABEL, PLATFORM_LABEL, SCREEN_TYPE_LABEL } from '@/lib/inspirations/taxonomy';
import { INDUSTRIES, SCREEN_TYPES, type Industry, type Platform, type ScreenType } from '@/lib/inspirations/types';
import { CheckIcon, CloseIcon, PlusIcon, UploadIcon } from '../Icons';
import { AppModeSelect } from './AppModeSelect';

/**
 * Upload screenshots into the store.
 *
 * The queue is explicit: files are staged with their app, platform and screen
 * type, and nothing is sent until Upload is pressed. Each row keeps its own
 * result so a partial failure is visible per file rather than as one lost
 * batch.
 *
 * The app and version pickers mirror Automatic's: New app / Old app up top,
 * and for an old app a version target ("Update Latest" or "Add a new
 * version…") rather than a bare date box — the same choice, the same
 * wording, whichever way screens are added.
 */

/** The version picker's "new version" option, alongside the app's real ones. */
const NEW_VERSION = '__new__';

type Staged = {
  key: string;
  file: File;
  name: string;
  screenType: ScreenType;
  previewUrl: string;
  status: 'staged' | 'uploading' | 'done' | 'failed';
  message?: string;
};

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}

function guessScreenType(fileName: string): ScreenType {
  const base = fileName.toLowerCase();
  const found = SCREEN_TYPES.find((t) => base.includes(t));
  return found ?? 'other';
}

export function UploadPanel({
  state,
  busy,
  onUploaded,
  run,
}: {
  state: AdminState;
  busy: boolean;
  onUploaded: () => Promise<void> | void;
  run: (action: () => Promise<unknown>, onDone?: () => void) => Promise<boolean>;
}) {
  // A brand-new app is created here and switched to; an existing one is
  // picked from the list — same split as Automatic's New app / Old app.
  const [appMode, setAppMode] = useState<'new' | 'old'>(state.apps.length === 0 ? 'new' : 'old');
  const [appId, setAppId] = useState(state.apps[0]?.id ?? '');
  const [newApp, setNewApp] = useState({ name: '', id: '', industry: 'saas' as Industry });
  const [idTouched, setIdTouched] = useState(false);
  const [platform, setPlatform] = useState<Platform>('web');
  // "New app": blank means today, the same default a brand-new app gets from
  // Automatic — it has no version yet to default to. "Old app": either an
  // existing version's id, or NEW_VERSION to start another one.
  const [version, setVersion] = useState('');
  const [versionTarget, setVersionTarget] = useState(NEW_VERSION);
  const [newVersionDate, setNewVersionDate] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [queue, setQueue] = useState<Staged[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedApp = appMode === 'old' ? state.apps.find((a) => a.id === appId) ?? null : null;
  // A blank date resolves to today, so the collision check has to resolve it
  // the same way, or typing nothing would slip past it.
  const newVersionCollision =
    selectedApp && versionTarget === NEW_VERSION
      ? ((selectedApp.versions ?? []).find((v) => v.id === (newVersionDate || localDateString())) ?? null)
      : null;

  // Picking a different existing app (or switching into "Old app") starts
  // back at its own current version rather than carrying over whatever was
  // selected before — adjusted here, during render, rather than in an
  // effect: an effect would render once with the stale target, then again
  // once it caught up.
  const modeKey = `${appMode}:${appId}`;
  const [prevModeKey, setPrevModeKey] = useState(modeKey);
  if (modeKey !== prevModeKey) {
    setPrevModeKey(modeKey);
    if (appMode === 'old') {
      setVersionTarget(selectedApp?.currentVersion ?? NEW_VERSION);
      setNewVersionDate('');
    }
  }

  const createApp = async () => {
    const id = (newApp.id || slugify(newApp.name)).trim();
    if (!id || !newApp.name.trim()) return;
    const ok = await run(() => adminApi.saveApp({ id, name: newApp.name.trim(), industry: newApp.industry }));
    if (ok) {
      setAppId(id);
      setAppMode('old');
      setNewApp({ name: '', id: '', industry: 'saas' });
      setIdTouched(false);
    }
  };

  const stage = (files: FileList | File[]) => {
    const next: Staged[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      const safe = safeFileName(file.name);
      next.push({
        key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        name: safe,
        screenType: guessScreenType(safe),
        previewUrl: URL.createObjectURL(file),
        status: 'staged',
      });
    }
    setQueue((q) => [...q, ...next]);
  };

  const update = (key: string, patch: Partial<Staged>) => {
    setQueue((q) => q.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };

  const remove = (key: string) => {
    setQueue((q) => {
      const item = q.find((i) => i.key === key);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return q.filter((i) => i.key !== key);
    });
  };

  const clearDone = () => {
    setQueue((q) => {
      q.filter((i) => i.status === 'done').forEach((i) => URL.revokeObjectURL(i.previewUrl));
      return q.filter((i) => i.status !== 'done');
    });
  };

  // "Old app" always resolves to a concrete date before it reaches the
  // server — a blank "Add a new version" date must land on today, never on
  // whatever the app's current version happens to be, or "new version"
  // would silently become "update the old one".
  const resolvedVersion =
    appMode === 'old'
      ? versionTarget === NEW_VERSION
        ? newVersionDate || localDateString()
        : versionTarget
      : version || undefined;

  const uploadAll = async () => {
    if (!appId) return;
    setUploading(true);
    for (const item of queue) {
      if (item.status === 'done') continue;
      update(item.key, { status: 'uploading', message: undefined });
      try {
        // The screen type must lead the file name: that is what the builder
        // reads when no sidecar exists, and it keeps ids predictable.
        const base = item.name.replace(/\.[^.]+$/, '');
        const ext = item.name.slice(item.name.lastIndexOf('.'));
        const fileName = base.startsWith(item.screenType) ? item.name : `${item.screenType}-${base}${ext}`;

        await adminApi.uploadScreen(platform, appId, fileName, item.file, overwrite, resolvedVersion);
        update(item.key, { status: 'done', message: 'Uploaded' });
      } catch (err) {
        update(item.key, { status: 'failed', message: (err as Error).message });
      }
    }
    setUploading(false);
    await onUploaded();
  };

  const pending = queue.filter((i) => i.status !== 'done').length;

  return (
    <div className="ins-admin-panel">
      <div className="ins-admin-row ins-align-controls">
        <AppModeSelect mode={appMode} onChange={setAppMode} noApps={state.apps.length === 0} />

        <label className="ins-field">
          <span className="ins-field-label">Platform</span>
          <select className="ins-input" value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
            {state.vocabulary.platforms.map((p) => (
              <option key={p} value={p}>
                {PLATFORM_LABEL[p] ?? p}
              </option>
            ))}
          </select>
        </label>

        {appMode === 'old' && (
          <>
            <label className="ins-field">
              <span className="ins-field-label">App</span>
              <select className="ins-input" value={appId} onChange={(e) => setAppId(e.target.value)}>
                <option value="">Choose an app…</option>
                {state.apps.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.name} ({app.id})
                  </option>
                ))}
              </select>
            </label>

            {selectedApp && (
              <label className="ins-field">
                <span className="ins-field-label">Version</span>
                <select className="ins-input" value={versionTarget} onChange={(e) => setVersionTarget(e.target.value)}>
                  {(selectedApp.versions ?? []).map((v) => (
                    <option key={v.id} value={v.id}>
                      Update {v.isLatest ? 'Latest' : v.label}
                    </option>
                  ))}
                  <option value={NEW_VERSION}>Add a new version…</option>
                </select>
              </label>
            )}

            {selectedApp && versionTarget === NEW_VERSION && (
              <label className="ins-field">
                <span className="ins-field-label">New version&rsquo;s date</span>
                <input
                  className="ins-input"
                  type="date"
                  value={newVersionDate}
                  onChange={(e) => setNewVersionDate(e.target.value)}
                />
              </label>
            )}
          </>
        )}

        <label className="ins-checkline">
          <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
          <span>Replace files with the same name</span>
        </label>
      </div>

      {appMode === 'new' && (
        <div className="ins-admin-inline-form">
          <p className="ins-admin-form-title">
            {state.apps.length === 0 ? 'Add your first app' : 'Add an app'}
          </p>
          <p className="ins-field-hint">
            Screenshots belong to an app. Its id becomes the folder they are stored in.
          </p>
          <div className="ins-admin-row">
            <label className="ins-field">
              <span className="ins-field-label">Name</span>
              <input
                className="ins-input"
                value={newApp.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setNewApp((a) => ({ ...a, name, id: idTouched ? a.id : slugify(name) }));
                }}
                placeholder="Acme"
              />
            </label>
            <label className="ins-field">
              <span className="ins-field-label">Id / folder</span>
              <input
                className="ins-input"
                value={newApp.id}
                onChange={(e) => {
                  setIdTouched(true);
                  setNewApp((a) => ({ ...a, id: slugify(e.target.value) }));
                }}
                placeholder="acme"
              />
            </label>
            <label className="ins-field">
              <span className="ins-field-label">Industry</span>
              <select
                className="ins-input"
                value={newApp.industry}
                onChange={(e) => setNewApp((a) => ({ ...a, industry: e.target.value as Industry }))}
              >
                {INDUSTRIES.map((i) => (
                  <option key={i} value={i}>
                    {INDUSTRY_LABEL[i]}
                  </option>
                ))}
              </select>
            </label>
            <label className="ins-field">
              <span className="ins-field-label">Version</span>
              <input className="ins-input" type="date" value={version} onChange={(e) => setVersion(e.target.value)} />
              <span className="ins-field-hint">Blank uses today&rsquo;s date.</span>
            </label>
          </div>
          <div className="ins-admin-actions">
            <button
              type="button"
              className="ins-btn ins-btn--primary"
              disabled={busy || !newApp.name.trim()}
              onClick={() => void createApp()}
            >
              <PlusIcon size={15} /> Create app
            </button>
            {state.apps.length > 0 && (
              <button type="button" className="ins-btn ins-btn--ghost" onClick={() => setAppMode('old')} disabled={busy}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {newVersionCollision ? (
        <p className="ins-admin-err">
          {selectedApp?.name} already has a version dated {newVersionCollision.isLatest ? 'Latest' : newVersionCollision.label} —
          pick “Update {newVersionCollision.isLatest ? 'Latest' : newVersionCollision.label}” above instead, or choose a
          different date.
        </p>
      ) : (
        appMode === 'old' &&
        selectedApp && (
          <p className="ins-field-hint">
            {versionTarget === NEW_VERSION
              ? 'These screens start a new version — blank uses today’s date.'
              : `These screens are added to ${selectedApp.name}’s existing ${(selectedApp.versions ?? []).find((v) => v.id === versionTarget)?.isLatest ? 'Latest' : (selectedApp.versions ?? []).find((v) => v.id === versionTarget)?.label ?? versionTarget} version.`}
          </p>
        )
      )}

      <div
        className={`ins-dropzone ${dragging ? 'is-dragging' : ''}`}
        onDragOver={(e: DragEvent) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e: DragEvent) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) stage(e.dataTransfer.files);
        }}
      >
        <UploadIcon size={22} className="ins-dropzone-icon" />
        <div className="ins-dropzone-text">
          <p className="ins-dropzone-title">
            {newVersionCollision
              ? 'Fix the version above first'
              : appId
                ? 'Drop screenshots here'
                : 'Choose an app to start uploading'}
          </p>
          {/* When the version has a collision, the resolved path below isn't
              where an upload would actually land — nothing is going to that
              folder until the date changes — so it's left out rather than
              stating a destination that contradicts the error above it. */}
          {!newVersionCollision && (
            <p className="ins-dropzone-desc">
              PNG, JPEG, WebP, AVIF or GIF. Each file is stored under{' '}
              <code>
                screens/{platform}/{appId || '<app>'}/versions/{resolvedVersion || localDateString()}
              </code>
              .
            </p>
          )}
        </div>
        <button
          type="button"
          className="ins-btn"
          onClick={() => inputRef.current?.click()}
          disabled={!appId || Boolean(newVersionCollision)}
          title={appId ? (newVersionCollision ? 'Fix the version above first' : undefined) : 'Choose or create an app first'}
        >
          Choose files
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) stage(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {queue.length > 0 && (
        <>
          <div className="ins-admin-queue">
            {queue.map((item) => (
              <div key={item.key} className={`ins-admin-queue-row is-${item.status}`}>
                <img src={item.previewUrl} alt="" className="ins-admin-thumb" />
                <div className="ins-admin-queue-fields">
                  <label className="ins-field">
                    <span className="ins-field-label">File name</span>
                    <input
                      className="ins-input"
                      value={item.name}
                      onChange={(e) => update(item.key, { name: safeFileName(e.target.value) })}
                      disabled={item.status === 'done'}
                    />
                  </label>
                  <label className="ins-field">
                    <span className="ins-field-label">Screen type</span>
                    <select
                      className="ins-input"
                      value={item.screenType}
                      onChange={(e) => update(item.key, { screenType: e.target.value as ScreenType })}
                      disabled={item.status === 'done'}
                    >
                      {SCREEN_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {SCREEN_TYPE_LABEL[t]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="ins-admin-queue-status">
                  {item.status === 'done' && (
                    <span className="ins-admin-ok">
                      <CheckIcon size={13} /> {item.message}
                    </span>
                  )}
                  {item.status === 'failed' && <span className="ins-admin-err">{item.message}</span>}
                  {item.status === 'uploading' && <span className="ins-spinner" />}
                  {item.status !== 'uploading' && (
                    <button
                      type="button"
                      className="ins-iconbtn ins-iconbtn--plain"
                      aria-label={`Remove ${item.name}`}
                      onClick={() => remove(item.key)}
                    >
                      <CloseIcon size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="ins-admin-actions">
            <button
              type="button"
              className="ins-btn ins-btn--primary"
              disabled={!appId || uploading || busy || pending === 0 || Boolean(newVersionCollision)}
              onClick={uploadAll}
            >
              <UploadIcon size={15} />
              {uploading ? 'Uploading…' : `Upload ${pending} ${pending === 1 ? 'file' : 'files'}`}
            </button>
            {queue.some((i) => i.status === 'done') && (
              <button type="button" className="ins-btn ins-btn--ghost" onClick={clearDone}>
                Clear finished
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

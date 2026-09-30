'use client';

import { useRef, useState } from 'react';
import { adminApi, type AdminAppRecord, type AdminScreenFile } from '@/lib/inspirations/admin';
import { splitScreenFile } from '@/lib/inspirations/screenPaths';
import { localDateString } from '@/lib/inspirations/dates';
import { PLATFORM_LABEL } from '@/lib/inspirations/taxonomy';
import type { Platform } from '@/lib/inspirations/types';
import { PlusIcon, TrashIcon, UploadIcon } from '../Icons';
import { screenLabel, thumbUrl } from './screenFiles';

/**
 * Per-app, per-version screen management, inline in the Apps tab.
 *
 * Tabs across the top are the app's versions — "Latest" plus each dated
 * capture — plus a "+ New version" tab that stages a date before anything
 * is uploaded to it, so a version exists (and shows up here and everywhere
 * else) only once it actually has a screen. An admin can add a screen the
 * crawler missed, remove one that shouldn't have published, or file a batch
 * under a version of its own, straight from wherever they're already
 * looking — without a detour through the separate Screens or Upload tabs
 * (which list every screen of every app, not just this one version).
 */
export function AppVersionScreens({
  app,
  files,
  busy,
  run,
}: {
  app: AdminAppRecord;
  files: AdminScreenFile[];
  busy: boolean;
  run: (action: () => Promise<unknown>, onDone?: () => void) => Promise<boolean>;
}) {
  const versions = app.versions ?? [];
  const [selected, setSelected] = useState(app.currentVersion ?? versions[0]?.id ?? '');
  // Non-null while staging a version that doesn't exist yet — its own value
  // is the date it will become once a screen actually lands there.
  const [draftVersion, setDraftVersion] = useState<string | null>(null);
  // Whether the active tab's date is being edited, and the date typed so far.
  // Renaming a version's date to be the newest is the only way to make it
  // "Latest" now that there's no separate pin — there is no other date
  // picker for this than editing the tab you want to move.
  const [editingDate, setEditingDate] = useState(false);
  const [dateDraft, setDateDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const platforms = Array.from(new Set(files.map((f) => f.platform)));
  const [platform, setPlatform] = useState<Platform>((platforms[0] as Platform) ?? 'ios');

  if (versions.length === 0) {
    return <p className="ins-muted ins-admin-status">No screens stored for {app.name} yet.</p>;
  }

  const target = draftVersion ?? selected;
  const versionLabel = (v: { isLatest: boolean; label: string }) => (v.isLatest ? 'Latest' : v.label);
  // While staging a new version, a date that collides with one that already
  // exists is refused rather than quietly folded into it — "new version"
  // means new, and the tabs above are already the way to update an existing
  // one on purpose.
  const collision = draftVersion !== null ? versions.find((v) => v.id === draftVersion) ?? null : null;
  const activeVersion = draftVersion !== null ? null : (versions.find((v) => v.id === target) ?? null);
  const targetLabel = activeVersion ? versionLabel(activeVersion) : target;
  const screensInVersion = files.filter((f) => f.version === target);

  const pickExisting = (id: string) => {
    setDraftVersion(null);
    setEditingDate(false);
    setSelected(id);
  };

  const startNewVersion = () => {
    setEditingDate(false);
    setDraftVersion(localDateString());
  };

  const startEditDate = () => {
    if (!activeVersion) return;
    setDateDraft(activeVersion.id);
    setEditingDate(true);
  };

  const saveDate = () => {
    if (!activeVersion) return;
    const newId = dateDraft;
    if (!newId || newId === activeVersion.id) {
      setEditingDate(false);
      return;
    }
    const oldId = activeVersion.id;
    void run(
      () => adminApi.renameVersion(app.id, oldId, newId),
      () => {
        setEditingDate(false);
        pickExisting(newId);
      },
    );
  };

  const removeScreen = (file: AdminScreenFile) => {
    const label = file.sidecar?.name || file.file;
    if (!window.confirm(`Delete "${label}"? The image is removed from the store.`)) return;
    const { name, version, flow } = splitScreenFile(file.file, file.version);
    void run(() => adminApi.deleteScreen(file.platform, file.appId, name, version, flow));
  };

  const addScreens = (fileList: FileList) => {
    if (collision) return;
    const picked = Array.from(fileList);
    if (!picked.length) return;
    const wasStagingNew = draftVersion !== null;
    void run(
      () => Promise.all(picked.map((f) => adminApi.uploadScreen(platform, app.id, f.name, f, false, target))),
      // Its first screen just landed, so it is a real version now — switch
      // back to the normal tab list, on the version that was just staged.
      wasStagingNew ? () => pickExisting(target) : undefined,
    );
  };

  const removeVersion = () => {
    if (versions.length <= 1 || !activeVersion) return;
    const label = versionLabel(activeVersion);
    if (
      !window.confirm(
        `Delete the "${label}" version of ${app.name}? Its ${screensInVersion.length} screen(s) are removed for good.`,
      )
    ) {
      return;
    }
    const fallback = versions.find((v) => v.id !== target)?.id ?? '';
    void run(() => adminApi.deleteVersion(app.id, target), () => pickExisting(fallback));
  };

  return (
    <div className="ins-admin-versions-manager">
      <p className="ins-admin-form-title">{app.name}&rsquo;s versions</p>
      <div className="ins-admin-versions-tabs" role="tablist" aria-label={`${app.name} versions`}>
        {versions.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={draftVersion === null && selected === v.id}
            className={`ins-chip ins-chip--sm ${draftVersion === null && selected === v.id ? 'is-active' : ''}`}
            onClick={() => pickExisting(v.id)}
          >
            {versionLabel(v)}
          </button>
        ))}
        <button
          type="button"
          role="tab"
          aria-selected={draftVersion !== null}
          className={`ins-chip ins-chip--sm ${draftVersion !== null ? 'is-active' : ''}`}
          onClick={startNewVersion}
        >
          <PlusIcon size={11} /> New version
        </button>
      </div>

      {draftVersion !== null && (
        <label className="ins-field ins-field--inline">
          <span className="ins-field-label">New version&rsquo;s date</span>
          <input className="ins-input" type="date" value={draftVersion} onChange={(e) => setDraftVersion(e.target.value)} />
        </label>
      )}

      {collision && (
        <p className="ins-admin-err">
          {app.name} already has a version dated {versionLabel(collision)} — pick it from the tabs above to add to
          it, or choose a different date for the new one.
        </p>
      )}

      <div className="ins-admin-actions ins-admin-actions--tight">
        {collision ? null : activeVersion ? (
          <>
            <span className="ins-muted">
              {screensInVersion.length} screen{screensInVersion.length === 1 ? '' : 's'}
            </span>
            {editingDate ? (
              <>
                <input
                  className="ins-input"
                  type="date"
                  value={dateDraft}
                  onChange={(e) => setDateDraft(e.target.value)}
                />
                <button type="button" className="ins-linkbtn" disabled={busy} onClick={saveDate}>
                  Save
                </button>
                <button type="button" className="ins-linkbtn" disabled={busy} onClick={() => setEditingDate(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" className="ins-linkbtn" disabled={busy} onClick={startEditDate}>
                Edit date
              </button>
            )}
            <button type="button" className="ins-linkbtn ins-linkbtn--danger" disabled={busy || versions.length <= 1} onClick={removeVersion}>
              Delete this version
            </button>
          </>
        ) : (
          <span className="ins-muted">Not created yet — add a screen below to start it.</span>
        )}
      </div>

      {/* The same portrait tiles as the flow builder's pool and the card
          picker, so a screen looks the same in every admin tab — these used
          to be square 84px crops, which cut every phone screen to its top
          third and lined up with nothing else on the page. */}
      <div className="ins-flowbuild-pool">
        {!collision && screensInVersion.map((file) => {
          const url = thumbUrl(file);
          return (
            <div key={file.id} className="ins-flowbuild-tile ins-admin-thumb-card" title={file.file}>
              <span className="ins-flowbuild-tile-shot">
                {url ? <img src={url} alt="" loading="lazy" /> : <span className="ins-flowbuild-noshot" aria-hidden />}
                <button
                  type="button"
                  className="ins-admin-thumb-remove"
                  aria-label={`Delete ${screenLabel(file)}`}
                  onClick={() => removeScreen(file)}
                  disabled={busy}
                >
                  <TrashIcon size={12} />
                </button>
              </span>
              <span className="ins-flowbuild-tile-name">{screenLabel(file)}</span>
            </div>
          );
        })}
        {!collision && screensInVersion.length === 0 && <p className="ins-muted">No screens in this version yet.</p>}
      </div>

      <div className="ins-admin-actions">
        {platforms.length > 1 && (
          <div className="ins-segmented" role="radiogroup" aria-label="Platform">
            {platforms.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={platform === p}
                className={`ins-segmented-item ${platform === p ? 'is-active' : ''}`}
                onClick={() => setPlatform(p as Platform)}
              >
                {PLATFORM_LABEL[p as Platform] ?? p}
              </button>
            ))}
          </div>
        )}
        <button type="button" className="ins-btn ins-btn--sm" disabled={busy || Boolean(collision)} onClick={() => inputRef.current?.click()}>
          <UploadIcon size={13} /> Add screens to {targetLabel}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/webp,image/jpeg"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) addScreens(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}

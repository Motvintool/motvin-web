'use client';

import { useEffect, useRef, useState } from 'react';
import { adminApi, type AdminAppRecord, type AdminFlowRecord, type AdminScreenFile, type AdminState } from '@/lib/inspirations/admin';
import { splitScreenFile } from '@/lib/inspirations/screenPaths';
import { localDateString } from '@/lib/inspirations/dates';
import { PLATFORM_LABEL, SCREEN_TYPE_LABEL } from '@/lib/inspirations/taxonomy';
import type { Platform, ScreenType } from '@/lib/inspirations/types';
import { CheckIcon, PencilIcon, PlusIcon, TrashIcon, UploadIcon } from '../Icons';
import { screenLabel, thumbUrl } from './screenFiles';
import { AdminImageLightbox } from './AdminImageLightbox';
import { ScreenRow } from './ScreensPanel';
import { describeAddedScreens } from '@/lib/inspirations/admin-chatbot/ingestJobs';

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
  flows,
  screenTypes,
  busy,
  run,
  state,
}: {
  app: AdminAppRecord;
  files: AdminScreenFile[];
  /** This app's flows: added screens can join one. */
  flows: AdminFlowRecord[];
  /** The library's screen types: added screens can be filed under one. */
  screenTypes: ScreenType[];
  busy: boolean;
  run: (action: () => Promise<unknown>, onDone?: () => void) => Promise<boolean>;
  /** The whole store: given on an app's page, where each screen's details can be edited here too. */
  state?: AdminState;
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
  // The screen opened full-size from a thumbnail, if any.
  const [preview, setPreview] = useState<{ url: string; label: string } | null>(null);
  // The screen whose details (name, type, tags, style) are open above the grid.
  const [editingScreen, setEditingScreen] = useState<string | null>(null);
  const screenEditRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (editingScreen) screenEditRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [editingScreen]);
  const editingFile = editingScreen ? files.find((f) => f.id === editingScreen) : undefined;
  // Select mode: tiles toggle instead of previewing, and a toolbar deletes the
  // ticked ones in one go. `picked` holds file ids and is pruned against the
  // version's current files, so screens that vanish after a delete drop out.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // Asking "delete this whole version?" inline, instead of in a browser dialog.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Image files being dragged over the screens: they drop into this version.
  const [dropping, setDropping] = useState(false);
  // Reorder mode: the version's screen ids in the order being arranged (null when not reordering),
  // and the one being dragged into place.
  const [ordering, setOrdering] = useState<string[] | null>(null);
  // How screens added next are filed: a type ('' = worked out from the file name, as before) and a flow
  // to append them to ('' = none).
  const [addType, setAddType] = useState<ScreenType | ''>('');
  const [addFlow, setAddFlow] = useState('');
  // After adding: whether the new screens are being described (named, typed, tagged) or why they couldn't be.
  const [describeNote, setDescribeNote] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const managerRef = useRef<HTMLDivElement>(null);

  // Dragging a screen near the top or bottom of what's scrolling the grid
  // (the admin drawer, or the page) scrolls it, faster the nearer the edge,
  // so a screen can be carried to a place that's out of view.
  useEffect(() => {
    if (!dragId) return;
    let scroller: HTMLElement | null = managerRef.current?.parentElement ?? null;
    while (scroller && !(/(auto|scroll)/.test(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight)) {
      scroller = scroller.parentElement;
    }
    const EDGE = 90;
    const MAX_STEP = 22;
    let speed = 0;
    let raf = 0;
    const tick = () => {
      if (speed) {
        if (scroller) scroller.scrollBy(0, speed);
        else window.scrollBy(0, speed);
      }
      raf = requestAnimationFrame(tick);
    };
    const onDragOver = (e: DragEvent) => {
      const box = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      const fromTop = e.clientY - box.top;
      const fromBottom = box.bottom - e.clientY;
      speed =
        fromTop < EDGE ? -Math.ceil(((EDGE - Math.max(0, fromTop)) / EDGE) * MAX_STEP) : fromBottom < EDGE ? Math.ceil(((EDGE - Math.max(0, fromBottom)) / EDGE) * MAX_STEP) : 0;
    };
    const stop = () => {
      speed = 0;
    };
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('drop', stop);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('drop', stop);
    };
  }, [dragId]);

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
  const selectedFiles = screensInVersion.filter((f) => picked.has(f.id));

  const toggleSelecting = () => {
    setSelecting((on) => !on);
    setPicked(new Set());
  };
  const togglePicked = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pickExisting = (id: string) => {
    setOrdering(null);
    setSelecting(false);
    setPicked(new Set());
    setConfirmingDelete(false);
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

  // One at a time: every delete rebuilds the store's index, so running them
  // together would have the rebuilds race each other.
  const removeSelected = () => {
    const targets = selectedFiles;
    if (!targets.length) return;
    if (!window.confirm(`Delete ${targets.length} screen${targets.length === 1 ? '' : 's'}? The images are removed from the store.`)) return;
    void run(
      async () => {
        for (const file of targets) {
          const { name, version, flow } = splitScreenFile(file.file, file.version);
          await adminApi.deleteScreen(file.platform, file.appId, name, version, flow);
        }
      },
      () => {
        setPicked(new Set());
        setSelecting(false);
      },
    );
  };

  // This version's flows: the ones with a screen in it (a flow id names its version, but the record doesn't).
  const versionIds = new Set(screensInVersion.map((f) => f.id));
  const versionFlows = flows.filter((f) => f.screenIds.some((id) => versionIds.has(id)));
  const joinFlow = versionFlows.some((f) => f.id === addFlow) ? addFlow : '';

  const addScreens = (fileList: FileList) => {
    if (collision) return;
    const picked = Array.from(fileList);
    if (!picked.length) return;
    const wasStagingNew = draftVersion !== null;
    const options = { screenType: addType || undefined, addToFlow: joinFlow || undefined };
    // One after another, so they join the flow in the order they were picked
    // (and each upload's rebuild doesn't race the next).
    void run(
      async () => {
        const added: string[] = [];
        for (const f of picked) {
          const result = await adminApi.uploadScreen(platform, app.id, f.name, f, false, target, undefined, options);
          added.push(result.file.replace(`${platform}/${app.id}/`, ''));
        }
        // Then filled in like recorded screens — a name, states, UI elements, style (and the type, unless picked) —
        // as a run the dock shows. The screens are in either way; this only says when it couldn't start.
        try {
          await describeAddedScreens(app.id, platform, added, app.name);
          setDescribeNote(`Describing ${added.length} new screen${added.length === 1 ? '' : 's'} — names and details appear when the run ends.`);
        } catch (error) {
          setDescribeNote(`Added, but not described yet: ${(error as Error).message}`);
        }
      },
      // Its first screen just landed, so it is a real version now — switch
      // back to the normal tab list, on the version that was just staged.
      wasStagingNew ? () => pickExisting(target) : undefined,
    );
  };

  const pickFiles = () => inputRef.current?.click();
  const canAdd = !busy && !collision && !selecting && !ordering;

  // Reordering: drag a tile onto another to put it there, or nudge it with its arrows; Save writes the lot.
  const startOrdering = () => setOrdering(screensInVersion.map((f) => f.id));
  const moveTo = (id: string, targetId: string, after: boolean) =>
    setOrdering((list) => {
      if (!list || id === targetId) return list;
      const rest = list.filter((x) => x !== id);
      const at = rest.indexOf(targetId) + (after ? 1 : 0);
      return [...rest.slice(0, at), id, ...rest.slice(at)];
    });
  const nudge = (id: string, by: number) =>
    setOrdering((list) => {
      if (!list) return list;
      const from = list.indexOf(id);
      const to = Math.max(0, Math.min(list.length - 1, from + by));
      if (from === to) return list;
      const next = list.slice();
      next.splice(from, 1);
      next.splice(to, 0, id);
      return next;
    });
  const saveOrder = () => {
    if (!ordering) return;
    const byId = new Map(screensInVersion.map((f) => [f.id, f]));
    const screens = ordering
      .map((id) => byId.get(id))
      .filter((f): f is AdminScreenFile => Boolean(f))
      .map((f) => {
        const { name, flow } = splitScreenFile(f.file, f.version);
        return { platform: f.platform as Platform, file: name, ...(flow ? { flow } : {}) };
      });
    void run(() => adminApi.saveVersionOrder(app.id, target, screens), () => setOrdering(null));
  };
  // While reordering, the tiles follow the order being arranged.
  const shownFiles = ordering
    ? ordering.map((id) => screensInVersion.find((f) => f.id === id)).filter((f): f is AdminScreenFile => Boolean(f))
    : screensInVersion;
  // Only image files count as a drop; anything else is left to the page.
  const draggingImages = (e: React.DragEvent) => Array.from(e.dataTransfer.items).some((i) => i.kind === 'file' && i.type.startsWith('image/'));

  const removeVersion = () => {
    if (versions.length <= 1 || !activeVersion) return;
    const fallback = versions.find((v) => v.id !== target)?.id ?? '';
    void run(() => adminApi.deleteVersion(app.id, target), () => pickExisting(fallback));
  };

  return (
    <div ref={managerRef} className="ins-admin-versions-manager">
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

      {/* One action at a time: starting one replaces the whole row with just that
          action's own controls, and finishing or cancelling brings the row back. */}
      <div className="ins-admin-actions ins-admin-actions--tight">
        {collision ? null : activeVersion ? (
          editingDate ? (
            <>
              <input className="ins-input" type="date" value={dateDraft} onChange={(e) => setDateDraft(e.target.value)} />
              <button type="button" className="ins-linkbtn" disabled={busy} onClick={saveDate}>
                Save
              </button>
              <button type="button" className="ins-linkbtn" disabled={busy} onClick={() => setEditingDate(false)}>
                Cancel
              </button>
            </>
          ) : ordering ? (
            <>
              <span className="ins-muted">Drag screens into place, or use their arrows</span>
              <button type="button" className="ins-linkbtn" disabled={busy} onClick={saveOrder}>
                Save order
              </button>
              <button type="button" className="ins-linkbtn" disabled={busy} onClick={() => setOrdering(null)}>
                Cancel
              </button>
            </>
          ) : selecting ? (
            <>
              <span className="ins-muted">
                {selectedFiles.length} of {screensInVersion.length} selected
              </span>
              <button
                type="button"
                className="ins-linkbtn"
                disabled={busy}
                onClick={() =>
                  setPicked(selectedFiles.length === screensInVersion.length ? new Set() : new Set(screensInVersion.map((f) => f.id)))
                }
              >
                {selectedFiles.length === screensInVersion.length ? 'Clear' : 'Select all'}
              </button>
              <button
                type="button"
                className="ins-linkbtn ins-linkbtn--danger"
                disabled={busy || selectedFiles.length === 0}
                onClick={removeSelected}
              >
                Delete {selectedFiles.length > 0 ? selectedFiles.length : ''} selected
              </button>
              <button type="button" className="ins-linkbtn" disabled={busy} onClick={toggleSelecting}>
                Done
              </button>
            </>
          ) : confirmingDelete ? (
            <>
              <span className="ins-muted">
                Delete the &ldquo;{versionLabel(activeVersion)}&rdquo; version? Its {screensInVersion.length} screen
                {screensInVersion.length === 1 ? '' : 's'} are removed for good.
              </span>
              <button type="button" className="ins-linkbtn ins-linkbtn--danger" disabled={busy} onClick={removeVersion}>
                Delete
              </button>
              <button type="button" className="ins-linkbtn" disabled={busy} onClick={() => setConfirmingDelete(false)}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <span className="ins-muted">
                {screensInVersion.length} screen{screensInVersion.length === 1 ? '' : 's'}
              </span>
              <button type="button" className="ins-linkbtn" disabled={busy} onClick={pickFiles}>
                Add screens
              </button>
              <button type="button" className="ins-linkbtn" disabled={busy} onClick={startEditDate}>
                Edit date
              </button>
              <button type="button" className="ins-linkbtn" disabled={busy || screensInVersion.length < 2} onClick={startOrdering}>
                Reorder
              </button>
              <button type="button" className="ins-linkbtn" disabled={busy || screensInVersion.length === 0} onClick={toggleSelecting}>
                Select screens
              </button>
              <button
                type="button"
                className="ins-linkbtn ins-linkbtn--danger"
                disabled={busy || versions.length <= 1}
                onClick={() => setConfirmingDelete(true)}
              >
                Delete this version
              </button>
            </>
          )
        ) : (
          <span className="ins-muted">Not created yet — add a screen below to start it.</span>
        )}
      </div>

      {describeNote && <p className="ins-muted ins-admin-status">{describeNote}</p>}

      {/* How the next screens added are filed: a type, and a flow to join (at its end). */}
      {!collision && !selecting && !ordering && (
        <div className="ins-admin-actions ins-admin-actions--tight ins-admin-add-options">
          <span className="ins-muted">Add new screens as</span>
          <select className="ins-input" aria-label="Screen type for added screens" value={addType} onChange={(e) => setAddType(e.target.value as ScreenType | '')}>
            <option value="">Type from file name</option>
            {screenTypes.map((t) => (
              <option key={t} value={t}>
                {SCREEN_TYPE_LABEL[t] ?? t}
              </option>
            ))}
          </select>
          <span className="ins-muted">in</span>
          <select className="ins-input" aria-label="Flow for added screens" value={joinFlow} onChange={(e) => setAddFlow(e.target.value)}>
            <option value="">No flow</option>
            {versionFlows.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.screenIds.length})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* The same portrait tiles as the flow builder's pool and the card
          picker, so a screen looks the same in every admin tab — these used
          to be square 84px crops, which cut every phone screen to its top
          third and lined up with nothing else on the page. */}
      {state && editingFile && (
        <div ref={screenEditRef} className="ins-avs-screen-edit">
          <ScreenRow
            key={editingFile.id}
            file={editingFile}
            state={state}
            busy={busy}
            run={run}
            editing
            onEdit={() => setEditingScreen(null)}
            onClose={() => setEditingScreen(null)}
          />
        </div>
      )}
      {/* Image files dropped anywhere on the screens go into this version, as "Add screens" would. */}
      <div
        className={`ins-flowbuild-pool ins-flowbuild-pool--full ${dropping ? 'is-dropping' : ''}`}
        onDragOver={(e) => {
          if (!canAdd || !draggingImages(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setDropping(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
        }}
        onDrop={(e) => {
          if (!canAdd) return;
          e.preventDefault();
          setDropping(false);
          if (e.dataTransfer.files.length) addScreens(e.dataTransfer.files);
        }}
      >
        {/* The first tile: add screens here, by picking or dropping image files. */}
        {!collision && !selecting && !ordering && (
          <button type="button" className="ins-flowbuild-tile ins-admin-add-tile" disabled={busy} onClick={pickFiles}>
            <span className="ins-flowbuild-tile-shot ins-admin-add-tile-shot">
              <PlusIcon size={20} />
              <span>{dropping ? 'Drop to add' : 'Add screens'}</span>
            </span>
            <span className="ins-flowbuild-tile-name">or drop files</span>
          </button>
        )}
        {!collision && shownFiles.map((file, position) => {
          const url = thumbUrl(file);
          return (
            <div
              key={file.id}
              className={`ins-flowbuild-tile ins-admin-thumb-card ${selecting && picked.has(file.id) ? 'is-selected' : ''} ${ordering ? 'is-ordering' : ''} ${dragId === file.id ? 'is-dragging' : ''}`}
              title={file.file}
              {...(ordering && {
                draggable: true,
                onDragStart: (e: React.DragEvent) => {
                  e.dataTransfer.effectAllowed = 'move';
                  setDragId(file.id);
                },
                onDragOver: (e: React.DragEvent) => {
                  if (!dragId) return;
                  e.preventDefault();
                  const box = e.currentTarget.getBoundingClientRect();
                  moveTo(dragId, file.id, e.clientX > box.left + box.width / 2);
                },
                onDrop: (e: React.DragEvent) => e.preventDefault(),
                onDragEnd: () => setDragId(null),
              })}
            >
              <span
                className={`ins-flowbuild-tile-shot ${(url || selecting) && !ordering ? 'is-previewable' : ''}`}
                {...(ordering
                  ? {}
                  : selecting
                  ? {
                      role: 'checkbox',
                      tabIndex: 0,
                      'aria-checked': picked.has(file.id),
                      'aria-label': `Select ${screenLabel(file)}`,
                      onClick: () => togglePicked(file.id),
                      onKeyDown: (e: React.KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          togglePicked(file.id);
                        }
                      },
                    }
                  : url
                    ? {
                        role: 'button',
                        tabIndex: 0,
                        'aria-label': `Preview ${screenLabel(file)}`,
                        onClick: () => setPreview({ url, label: screenLabel(file) }),
                        onKeyDown: (e: React.KeyboardEvent) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setPreview({ url, label: screenLabel(file) });
                          }
                        },
                      }
                    : {})}
              >
                {url ? <img src={url} alt="" loading="lazy" draggable={false} /> : <span className="ins-flowbuild-noshot" aria-hidden />}
                {selecting && (
                  <span className={`ins-admin-thumb-check ${picked.has(file.id) ? 'is-on' : ''}`} aria-hidden>
                    {picked.has(file.id) && <CheckIcon size={12} />}
                  </span>
                )}
                {/* Its place in the order, while reordering. */}
                {ordering && <span className="ins-admin-thumb-order">{position + 1}</span>}
                {!selecting && !ordering && state && (
                <button
                  type="button"
                  className={`ins-admin-thumb-edit ${editingScreen === file.id ? 'is-on' : ''}`}
                  aria-label={`Edit details of ${screenLabel(file)}`}
                  aria-pressed={editingScreen === file.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingScreen(editingScreen === file.id ? null : file.id);
                  }}
                  disabled={busy}
                >
                  <PencilIcon size={11} />
                </button>
                )}
                {!selecting && !ordering && (
                <button
                  type="button"
                  className="ins-admin-thumb-remove"
                  aria-label={`Delete ${screenLabel(file)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeScreen(file);
                  }}
                  disabled={busy}
                >
                  <TrashIcon size={12} />
                </button>
                )}
              </span>
              {ordering ? (
                <span className="ins-admin-thumb-nudge">
                  <button type="button" aria-label={`Move ${screenLabel(file)} earlier`} disabled={busy || position === 0} onClick={() => nudge(file.id, -1)}>
                    ←
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${screenLabel(file)} later`}
                    disabled={busy || position === shownFiles.length - 1}
                    onClick={() => nudge(file.id, 1)}
                  >
                    →
                  </button>
                </span>
              ) : (
                <span className="ins-flowbuild-tile-name">{screenLabel(file)}</span>
              )}
            </div>
          );
        })}
      </div>

      {preview && <AdminImageLightbox url={preview.url} label={preview.label} onClose={() => setPreview(null)} />}

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

'use client';

import Link from 'next/link';
import { useRef, useState, type DragEvent } from 'react';
import { adminApi, safeFileName, type AdminState } from '@/lib/inspirations/admin';
import { describeAddedScreens } from '@/lib/inspirations/admin-chatbot/ingestJobs';
import { inspirationsApi } from '@/lib/inspirations/api';
import { dayLabel, localDateString } from '@/lib/inspirations/dates';
import { INDUSTRY_LABEL, PLATFORM_LABEL, screenTypeLabel, styleLabel } from '@/lib/inspirations/taxonomy';
import { splitScreenFile } from '@/lib/inspirations/screenPaths';
import { PICKABLE_INDUSTRIES, SCREEN_TYPES, STYLES, type Industry, type Platform, type ScreenType, type Style } from '@/lib/inspirations/types';
import { ArrowUpIcon, CheckIcon, ChevronDownIcon, CloseIcon, ExternalIcon, SearchIcon, UploadIcon } from '../Icons';
import { ChoiceCards, Summary, Wizard } from './Wizard';

/**
 * Manual Upload: screenshots into the store, step by step — the app and its
 * version, the screenshots in order, who fills in their details (the AI, or
 * the admin by hand), the flow they join, then a last look and Upload.
 *
 * Nothing is written until Upload — a new app included. Each screenshot keeps
 * its own result, so a partial failure shows per file rather than as one lost
 * batch.
 */

const STEPS = [
  { id: 'app', label: 'App' },
  { id: 'screens', label: 'Screenshots' },
  { id: 'details', label: 'Details' },
  { id: 'flow', label: 'Flow' },
  { id: 'check', label: 'Check & upload' },
];

/** The version picker's "new version" option, alongside the app's real ones. */
const NEW_VERSION = '__new__';
/** The flow picker's "new flow" option. */
const NEW_FLOW = '__new-flow__';

type Staged = {
  key: string;
  file: File;
  name: string;
  screenType: ScreenType;
  previewUrl: string;
  /** Details typed by hand ("Fill details: By hand"); with the AI they are left empty. */
  title: string;
  tags: string;
  elements: string;
  style: Style[];
  status: 'staged' | 'uploading' | 'done' | 'failed';
  message?: string;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

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
}: {
  state: AdminState;
  busy: boolean;
  onUploaded: () => Promise<void> | void;
  run?: (action: () => Promise<unknown>, onDone?: () => void) => Promise<boolean>;
}) {
  const [step, setStep] = useState(0);
  const [appMode, setAppMode] = useState<'new' | 'old'>(state.apps.length === 0 ? 'new' : 'old');
  // Nothing picked until the admin picks an app.
  const [appId, setAppId] = useState('');
  const [appSearch, setAppSearch] = useState('');
  // The app list folds away once an app is picked; Change opens it again.
  const [picking, setPicking] = useState(true);
  const [newApp, setNewApp] = useState({ name: '', id: '', industry: 'unsorted' as Industry });
  const [idTouched, setIdTouched] = useState(false);
  const [platform, setPlatform] = useState<Platform>('ios');
  // "New app": blank means today. "Old app": an existing version's id, or NEW_VERSION to start another one.
  const [version, setVersion] = useState('');
  const [versionTarget, setVersionTarget] = useState(NEW_VERSION);
  const [newVersionDate, setNewVersionDate] = useState(localDateString());
  const [overwrite, setOverwrite] = useState(false);
  const [queue, setQueue] = useState<Staged[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [finished, setFinished] = useState<{ appId: string; uploaded: number; failed: number } | null>(null);
  const [describeNote, setDescribeNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Who fills in each screenshot's details: the AI after upload, or the admin here, before it.
  const [fillBy, setFillBy] = useState<'ai' | 'hand'>('ai');
  // The flow the screenshots go into, in the order they are listed: none, one of the version's, or a new one.
  const [flowMode, setFlowMode] = useState<'none' | 'existing' | 'new'>('none');
  const [flowChoice, setFlowChoice] = useState('');
  const [newFlow, setNewFlow] = useState({ name: '', parent: '' });
  const [open, setOpen] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedApp = appMode === 'old' ? state.apps.find((a) => a.id === appId) ?? null : null;
  const newAppId = (newApp.id || slugify(newApp.name)).trim();
  const targetAppId = appMode === 'old' ? appId : newAppId;
  const targetAppName = appMode === 'old' ? selectedApp?.name ?? '' : newApp.name.trim();
  const newAppTaken = appMode === 'new' && Boolean(newAppId) && state.apps.some((a) => a.id === newAppId);
  // A blank date resolves to today, so the collision check has to resolve it the same way.
  const newVersionCollision =
    selectedApp && versionTarget === NEW_VERSION
      ? ((selectedApp.versions ?? []).find((v) => v.id === (newVersionDate || localDateString())) ?? null)
      : null;

  // Picking a different existing app starts back at its own current version — adjusted during render, not in an effect.
  const modeKey = `${appMode}:${appId}`;
  const [prevModeKey, setPrevModeKey] = useState(modeKey);
  if (modeKey !== prevModeKey) {
    setPrevModeKey(modeKey);
    if (appMode === 'old') {
      // Its latest version by default; a new one only when asked for.
      setVersionTarget(selectedApp?.versions?.find((v) => v.isLatest)?.id ?? selectedApp?.currentVersion ?? selectedApp?.versions?.[0]?.id ?? NEW_VERSION);
      setNewVersionDate(localDateString());
      // The app's own platform: where most of its screens are.
      const counts = new Map<Platform, number>();
      for (const file of state.files) if (file.appId === appId) counts.set(file.platform, (counts.get(file.platform) ?? 0) + 1);
      const main = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? selectedApp?.platforms?.[0];
      if (main) setPlatform(main);
    }
  }

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
        title: '',
        tags: '',
        elements: '',
        style: [],
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

  const move = (key: string, by: -1 | 1) => {
    setQueue((q) => {
      const at = q.findIndex((item) => item.key === key);
      const to = at + by;
      if (at < 0 || to < 0 || to >= q.length) return q;
      const next = [...q];
      [next[at], next[to]] = [next[to], next[at]];
      return next;
    });
  };

  // "Old app" always resolves to a concrete date — a blank "new version" date lands on today, never on the current version.
  const resolvedVersion =
    appMode === 'old'
      ? versionTarget === NEW_VERSION
        ? newVersionDate || localDateString()
        : versionTarget
      : version || localDateString();

  // The flows of the version the screenshots go to (none yet for a new app or version).
  const versionFlows = state.flows.filter((flow) => flow.appId === targetAppId && flow.platform === platform && flow.screenIds.some((sid) => sid.includes(`-versions-${resolvedVersion}-`)));
  const areaFlows = versionFlows.filter((flow) => !flow.parentId || !versionFlows.some((other) => other.id === flow.parentId));
  const flowName = (id: string) => {
    const flow = versionFlows.find((entry) => entry.id === id);
    const parent = flow?.parentId ? versionFlows.find((other) => other.id === flow.parentId) : null;
    return flow ? `${parent ? `${parent.name} › ` : ''}${flow.name}` : '';
  };
  const chosenFlow = flowMode === 'new' ? NEW_FLOW : flowMode === 'existing' && versionFlows.some((flow) => flow.id === flowChoice) ? flowChoice : '';

  const uploadAll = async () => {
    const id = targetAppId;
    if (!id) return;
    setError(null);
    setUploading(true);
    setDescribeNote(null);
    // A new app is made only now, when its screenshots go in.
    if (appMode === 'new' && !state.apps.some((a) => a.id === id)) {
      try {
        await adminApi.saveApp({ id, name: newApp.name.trim(), industry: newApp.industry });
      } catch (failure) {
        setError((failure as Error).message);
        setUploading(false);
        return;
      }
    }
    let flowId = chosenFlow && chosenFlow !== NEW_FLOW ? chosenFlow : '';
    const added: string[] = [];
    let failed = 0;
    for (const item of queue) {
      if (item.status === 'done') continue;
      update(item.key, { status: 'uploading', message: undefined });
      try {
        // The screen type must lead the file name: that is what the builder reads when no sidecar exists.
        const base = item.name.replace(/\.[^.]+$/, '');
        const ext = item.name.slice(item.name.lastIndexOf('.'));
        const type = slugify(item.screenType) || 'other';
        const fileName = base.startsWith(type) ? item.name : `${type}-${base}${ext}`;

        const uploaded = await adminApi.uploadScreen(platform, id, fileName, item.file, overwrite, resolvedVersion, undefined, { addToFlow: flowId || undefined });
        // The stored path comes back as `<platform>/<app>/versions/<date>/…`; the details are saved by the part under the app.
        const stored = uploaded.file.replace(`${platform}/${id}/`, '');
        const storedVersion = /^versions\/([^/]+)\//.exec(stored)?.[1] ?? '';
        const where = splitScreenFile(stored, storedVersion);
        // A new flow starts with its first screenshot; the rest join it in order.
        if (chosenFlow === NEW_FLOW && !flowId) {
          const day = storedVersion || resolvedVersion;
          const base = `${id}-${platform}-versions-${day}-${slugify(newFlow.name)}`;
          let flowKey = base;
          for (let n = 2; state.flows.some((flow) => flow.id === flowKey); n++) flowKey = `${base}-${n}`;
          const parent = areaFlows.find((flow) => flow.id === newFlow.parent);
          await adminApi.saveFlow({ id: flowKey, appId: id, name: newFlow.name.trim(), category: parent?.category ?? 'discovery', platform, screenIds: [uploaded.id], parentId: parent?.id ?? null });
          flowId = flowKey;
        }
        const list = (text: string) => text.split(',').map((entry) => entry.trim()).filter(Boolean);
        if (fillBy === 'hand') {
          // Filled by hand: written as the screen's details, and the AI leaves it alone.
          await adminApi.saveScreenMeta(platform, id, where.name, { name: item.title.trim() || undefined, screenType: type as ScreenType, tags: list(item.tags), elements: list(item.elements), style: item.style }, where.version, where.flow);
        } else if (!(SCREEN_TYPES as readonly string[]).includes(type)) {
          // The builder only reads known types from a file name, so a new type is also written to the screen's details.
          await adminApi.saveScreenMeta(platform, id, where.name, { screenType: type as ScreenType }, where.version, where.flow);
        }
        added.push(stored);
        update(item.key, { status: 'done', message: 'Uploaded' });
      } catch (err) {
        failed += 1;
        update(item.key, { status: 'failed', message: (err as Error).message });
      }
    }
    setUploading(false);
    await onUploaded();
    setFinished({ appId: id, uploaded: added.length, failed });
    // Then filled in like recorded screens — a name, states, UI elements, style, colours (and the type, when left as "other").
    if (added.length && fillBy === 'ai') {
      try {
        await describeAddedScreens(id, platform, added, targetAppName);
        setDescribeNote(`The AI is filling in ${added.length === 1 ? 'its' : 'their'} details — names, types, UI elements, tags and style appear in a minute. You can follow it in the agent dock.`);
      } catch (failure) {
        setDescribeNote(`Uploaded, but the AI could not start on the details: ${(failure as Error).message}`);
      }
    }
  };

  // Back to a fresh start, keeping the app and version for the next screenshots.
  const again = () => {
    queue.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setQueue([]);
    setFinished(null);
    setDescribeNote(null);
    setFlowMode('none');
    setNewFlow({ name: '', parent: '' });
    if (appMode === 'new') {
      setAppId(newAppId);
      setAppMode('old');
      setNewApp({ name: '', id: '', industry: 'unsorted' });
      setIdTouched(false);
    }
    setStep(1);
  };

  const pending = queue.filter((i) => i.status !== 'done').length;
  const versionText = appMode === 'old' && versionTarget !== NEW_VERSION ? `${dayLabel(versionTarget)}${(selectedApp?.versions ?? []).find((v) => v.id === versionTarget)?.isLatest ? ' — Latest' : ''} (adding to it)` : `${dayLabel(resolvedVersion)} (new version)`;

  const valid = [
    appMode === 'old' ? Boolean(selectedApp) && !newVersionCollision : Boolean(newApp.name.trim()) && Boolean(newAppId) && newApp.industry !== 'unsorted' && !newAppTaken,
    queue.length > 0,
    queue.every((item) => slugify(item.screenType)),
    flowMode !== 'new' ? flowMode !== 'existing' || Boolean(chosenFlow) : Boolean(newFlow.name.trim()),
    pending > 0,
  ];
  const go = (index: number) => {
    if (index < 0 || index >= STEPS.length) return;
    // Forward only through complete steps.
    if (index > step && !valid.slice(0, index).every(Boolean)) return;
    setStep(index);
  };

  const titles = [
    ['Which app are these screenshots for?', 'Pick the app, then the version the screenshots belong to.'],
    ['Add the screenshots', 'Drop them in, in the order a person sees them — that is the order they join a flow in. Move them with the arrows.'],
    ['Who fills in the details?', 'Every screen needs a name, a type, its UI elements, tags and a style. The AI can write them, or you can type them.'],
    ['Do they belong to a flow?', 'A flow is a task from start to end, like “Logging in with email”. Leave them loose, add them to one, or start a new one.'],
    [finished ? (finished.failed ? 'Uploaded, with problems' : 'Uploaded') : 'Check and upload', finished ? undefined : 'A last look before anything is saved.'],
  ] as const;

  return (
    <Wizard
      steps={STEPS}
      current={step}
      onStep={go}
      title={titles[step][0]}
      description={titles[step][1]}
      canNext={valid[step]}
      busy={uploading || busy}
      nextLabel={`Upload ${pending} screenshot${pending === 1 ? '' : 's'}`}
      onNext={() => void uploadAll()}
      hideFooter={Boolean(finished)}
      footerNote={
        step === 0 && appMode === 'old' && !selectedApp
          ? 'Pick an app to go on.'
          : step === 0 && newVersionCollision
          ? 'A version with that date already exists — pick it in the list above, or choose another date.'
          : step === 0 && newAppTaken
            ? 'An app with that id is already in the library — pick it as an existing app.'
            : step === 1 && !queue.length
              ? 'Add at least one screenshot.'
              : step === 3 && flowMode === 'new' && !newFlow.name.trim()
                ? 'Name the new flow.'
                : null
      }
    >
      <datalist id="ins-upload-screen-types">
        {(state.vocabulary.screenTypes ?? SCREEN_TYPES).map((t) => (
          <option key={t} value={t}>
            {screenTypeLabel(t)}
          </option>
        ))}
      </datalist>

      {step === 0 && (
        <div className="ins-wizard-stack">
          <div className="ins-segmented" role="radiogroup" aria-label="New or existing app">
            {([['old', 'App in the library'], ['new', 'New app']] as const).map(([value, text]) => (
              <button key={value} type="button" role="radio" aria-checked={appMode === value} className={`ins-segmented-item ${appMode === value ? 'is-active' : ''}`} onClick={() => setAppMode(value)}>
                {text}
              </button>
            ))}
          </div>

          {appMode === 'old' ? (
            <>
              {selectedApp && !picking ? (
                <div className="ins-field">
                  <span className="ins-field-label">App</span>
                  <div className="ins-app-chosen">
                    {(() => {
                      const logo = state.logos.find((name) => name.startsWith(`${selectedApp.id}.`));
                      return logo ? <img src={inspirationsApi.mediaUrl(`/api/inspirations/logos/${logo}`) ?? undefined} alt="" /> : <span className="ins-app-option-blank">{selectedApp.name.slice(0, 1)}</span>;
                    })()}
                    <span className="ins-app-option-text">
                      <span>{selectedApp.name}</span>
                      <span className="ins-muted">
                        {state.files.filter((file) => file.appId === selectedApp.id && file.published).length} screens · {plural((selectedApp.versions ?? []).length, 'version')}
                      </span>
                    </span>
                    <button type="button" className="ins-btn ins-btn--sm" onClick={() => setPicking(true)}>
                      Change
                    </button>
                  </div>
                </div>
              ) : (
              <div className="ins-field">
                  <span className="ins-field-label">App</span>
                  <label className="ins-app-search">
                    <SearchIcon size={14} />
                    <input value={appSearch} onChange={(e) => setAppSearch(e.target.value)} placeholder={`Search ${state.apps.length} apps`} aria-label="Search apps" />
                  </label>
                  <ul className="ins-app-picker" role="listbox" aria-label="Apps">
                    {[...state.apps]
                      .filter((app) => !appSearch.trim() || app.name.toLowerCase().includes(appSearch.trim().toLowerCase()))
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((app) => {
                        const logo = state.logos.find((name) => name.startsWith(`${app.id}.`));
                        const screens = state.files.filter((file) => file.appId === app.id && file.published).length;
                        return (
                          <li key={app.id}>
                            <button type="button" role="option" aria-selected={appId === app.id} className={`ins-app-option ${appId === app.id ? 'is-on' : ''}`} onClick={() => { setAppId(app.id); setPicking(false); setAppSearch(''); }}>
                              {logo ? <img src={inspirationsApi.mediaUrl(`/api/inspirations/logos/${logo}`) ?? undefined} alt="" /> : <span className="ins-app-option-blank">{app.name.slice(0, 1)}</span>}
                              <span className="ins-app-option-text">
                                <span>{app.name}</span>
                                <span className="ins-muted">{screens} screens</span>
                              </span>
                              {appId === app.id && <CheckIcon size={14} />}
                            </button>
                          </li>
                        );
                      })}
                  </ul>
                </div>
  
                )}
              {selectedApp && (
                <>
                  <PlatformChips value={platform} onChange={setPlatform} options={state.vocabulary.platforms} />
                  <div className="ins-field">
                    <span className="ins-field-label">Version</span>
                    <div className="ins-version-list" role="radiogroup" aria-label="Version">
                      {(selectedApp.versions ?? []).map((v) => (
                        <button key={v.id} type="button" role="radio" aria-checked={versionTarget === v.id} className={`ins-version ${versionTarget === v.id ? 'is-on' : ''}`} onClick={() => setVersionTarget(v.id)}>
                          <span className="ins-choice-radio" aria-hidden />
                          <span className="ins-version-text">
                            <span>
                              Add to {dayLabel(v.id)} {v.isLatest && <span className="ins-pill is-version">Latest</span>}
                            </span>
                            <span className="ins-muted">{state.files.filter((file) => file.appId === selectedApp.id && file.version === v.id).length} screens in this version</span>
                          </span>
                        </button>
                      ))}
                      <div className={`ins-version ${versionTarget === NEW_VERSION ? 'is-on' : ''}`}>
                        <button type="button" role="radio" aria-checked={versionTarget === NEW_VERSION} className="ins-version-pick" onClick={() => setVersionTarget(NEW_VERSION)}>
                          <span className="ins-choice-radio" aria-hidden />
                          <span className="ins-version-text">
                            <span>Start a new version</span>
                            <span className="ins-muted">For screenshots of a newer release of the app</span>
                          </span>
                        </button>
                        {versionTarget === NEW_VERSION && <input className="ins-input ins-version-date" type="date" value={newVersionDate} onChange={(e) => setNewVersionDate(e.target.value || localDateString())} aria-label="New version's date" />}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div className="ins-wizard-grid">
                <label className="ins-field">
                  <span className="ins-field-label">App name</span>
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
                  <span className="ins-field-label">Category</span>
                  <select className="ins-input" value={newApp.industry} onChange={(e) => setNewApp((a) => ({ ...a, industry: e.target.value as Industry }))}>
                    {newApp.industry === 'unsorted' && (
                      <option value="unsorted" disabled>
                        Choose a category…
                      </option>
                    )}
                    {PICKABLE_INDUSTRIES.map((i) => (
                      <option key={i} value={i}>
                        {INDUSTRY_LABEL[i]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="ins-field">
                  <span className="ins-field-label">Version date</span>
                  <input className="ins-input" type="date" value={version || localDateString()} onChange={(e) => setVersion(e.target.value)} />
                </label>
              </div>
              <PlatformChips value={platform} onChange={setPlatform} options={state.vocabulary.platforms} />
              <details className="ins-wizard-more">
                <summary>
                  <ChevronDownIcon size={14} /> Folder name
                </summary>
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
                  <span className="ins-field-hint">Made from the name. It becomes the app’s address and the folder its screens are kept in.</span>
                </label>
              </details>
            </>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="ins-wizard-stack">
          <div
            className={`ins-dropzone ins-dropzone--compact ${dragging ? 'is-dragging' : ''}`}
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
              <p className="ins-dropzone-title">Drop screenshots here</p>
              <p className="ins-dropzone-desc">PNG, JPEG, WebP, AVIF or GIF — as many as you like.</p>
            </div>
            <button type="button" className="ins-btn" onClick={() => inputRef.current?.click()}>
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
            <ol className="ins-shot-grid">
              {queue.map((item, index) => (
                <li key={item.key} className="ins-shot">
                  <span className="ins-shot-n">{index + 1}</span>
                  <img src={item.previewUrl} alt="" />
                  <span className="ins-shot-name" title={item.name}>
                    {item.name}
                  </span>
                  <span className="ins-shot-tools">
                    <button type="button" className="ins-iconbtn ins-iconbtn--plain" aria-label={`Move ${item.name} earlier`} disabled={index === 0} onClick={() => move(item.key, -1)}>
                      <ArrowUpIcon size={13} style={{ rotate: '-90deg' }} />
                    </button>
                    <button type="button" className="ins-iconbtn ins-iconbtn--plain" aria-label={`Move ${item.name} later`} disabled={index === queue.length - 1} onClick={() => move(item.key, 1)}>
                      <ArrowUpIcon size={13} style={{ rotate: '90deg' }} />
                    </button>
                    <button type="button" className="ins-iconbtn ins-iconbtn--plain" aria-label={`Remove ${item.name}`} onClick={() => remove(item.key)}>
                      <CloseIcon size={13} />
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="ins-wizard-stack">
          <ChoiceCards
            label="Who fills in the details"
            value={fillBy}
            onChange={setFillBy}
            options={[
              { id: 'ai', title: 'The AI fills them in', desc: 'After upload it writes each screen’s name, type, UI elements, tags, style and colours — like screens from a recording.' },
              { id: 'hand', title: 'I’ll fill them in', desc: 'Type each screen’s details below. They are saved exactly as written; the AI is not used.' },
            ]}
          />
          {fillBy === 'hand' && (
            <ol className="ins-detail-list">
              {queue.map((item, index) => {
                const shown = open === item.key || (open === null && index === 0);
                const done = Boolean(item.title.trim());
                return (
                  <li key={item.key} className={`ins-detail ${shown ? 'is-open' : ''}`}>
                    <button type="button" className="ins-detail-head" onClick={() => setOpen(shown ? '' : item.key)} aria-expanded={shown}>
                      <img src={item.previewUrl} alt="" />
                      <span className="ins-detail-title">
                        <span>{item.title.trim() || `Screenshot ${index + 1}`}</span>
                        <span className="ins-muted">{done ? `${screenTypeLabel(item.screenType)}${item.elements ? ` · ${item.elements}` : ''}` : 'Not filled in yet'}</span>
                      </span>
                      {done && <CheckIcon size={14} />}
                      <ChevronDownIcon size={15} className="ins-detail-chevron" />
                    </button>
                    {shown && (
                      <div className="ins-detail-body">
                        <img src={item.previewUrl} alt="" className="ins-detail-preview" />
                        <div className="ins-wizard-grid">
                          <label className="ins-field">
                            <span className="ins-field-label">Screen name</span>
                            <input className="ins-input" value={item.title} onChange={(e) => update(item.key, { title: e.target.value })} placeholder="Email entry" />
                          </label>
                          <label className="ins-field">
                            <span className="ins-field-label">Screen type</span>
                            <input className="ins-input" list="ins-upload-screen-types" value={item.screenType} onChange={(e) => update(item.key, { screenType: e.target.value as ScreenType })} placeholder="login, home, paywall…" />
                          </label>
                          <label className="ins-field">
                            <span className="ins-field-label">UI elements</span>
                            <input className="ins-input" value={item.elements} onChange={(e) => update(item.key, { elements: e.target.value })} placeholder="text-field, button, keyboard" />
                            <span className="ins-field-hint">Comma separated. They drive UI Elements and Patterns.</span>
                          </label>
                          <label className="ins-field">
                            <span className="ins-field-label">Tags</span>
                            <input className="ins-input" value={item.tags} onChange={(e) => update(item.key, { tags: e.target.value })} placeholder="login, error" />
                            <span className="ins-field-hint">Comma separated.</span>
                          </label>
                          <fieldset className="ins-field ins-wizard-wide">
                            <legend className="ins-field-label">Style</legend>
                            <div className="ins-filter-options">
                              {Array.from(new Set<string>([...(state.vocabulary.styles ?? STYLES)])).map((option) => {
                                const on = item.style.includes(option as Style);
                                return (
                                  <button key={option} type="button" className={`ins-chip ins-chip--sm ${on ? 'is-active' : ''}`} aria-pressed={on} onClick={() => update(item.key, { style: on ? item.style.filter((entry) => entry !== option) : [...item.style, option as Style] })}>
                                    {styleLabel(option)}
                                  </button>
                                );
                              })}
                            </div>
                          </fieldset>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="ins-wizard-stack">
          <ChoiceCards
            label="Flow"
            value={flowMode}
            onChange={setFlowMode}
            options={[
              { id: 'none', title: 'No flow', desc: 'Loose screens — they show under Screens, UI Elements and Patterns.' },
              ...(versionFlows.length ? [{ id: 'existing' as const, title: 'Add to a flow', desc: `Join one of this version’s ${versionFlows.length} flows, at its end.` }] : []),
              { id: 'new', title: 'Start a new flow', desc: 'A new task made of these screenshots, in their order.' },
            ]}
          />
          {flowMode === 'existing' && (
            <label className="ins-field">
              <span className="ins-field-label">Flow</span>
              <select className="ins-input" value={chosenFlow} onChange={(e) => setFlowChoice(e.target.value)}>
                <option value="">Choose a flow…</option>
                {versionFlows.map((flow) => (
                  <option key={flow.id} value={flow.id}>
                    {flowName(flow.id)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {flowMode === 'new' && (
            <div className="ins-wizard-grid">
              <label className="ins-field">
                <span className="ins-field-label">Flow name</span>
                <input className="ins-input" value={newFlow.name} onChange={(e) => setNewFlow({ ...newFlow, name: e.target.value })} placeholder="Logging in with email" />
                <span className="ins-field-hint">A task, starting with an -ing word.</span>
              </label>
              <label className="ins-field">
                <span className="ins-field-label">Inside area</span>
                <select className="ins-input" value={newFlow.parent} onChange={(e) => setNewFlow({ ...newFlow, parent: e.target.value })}>
                  <option value="">None — an area of its own</option>
                  {areaFlows.map((flow) => (
                    <option key={flow.id} value={flow.id}>
                      {flow.name}
                    </option>
                  ))}
                </select>
                <span className="ins-field-hint">An area is one of the app’s sections, like Home or Settings.</span>
              </label>
            </div>
          )}
        </div>
      )}

      {step === 4 && !finished && (
        <div className="ins-wizard-stack">
          <Summary
            rows={[
              ['App', `${targetAppName}${appMode === 'new' ? ' (new app)' : ''}`],
              ['Platform', PLATFORM_LABEL[platform] ?? platform],
              ['Version', versionText],
              ['Screenshots', `${queue.length}`],
              ['Details', fillBy === 'ai' ? 'Filled in by the AI after upload' : `Filled in by hand (${queue.filter((item) => item.title.trim()).length} of ${queue.length} named)`],
              ['Flow', chosenFlow === NEW_FLOW ? `New flow “${newFlow.name.trim()}”${newFlow.parent ? ` inside ${flowName(newFlow.parent)}` : ''}` : chosenFlow ? `Added to “${flowName(chosenFlow)}”` : 'No flow'],
            ]}
          />
          <div className="ins-shot-strip">
            {queue.map((item) => (
              <span key={item.key} className={`ins-shot-mini is-${item.status}`}>
                <img src={item.previewUrl} alt="" />
                {item.status === 'uploading' && <span className="ins-spinner" />}
                {item.status === 'failed' && <span className="ins-admin-err">{item.message}</span>}
              </span>
            ))}
          </div>
          <label className="ins-checkline">
            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
            <span>Replace screenshots that have the same file name</span>
          </label>
          {error && <p className="ins-admin-err">{error}</p>}
        </div>
      )}

      {step === 4 && finished && (
        <div className="ins-wizard-stack">
          <div className={`ins-wizard-result ${finished.failed ? 'is-warn' : 'is-ok'}`}>
            <span className="ins-wizard-result-icon">{finished.failed ? '!' : <CheckIcon size={18} />}</span>
            <div>
              <p className="ins-wizard-result-title">
                {finished.uploaded} screenshot{finished.uploaded === 1 ? '' : 's'} added to {targetAppName || finished.appId}
                {finished.failed ? ` — ${finished.failed} failed` : ''}
              </p>
              {describeNote && <p className="ins-field-hint">{describeNote}</p>}
            </div>
          </div>
          {finished.failed > 0 && (
            <ul className="ins-wizard-failures">
              {queue
                .filter((item) => item.status === 'failed')
                .map((item) => (
                  <li key={item.key}>
                    <img src={item.previewUrl} alt="" /> {item.name}: <span className="ins-admin-err">{item.message}</span>
                  </li>
                ))}
            </ul>
          )}
          <div className="ins-admin-actions">
            {finished.failed > 0 && (
              <button type="button" className="ins-btn ins-btn--primary" onClick={() => void uploadAll()} disabled={uploading}>
                Try the failed ones again
              </button>
            )}
            <button type="button" className={`ins-btn ${finished.failed ? '' : 'ins-btn--primary'}`} onClick={again}>
              Add more screenshots
            </button>
            <Link className="ins-btn ins-btn--ghost" href={`/inspirations/app/${finished.appId}`}>
              Open the app <ExternalIcon size={13} />
            </Link>
          </div>
        </div>
      )}
    </Wizard>
  );
}

/** The platform as chips, the way the app is listed. */
function PlatformChips({ value, onChange, options }: { value: Platform; onChange: (next: Platform) => void; options: Platform[] }) {
  return (
    <div className="ins-field">
      <span className="ins-field-label">Platform</span>
      <div className="ins-segmented" role="radiogroup" aria-label="Platform">
        {options.map((p) => (
          <button key={p} type="button" role="radio" aria-checked={value === p} className={`ins-segmented-item ${value === p ? 'is-active' : ''}`} onClick={() => onChange(p)}>
            {PLATFORM_LABEL[p] ?? p}
          </button>
        ))}
      </div>
    </div>
  );
}

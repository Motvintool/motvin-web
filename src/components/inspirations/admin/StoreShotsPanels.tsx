'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { adminApi, type AdminAppRecord, type AdminState, type AdminStoreSet, type StoreFetchResult } from '@/lib/inspirations/admin';
import { inspirationsApi } from '@/lib/inspirations/api';
import { dayLabel, localDateString } from '@/lib/inspirations/dates';
import type { Platform } from '@/lib/inspirations/types';
import { ArrowUpIcon, CheckIcon, CloseIcon, SearchIcon, StopIcon, UploadIcon } from '../Icons';
import { AppLogo } from '../AppLogo';
import { askConfirm } from '../ConfirmDialog';
import { useApps } from '../useApps';
import { ChoiceCards, Summary, Wizard } from './Wizard';

/**
 * Store screenshots: the images an app shows on its App Store page (or, for
 * a web app, the ones the admin picks), kept apart from its screens under
 * `store/<platform>/<app>/<date>/` and shown on the app page as the
 * "Screenshots" card after the prototype.
 *
 * Manual Screenshots uploads a set by hand, on any platform. Agent
 * Screenshots takes iOS apps' sets from the App Store by itself — the web has
 * no App Store, so Web Apps and Webs are manual only.
 */

const PLATFORM_LABEL: Record<Platform, string> = { ios: 'iOS', webapp: 'Web App', site: 'Sites' };
const PLATFORM_OPTIONS: Array<[Platform, string]> = [['ios', 'iOS'], ['webapp', 'Web App'], ['site', 'Sites']];

type AppRow = { appId: string; name: string; set: AdminStoreSet | undefined };

/**
 * The apps with screens on one platform, never another platform's. Only those: the app page shows a platform
 * it has screens on, so screenshots for one merely declared would never appear.
 */
function appsOn(state: AdminState, platform: Platform): AppRow[] {
  const withScreens = new Set(state.files.filter((f) => f.platform === platform).map((f) => f.appId));
  return state.apps
    .filter((app) => withScreens.has(app.id))
    .map((app) => ({ appId: app.id, name: app.name || app.id, set: state.store?.[app.id]?.[platform] }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const setLine = (set: AdminStoreSet | undefined) =>
  set ? `${set.count} image${set.count === 1 ? '' : 's'} · ${set.label}` : 'No screenshots yet';

function Choice<T extends string>({ label, value, options, onChange, hint }: { label: string; value: T; options: Array<[T, string]>; onChange: (next: T) => void; hint?: ReactNode }) {
  return (
    <div className="ins-field">
      <span className="ins-field-label">{label}</span>
      <div className="ins-segmented" role="radiogroup" aria-label={label}>
        {options.map(([id, text]) => (
          <button key={id} type="button" role="radio" aria-checked={value === id} className={`ins-segmented-item ${value === id ? 'is-active' : ''}`} onClick={() => onChange(id)}>
            {text}
          </button>
        ))}
      </div>
      {hint && <span className="ins-field-hint">{hint}</span>}
    </div>
  );
}

/** Search box plus a list of app rows, each with its logo and its current set. */
function AppList({
  rows,
  picked,
  onToggle,
  multiple,
  search,
  onSearch,
  onSelectAll,
  empty,
}: {
  rows: AppRow[];
  picked: Set<string>;
  onToggle: (appId: string) => void;
  multiple: boolean;
  search: string;
  onSearch: (next: string) => void;
  onSelectAll?: () => void;
  empty: string;
}) {
  const library = useApps();
  const allOn = rows.length > 0 && rows.every((r) => picked.has(r.appId));
  return (
    <div className="ins-field">
      <span className="ins-field-label">Apps</span>
      <div className="ins-protect-apphead">
        <label className="ins-app-search">
          <SearchIcon size={14} />
          <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search apps" aria-label="Search apps" />
        </label>
        {multiple && onSelectAll && rows.length > 0 && (
          <button type="button" className="ins-btn ins-btn--ghost ins-btn--sm" onClick={onSelectAll}>
            {allOn ? 'Clear' : 'Select all'}
          </button>
        )}
      </div>
      {!rows.length ? (
        <p className="ins-muted">{empty}</p>
      ) : (
        <ul className="ins-protect-apps">
          {rows.map((row) => {
            const on = picked.has(row.appId);
            const app = library.get(row.appId);
            return (
              <li key={row.appId}>
                <label className={`ins-protect-app ${on ? 'is-on' : ''}`}>
                  {app ? <AppLogo app={app} size={32} className="ins-protect-app-logo" /> : <span className="ins-app-option-blank">{row.name.slice(0, 1)}</span>}
                  <span className="ins-app-option-text">
                    <span>{row.name}</span>
                    <span className="ins-muted">{setLine(row.set)}</span>
                  </span>
                  <input type={multiple ? 'checkbox' : 'radio'} className="ins-protect-app-input" checked={on} onChange={() => onToggle(row.appId)} />
                  <span className="ins-rec-check" aria-hidden>{on && <CheckIcon size={12} />}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const matches = (row: AppRow, search: string) => !search.trim() || row.name.toLowerCase().includes(search.trim().toLowerCase());

// ─── Manual Screenshots ──────────────────────────────────────────────────────

type Staged = { key: string; file: File; name: string; previewUrl: string };

const MANUAL_STEPS = [
  { id: 'app', label: 'App' },
  { id: 'shots', label: 'Screenshots' },
  { id: 'check', label: 'Check & upload' },
];

export function ManualScreenshotsPanel({ state, onChanged }: { state: AdminState; onChanged: () => Promise<void> | void }) {
  const [step, setStep] = useState(0);
  const [platform, setPlatform] = useState<Platform>('ios');
  const [appId, setAppId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [queue, setQueue] = useState<Staged[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState<{ appId: string; name: string; platform: Platform; count: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => appsOn(state, platform), [state, platform]);
  const shown = rows.filter((r) => matches(r, search));
  const row = rows.find((r) => r.appId === appId);
  const today = localDateString();

  // Preview URLs are blobs; let them go with the queue.
  const queueRef = useRef(queue);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);
  useEffect(() => () => queueRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl)), []);

  const stage = (files: FileList) => {
    // The formats the server can read; HEIC (an iPhone's own) isn't one, so it's left out rather than failing on upload.
    const images = Array.from(files).filter((f) => /^image\/(png|jpeg|webp|avif|gif)$/.test(f.type) || /\.(png|jpe?g|webp|avif|gif)$/i.test(f.name));
    setQueue((q) => [...q, ...images.map((file) => ({ key: `${file.name}-${file.size}-${Math.random()}`, file, name: file.name, previewUrl: URL.createObjectURL(file) }))].slice(0, 30));
  };
  const move = (key: string, by: number) =>
    setQueue((q) => {
      const i = q.findIndex((item) => item.key === key);
      const next = [...q];
      const [item] = next.splice(i, 1);
      next.splice(i + by, 0, item);
      return next;
    });
  const remove = (key: string) =>
    setQueue((q) => {
      const item = q.find((x) => x.key === key);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return q.filter((x) => x.key !== key);
    });

  const upload = async () => {
    if (!row) return;
    setBusy(true);
    setError(null);
    setDone(0);
    try {
      for (const [i, item] of queue.entries()) {
        await adminApi.uploadStoreShot(platform, row.appId, i + 1, item.file, { start: i === 0, last: i === queue.length - 1 });
        setDone(i + 1);
      }
      setFinished({ appId: row.appId, name: row.name, platform, count: queue.length });
      queue.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      setQueue([]);
      await onChanged();
    } catch (err) {
      setError(`${(err as Error).message}. Nothing was published: the set on show stays as it was.`);
    } finally {
      setBusy(false);
    }
  };

  const restart = () => {
    setFinished(null);
    setAppId(null);
    setStep(0);
  };

  const replacesToday = row?.set?.date === today;
  const titles = ['Which app are these screenshots for?', 'Add the screenshots', finished ? 'Screenshots saved' : 'Check and upload'];
  const descs = [
    'Store screenshots show on the app page as the “Screenshots” card, after the prototype. They stay in their platform.',
    'In the order the store shows them. The first one sits on top of the card.',
    finished ? undefined : 'They are saved as today’s set. Older sets stay as history; the app page shows the newest.',
  ];
  const canNext = step === 0 ? Boolean(row) : step === 1 ? queue.length > 0 : queue.length > 0 && Boolean(row);

  return (
    <Wizard
      steps={MANUAL_STEPS}
      current={step}
      onStep={setStep}
      title={titles[step]}
      description={descs[step]}
      canNext={canNext}
      nextLabel={`Upload ${queue.length} screenshot${queue.length === 1 ? '' : 's'}`}
      onNext={upload}
      busy={busy}
      hideFooter={Boolean(finished)}
      footerNote={
        busy ? `Uploading ${done + 1} of ${queue.length}…` : step === 0 && !row ? 'Pick an app.' : step === 1 && !queue.length ? 'Add at least one image.' : undefined
      }
    >
      {step === 0 && (
        <div className="ins-wizard-stack">
          <Choice
            label="Platform"
            value={platform}
            options={PLATFORM_OPTIONS}
            onChange={(next) => {
              setPlatform(next);
              setAppId(null);
            }}
          />
          <AppList
            rows={shown}
            picked={new Set(appId ? [appId] : [])}
            onToggle={(id) => setAppId(id)}
            multiple={false}
            search={search}
            onSearch={setSearch}
            empty={rows.length ? 'No app matches.' : `No ${PLATFORM_LABEL[platform]} apps in the library yet.`}
          />
          {row?.set && (
            // The set on show now, and the way to take it down (its older dated sets then show, if any).
            <div className="ins-field">
              <span className="ins-field-label">On the app page now</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span className="ins-muted">
                  {row.set.count} image{row.set.count === 1 ? '' : 's'} · {row.set.label} · {row.set.source === 'appstore' ? 'from the App Store' : 'uploaded'}
                </span>
                <button
                  type="button"
                  className="ins-btn ins-btn--ghost ins-btn--sm"
                  disabled={busy}
                  onClick={() => {
                    const set = row.set!;
                    void askConfirm({
                      title: `Remove ${row.name}'s screenshots?`,
                      description: `The ${set.count} ${PLATFORM_LABEL[platform]} images from ${set.label} are deleted. An older set, if there is one, shows instead.`,
                    }).then(async (ok) => {
                      if (!ok) return;
                      setBusy(true);
                      setError(null);
                      try {
                        await adminApi.deleteStoreShots(platform, row.appId, set.date);
                        await onChanged();
                      } catch (err) {
                        setError((err as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    });
                  }}
                >
                  Remove this set
                </button>
              </div>
              {error && step === 0 && <span className="ins-field-hint ins-field-hint--error">{error}</span>}
            </div>
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
              <p className="ins-dropzone-title">Drop store screenshots here</p>
              <p className="ins-dropzone-desc">PNG, JPEG, WebP, AVIF or GIF — up to 30. Saved as WebP.</p>
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
                  {/* eslint-disable-next-line @next/next/no-img-element */}
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

      {step === 2 && !finished && row && (
        <div className="ins-wizard-stack">
          <Summary
            rows={[
              ['App', row.name],
              ['Platform', PLATFORM_LABEL[platform]],
              ['Screenshots', `${queue.length}, in the order shown`],
              ['Saved as', replacesToday ? `Today’s set (${dayLabel(today)}) — replaces the ${row.set!.count} saved earlier today` : `A new set dated ${dayLabel(today)}`],
              ['Now', setLine(row.set)],
            ]}
          />
          {error && <p className="ins-field-hint ins-field-hint--error">{error}</p>}
        </div>
      )}

      {finished && (
        <div className="ins-wizard-stack">
          <p>
            {finished.count} screenshot{finished.count === 1 ? '' : 's'} saved for {finished.name} ({PLATFORM_LABEL[finished.platform]}).
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link className="ins-btn ins-btn--ghost" href={`/inspirations/app/${finished.appId}${finished.platform === 'ios' ? '' : `?platform=${finished.platform}`}`}>
              Open the app page
            </Link>
            <button type="button" className="ins-btn" onClick={restart}>
              Upload another set
            </button>
          </div>
        </div>
      )}
    </Wizard>
  );
}

// ─── Agent Screenshots ───────────────────────────────────────────────────────

type Stage = 'waiting' | 'fetching' | StoreFetchResult['status'] | 'failed';
type Job = { appId: string; name: string; stage: Stage; note?: string };

const AGENT_STEPS = [
  { id: 'apps', label: 'Apps' },
  { id: 'settings', label: 'Settings' },
  { id: 'start', label: 'Check & start' },
];

const COUNTRIES: Array<[string, string]> = [['us', 'United States'], ['in', 'India'], ['gb', 'United Kingdom']];

const STAGE_LABEL: Record<Stage, string> = {
  waiting: 'Waiting',
  fetching: 'Fetching…',
  added: 'Added',
  updated: 'Updated — new images',
  unchanged: 'No change',
  failed: 'Failed',
};

export function AgentScreenshotsPanel({ state, onChanged, onManual }: { state: AdminState; onChanged: () => Promise<void> | void; onManual: () => void }) {
  const [step, setStep] = useState(0);
  const [platform, setPlatform] = useState<Platform>('ios');
  const [onlyNew, setOnlyNew] = useState(true);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [country, setCountry] = useState('us');
  const [replace, setReplace] = useState<'keep' | 'replace'>('keep');
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);

  const rows = useMemo(() => appsOn(state, 'ios'), [state]);
  const listed = rows.filter((r) => !onlyNew || !r.set);
  const shown = listed.filter((r) => matches(r, search));
  const chosen = rows.filter((r) => picked.has(r.appId));

  const toggle = (appId: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) next.delete(appId);
      else next.add(appId);
      return next;
    });

  const start = async () => {
    const list: Job[] = chosen.map((r) => ({ appId: r.appId, name: r.name, stage: 'waiting' }));
    setJobs(list);
    setRunning(true);
    stopRef.current = false;
    const update = (appId: string, patch: Partial<Job>) => setJobs((js) => js && js.map((j) => (j.appId === appId ? { ...j, ...patch } : j)));
    for (const job of list) {
      if (stopRef.current) break;
      update(job.appId, { stage: 'fetching' });
      try {
        const result = await adminApi.fetchStoreShots(job.appId, { country, replace: replace === 'replace' });
        // The App Store app it matched, so a wrong match is plain to see.
        const from = result.matched ? ` · ${result.matched.name || 'App Store'} (${result.matched.trackId})` : '';
        update(job.appId, { stage: result.status, note: `${result.count} image${result.count === 1 ? '' : 's'} · ${dayLabel(result.date)}${from}` });
      } catch (err) {
        update(job.appId, { stage: 'failed', note: (err as Error).message });
      }
    }
    setRunning(false);
    await onChanged();
  };

  if (jobs) {
    const left = jobs.filter((j) => j.stage === 'waiting' || j.stage === 'fetching').length;
    return (
      <Wizard steps={AGENT_STEPS} current={2} onStep={() => {}} title={running ? `Fetching ${jobs.length - left + 1} of ${jobs.length}` : 'Finished'} description={running ? 'Keep this page open until it finishes — the apps are fetched one by one from here.' : undefined} canNext={false} hideFooter>
        <div className="ins-wizard-stack">
          <ul className="ins-store-jobs">
            {jobs.map((job) => (
              <li key={job.appId} className={`ins-store-job is-${job.stage}`}>
                <span className="ins-store-job-name">{job.name}</span>
                <span className="ins-store-job-stage">{STAGE_LABEL[job.stage]}</span>
                {job.note && <span className="ins-store-job-note">{job.note}</span>}
              </li>
            ))}
          </ul>
          <div style={{ display: 'flex', gap: 8 }}>
            {running ? (
              <button type="button" className="ins-btn" onClick={() => (stopRef.current = true)}>
                <StopIcon size={13} /> Stop after this app
              </button>
            ) : (
              <button
                type="button"
                className="ins-btn"
                onClick={() => {
                  setJobs(null);
                  setPicked(new Set());
                  setStep(0);
                }}
              >
                Fetch more apps
              </button>
            )}
          </div>
        </div>
      </Wizard>
    );
  }

  const titles = ['Which apps should the agent fetch?', 'Settings', 'Check and start'];
  const descs = [
    'The agent takes each app’s iPhone screenshots from its App Store page.',
    undefined,
    'Sets that are the same as last time are left alone.',
  ];

  return (
    <Wizard
      steps={AGENT_STEPS}
      current={step}
      onStep={setStep}
      title={titles[step]}
      description={descs[step]}
      canNext={platform === 'ios' && chosen.length > 0}
      nextLabel={`Fetch ${chosen.length} app${chosen.length === 1 ? '' : 's'}`}
      onNext={start}
      footerNote={platform !== 'ios' ? 'Only iOS apps have an App Store page.' : !chosen.length ? 'Pick at least one app.' : `${chosen.length} app${chosen.length === 1 ? '' : 's'} picked.`}
    >
      {step === 0 && (
        <div className="ins-wizard-stack">
          <Choice label="Platform" value={platform} options={PLATFORM_OPTIONS} onChange={setPlatform} />
          {platform !== 'ios' ? (
            <div className="ins-field">
              <p className="ins-muted">
                {platform === 'webapp' ? 'Web apps' : 'Websites'} have no App Store page, so the agent can’t fetch their screenshots. Upload them by hand instead.
              </p>
              <div>
                <button type="button" className="ins-btn" onClick={onManual}>
                  Open Manual Screenshots
                </button>
              </div>
            </div>
          ) : (
            <>
              <Choice
                label="Screenshots"
                value={onlyNew ? 'new' : 'all'}
                options={[['new', 'Not fetched yet'], ['all', 'All apps']]}
                onChange={(next) => setOnlyNew(next === 'new')}
                hint={onlyNew ? 'Apps that already have screenshots are left out.' : 'Apps that have them are checked for new ones.'}
              />
              <AppList
                rows={shown}
                picked={picked}
                onToggle={toggle}
                multiple
                search={search}
                onSearch={setSearch}
                onSelectAll={() => setPicked(shown.every((r) => picked.has(r.appId)) ? new Set() : new Set(shown.map((r) => r.appId)))}
                empty={listed.length ? 'No app matches.' : onlyNew ? 'Every iOS app has screenshots already.' : 'No iOS apps in the library yet.'}
              />
            </>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="ins-wizard-stack">
          <Choice label="App Store country" value={country} options={COUNTRIES} onChange={setCountry} hint="Some apps show different screenshots in each country." />
          <div className="ins-field">
            <span className="ins-field-label">When an app’s screenshots changed</span>
            <ChoiceCards
              label="When an app’s screenshots changed"
              value={replace}
              onChange={setReplace}
              options={[
                { id: 'keep', title: 'Add them as a new date', desc: 'The app page shows the new set. Older sets stay as history.' },
                { id: 'replace', title: 'Replace the old ones', desc: 'Only the new set is kept.' },
              ]}
            />
          </div>
        </div>
      )}

      {step === 2 && (
        <Summary
          rows={[
            ['Apps', chosen.map((r) => r.name).join(', ')],
            ['App Store', COUNTRIES.find(([id]) => id === country)?.[1] ?? country],
            ['When changed', replace === 'keep' ? 'Add as a new date' : 'Replace the old ones'],
          ]}
        />
      )}
    </Wizard>
  );
}

// ─── One app's set (Apps → an app → Screenshots) ─────────────────────────────

/**
 * The store screenshots an app shows on one platform, as its Card screens tab
 * lays out its carousel: the images in order, × on each to take one out (the
 * ones after it move up), and Remove this set for the whole set (an older dated
 * set, if any, then shows). New sets come in through Manual / Agent Screenshots.
 */
export function AppStoreShots({
  app,
  platform,
  state,
  busy,
  run,
}: {
  app: AdminAppRecord;
  platform: Platform;
  state: AdminState;
  busy: boolean;
  run: (action: () => Promise<unknown>, onDone?: () => void) => Promise<boolean>;
}) {
  const set = state.store?.[app.id]?.[platform];
  const where = PLATFORM_LABEL[platform];

  if (!set) {
    return (
      <p className="ins-muted ins-admin-status">
        No store screenshots for {app.name} on {where} yet. Add them in Manual Screenshots{platform === 'ios' ? ' or Agent Screenshots' : ''}.
      </p>
    );
  }

  const removeOne = (i: number) => {
    void askConfirm({
      title: `Remove screenshot ${i + 1}?`,
      description: set.count > 1 ? `It is deleted from ${app.name}'s ${where} set; the ones after it move up.` : `It is the set's only image, so the set goes too.`,
    }).then((ok) => {
      if (ok) void run(() => adminApi.deleteStoreShot(platform, app.id, set.date, i + 1));
    });
  };
  const removeSet = () => {
    void askConfirm({
      title: `Remove ${app.name}'s screenshots?`,
      description: `The ${set.count} ${where} images from ${set.label} are deleted. An older set, if there is one, shows instead.`,
    }).then((ok) => {
      if (ok) void run(() => adminApi.deleteStoreShots(platform, app.id, set.date));
    });
  };

  return (
    <div className="ins-admin-versions-manager ins-admin-cardpick">
      <p className="ins-admin-form-title">{app.name}&rsquo;s store screenshots</p>
      <p className="ins-field-hint">
        The app page&rsquo;s Screenshots card on {where}, in this order. {set.source === 'appstore' ? 'Taken from the App Store' : 'Uploaded'} on {set.label}.
        {set.source === 'appstore' && ' Fetching again brings back any image removed here.'}
      </p>
      <div className="ins-field">
        <span className="ins-field-label">
          Screenshots <span className="ins-field-hint">({set.count})</span>
        </span>
        <ol className="ins-flowbuild-strip">
          {set.urls.map((url, i) => (
            <li key={url} className="ins-flowbuild-step">
              <span className="ins-flowbuild-num">{String(i + 1).padStart(2, '0')}</span>
              <span className="ins-flowbuild-shot">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={inspirationsApi.mediaUrl(url) ?? undefined} alt="" loading="lazy" />
              </span>
              <span className="ins-flowbuild-controls">
                <button type="button" className="ins-iconbtn ins-iconbtn--plain" aria-label={`Remove screenshot ${i + 1}`} disabled={busy} onClick={() => removeOne(i)}>
                  <CloseIcon size={13} />
                </button>
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div>
        <button type="button" className="ins-btn ins-btn--sm ins-btn--danger-ghost" disabled={busy} onClick={removeSet}>
          Remove this set
        </button>
      </div>
    </div>
  );
}

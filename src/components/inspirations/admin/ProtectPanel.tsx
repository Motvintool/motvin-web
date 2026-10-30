'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { inspirationsApi, invalidateInspirationsCache } from '@/lib/inspirations/api';
import { authHeaders } from '@/lib/inspirations/admin-chatbot/ingestJobs';
import { CheckIcon, CloseIcon, PlayIcon, SearchIcon, StopIcon } from '../Icons';
import { ChoiceCards, Summary, Wizard } from './Wizard';

/**
 * Protect screens: pick apps, pick what to hide, and an agent finds personal content on their screens —
 * real people's photos, phone numbers, emails, addresses, names, card numbers — and blurs it inside the image
 * (lib/server/protect.ts). Laid out like Agent Upload: the last check on top, then the steps to start one.
 * With "Review first" every screen where something was found waits here, its boxes drawn over it, for
 * Protect or Skip; boxes can be removed, or drawn by hand.
 */

type Platform = 'ios' | 'webapp' | 'web';
type Kind = 'photo' | 'phone' | 'email' | 'address' | 'name' | 'card';
type Box = { kind: Kind; x: number; y: number; w: number; h: number; text?: string };
type Stage = 'queued' | 'checking' | 'clean' | 'found' | 'applied' | 'skipped' | 'failed';
type Item = { screenId: string; appId: string; file: string; name: string; stage: Stage; boxes: Box[]; error?: string };
type Settings = { platform: Platform; kinds: Kind[]; mode: 'review' | 'auto'; style: 'blur' | 'box'; onlyNew: boolean };
type Job = {
  id: string;
  createdAt: string;
  finishedAt: string | null;
  state: 'running' | 'paused' | 'done';
  settings: Settings;
  apps: Array<{ appId: string; name: string }>;
  items: Item[];
  usage: { tokens: number; costUsd: number; calls: number };
  workMs: number;
  note: string | null;
  waitUntil: string | null;
};
type AppRow = { appId: string; name: string; screens: number; unchecked: number };

const STEPS = [
  { id: 'apps', label: 'Apps' },
  { id: 'kinds', label: 'What to hide' },
  { id: 'settings', label: 'Settings' },
  { id: 'start', label: 'Check & start' },
];

const PLATFORM_LABEL: Record<Platform, string> = { ios: 'iOS', webapp: 'Web App', web: 'Web' };
const KINDS: Array<{ id: Kind; title: string; desc: string }> = [
  { id: 'photo', title: 'Personal photos and faces', desc: 'Real people’s photos in galleries, pickers and profiles.' },
  { id: 'phone', title: 'Phone numbers', desc: 'Any real phone number on the screen.' },
  { id: 'email', title: 'Emails', desc: 'Email addresses. Your “motvin” test emails are left alone.' },
  { id: 'address', title: 'Home addresses', desc: 'Street or home addresses of real people.' },
  { id: 'name', title: 'Names', desc: 'Your own name (profile, forms) and names in your chats and contacts.' },
  { id: 'card', title: 'Card or bank numbers', desc: 'Card, bank or account numbers.' },
];
const KIND_LABEL: Record<Kind, string> = { photo: 'Photo', phone: 'Phone', email: 'Email', address: 'Address', name: 'Name', card: 'Card' };
const DEFAULTS: Settings = { platform: 'ios', kinds: KINDS.map((k) => k.id), mode: 'review', style: 'blur', onlyNew: true };

const clockOf = (ms: number) => {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};
const tokensOf = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}k`);

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: await authHeaders(init?.headers as Record<string, string> | undefined), cache: 'no-store' });
  const body = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(body.message ?? `Request failed (${res.status})`);
  return body;
}

function Choice<T extends string>({ label, value, options, onChange, hint }: { label: string; value: T; options: Array<[T, string]>; onChange: (next: T) => void; hint?: string }) {
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

export function ProtectPanel() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [step, setStep] = useState(0);
  const [apps, setApps] = useState<AppRow[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [agent, setAgent] = useState(true);
  const [starting, setStarting] = useState(false);
  const [started, setStarted] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((current) => ({ ...current, [key]: value }));

  const refresh = useCallback(async () => {
    try {
      const next = await api<{ jobs: Job[]; apps: AppRow[]; agent: boolean }>(`/api/crawler/protect?platform=${settings.platform}`);
      setJobs(next.jobs);
      setApps(next.apps);
      setAgent(next.agent);
    } catch (failure) {
      setError((failure as Error).message);
    }
  }, [settings.platform]);

  const last = jobs.at(-1) ?? null;
  const live = last?.state === 'running';
  // The board follows the check every three seconds while it runs, else now and then.
  useEffect(() => {
    let on = true;
    const poll = async () => {
      try {
        const next = await api<{ jobs: Job[]; apps: AppRow[]; agent: boolean }>(`/api/crawler/protect?platform=${settings.platform}`);
        if (!on) return;
        setJobs(next.jobs);
        setApps(next.apps);
        setAgent(next.agent);
      } catch (failure) {
        if (on) setError((failure as Error).message);
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), live ? 3000 : 15000);
    return () => {
      on = false;
      window.clearInterval(timer);
    };
  }, [settings.platform, live]);

  // A protected screen is a new picture: the gallery's cached copy goes, and the pictures here load again.
  const stamp = last?.items.filter((i) => i.stage === 'applied').length ?? 0;
  useEffect(() => {
    if (stamp) invalidateInspirationsCache();
  }, [stamp]);

  const control = async (job: Job, action: string, screenId?: string, boxes?: Box[]) => {
    setError(null);
    try {
      const qs = new URLSearchParams({ id: job.id, action, ...(screenId ? { screen: screenId } : {}) });
      const res = await api<{ job: Job }>(`/api/crawler/protect?${qs}`, {
        method: 'PATCH',
        ...(boxes ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boxes }) } : {}),
      });
      setJobs((current) => current.map((j) => (j.id === res.job.id ? res.job : j)).filter((j) => action !== 'clear' || j.id !== job.id));
    } catch (failure) {
      setError((failure as Error).message);
    }
  };

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await api<{ job: Job }>('/api/crawler/protect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings, appIds: [...picked] }) });
      setStarted(res.job.items.length);
      setStep(0);
      setPicked(new Set());
      await refresh();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setStarting(false);
    }
  };

  const shown = useMemo(() => (apps ?? []).filter((a) => a.name.toLowerCase().includes(search.trim().toLowerCase())), [apps, search]);
  const screenCount = (apps ?? []).filter((a) => picked.has(a.appId)).reduce((n, a) => n + (settings.onlyNew ? a.unchecked : a.screens), 0);
  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const canNext = step === 0 ? picked.size > 0 && screenCount > 0 : step === 1 ? settings.kinds.length > 0 : true;
  const toReview = last?.items.filter((i) => i.stage === 'found') ?? [];

  return (
    <div className="ins-admin-panel ins-batch ins-protect">
      {last && <JobBoard job={last} onControl={control} />}

      {last && toReview.length > 0 && (
        <section className="ins-protect-review" aria-label="Screens to review">
          <div className="ins-batch-board-head">
            <div>
              <p className="ins-addflow-title">To review · {toReview.length}</p>
              <p className="ins-muted">Check the boxes, then Protect. Click a box’s × to leave that part as it is, or drag on a screen to hide more.</p>
            </div>
            <div className="ins-admin-actions ins-admin-actions--tight">
            <button type="button" className="ins-btn ins-btn--ghost" onClick={() => void control(last, 'recheck-all')} title="The agent looks at every screen waiting here again">
              Check all again
            </button>
            <button type="button" className="ins-btn ins-btn--primary" onClick={() => { if (window.confirm(`Protect all ${toReview.length} screens? Each picture is replaced by the protected one — the original can’t be brought back.`)) void control(last, 'approve-all'); }}>
              <CheckIcon size={13} /> Protect all
            </button>
            </div>
          </div>
          <div className={`ins-protect-grid ${last.settings.platform === 'ios' ? '' : 'is-web'}`}>
            {toReview.map((item) => (
              <ReviewShot
                key={item.screenId}
                item={item}
                style={last.settings.style}
                stamp={stamp}
                onBoxes={(boxes) => void control(last, 'boxes', item.screenId, boxes)}
                onApprove={() => void control(last, 'approve', item.screenId)}
                onSkip={() => void control(last, 'skip', item.screenId)}
                onRecheck={() => void control(last, 'recheck', item.screenId)}
              />
            ))}
          </div>
        </section>
      )}

      {started !== null && (
        <div className="ins-wizard-result is-ok">
          <span className="ins-wizard-result-icon"><CheckIcon size={18} /></span>
          <div>
            <p className="ins-wizard-result-title">Checking {started} screen{started === 1 ? '' : 's'}</p>
            <p className="ins-field-hint">Follow it above. You can close this page; it carries on.</p>
          </div>
          <button type="button" className="ins-btn ins-btn--ghost ins-btn--sm" onClick={() => setStarted(null)} aria-label="Dismiss"><CloseIcon size={12} /></button>
        </div>
      )}

      {!agent && <p className="ins-admin-err">Claude Code isn’t installed on this Mac, so the agent can’t look at screens.</p>}
      {error && <p className="ins-admin-err">{error}</p>}

      <Wizard
        steps={STEPS}
        current={step}
        onStep={setStep}
        title={['Which apps should be checked?', 'What should be hidden?', 'How should it be done?', 'Check and start'][step]}
        description={
          [
            'The agent looks at every screen of these apps.',
            'Only these are looked for. Everything else stays as it is.',
            'Review first lets you approve each screen; Fix automatically changes them straight away.',
            'A protected screen replaces the original picture. The original can’t be brought back.',
          ][step]
        }
        canNext={canNext}
        nextLabel={`Check ${screenCount} screen${screenCount === 1 ? '' : 's'}`}
        onNext={() => void start()}
        busy={starting}
        footerNote={step === 0 && !picked.size ? 'Pick at least one app.' : step === 0 && !screenCount ? 'These apps have no screens left to check.' : step === 1 && !settings.kinds.length ? 'Pick at least one.' : undefined}
      >
        {step === 0 && (
          <div className="ins-wizard-stack">
            <Choice
              label="Platform"
              value={settings.platform}
              options={[['ios', 'iOS'], ['webapp', 'Web App'], ['web', 'Web']]}
              onChange={(next) => {
                set('platform', next);
                setPicked(new Set());
                setApps(null);
              }}
            />
            <Choice
              label="Screens"
              value={settings.onlyNew ? 'new' : 'all'}
              options={[['new', 'Not checked yet'], ['all', 'All screens']]}
              onChange={(next) => set('onlyNew', next === 'new')}
              hint={settings.onlyNew ? 'Screens checked before, and not changed since, are left out.' : 'Every screen is checked again.'}
            />
            <div className="ins-field">
              <span className="ins-field-label">Apps</span>
              <div className="ins-protect-apphead">
                <label className="ins-app-search">
                  <SearchIcon size={14} />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search apps" aria-label="Search apps" />
                </label>
                {shown.length > 0 && (
                  <button type="button" className="ins-btn ins-btn--ghost ins-btn--sm" onClick={() => setPicked(shown.every((a) => picked.has(a.appId)) ? new Set() : new Set(shown.map((a) => a.appId)))}>
                    {shown.every((a) => picked.has(a.appId)) ? 'Clear' : 'Select all'}
                  </button>
                )}
              </div>
              {!apps ? (
                <p className="ins-muted">Loading apps…</p>
              ) : !apps.length ? (
                <p className="ins-muted">No {PLATFORM_LABEL[settings.platform]} apps in the library yet.</p>
              ) : (
                <ul className="ins-protect-apps">
                  {shown.map((app) => {
                    const count = settings.onlyNew ? app.unchecked : app.screens;
                    return (
                      <li key={app.appId}>
                        <label className={`ins-protect-app ${picked.has(app.appId) ? 'is-on' : ''}`}>
                          <input type="checkbox" checked={picked.has(app.appId)} onChange={() => toggle(app.appId)} />
                          <span className="ins-protect-app-name">{app.name}</span>
                          <span className="ins-muted">{count ? `${count} screen${count === 1 ? '' : 's'}` : 'All checked'}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}

        {step === 1 && (
          <ul className="ins-protect-kinds">
            {KINDS.map((kind) => {
              const on = settings.kinds.includes(kind.id);
              return (
                <li key={kind.id}>
                  <label className={`ins-protect-kind ${on ? 'is-on' : ''}`}>
                    <input type="checkbox" checked={on} onChange={() => set('kinds', on ? settings.kinds.filter((k) => k !== kind.id) : [...settings.kinds, kind.id])} />
                    <span>
                      <span className="ins-choice-title">{kind.title}</span>
                      <span className="ins-choice-desc">{kind.desc}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {step === 2 && (
          <div className="ins-wizard-stack">
            <div className="ins-field">
              <span className="ins-field-label">After the agent finds something</span>
              <ChoiceCards
                label="After the agent finds something"
                value={settings.mode}
                onChange={(next) => set('mode', next)}
                options={[
                  { id: 'review', title: 'Review first (recommended)', desc: 'Each screen waits for you to press Protect, so nothing is changed by mistake.' },
                  { id: 'auto', title: 'Fix automatically', desc: 'Screens are protected as soon as something is found.' },
                ]}
              />
            </div>
            <Choice label="How it’s hidden" value={settings.style} options={[['blur', 'Blur'], ['box', 'Grey box']]} onChange={(next) => set('style', next)} hint={settings.style === 'blur' ? 'A heavy blur; nothing under it can be read.' : 'A plain grey box over it.'} />
          </div>
        )}

        {step === 3 && (
          <Summary
            rows={[
              ['Apps', `${picked.size} ${PLATFORM_LABEL[settings.platform]} app${picked.size === 1 ? '' : 's'}`],
              ['Screens', `${screenCount}${settings.onlyNew ? ' not checked yet' : ''}`],
              ['Hide', settings.kinds.map((k) => KIND_LABEL[k]).join(', ')],
              ['After finding', settings.mode === 'review' ? 'Review first' : 'Fix automatically'],
              ['Style', settings.style === 'blur' ? 'Blur' : 'Grey box'],
              ['Agent', 'Sonnet 5.5, about 6 screens per call'],
            ]}
          />
        )}
      </Wizard>
    </div>
  );
}

const STAGE_LABEL: Record<Job['state'], string> = { running: 'Checking', paused: 'Paused', done: 'Done' };

function JobBoard({ job, onControl }: { job: Job; onControl: (job: Job, action: string) => Promise<void> }) {
  const count = (stages: Stage[]) => job.items.filter((i) => stages.includes(i.stage)).length;
  const checked = count(['clean', 'found', 'applied', 'skipped', 'failed']);
  return (
    <section className="ins-batch-board" aria-label="Last check">
      <div className="ins-batch-board-head">
        <div>
          <p className="ins-addflow-title">{job.state === 'done' ? 'Last check' : job.state === 'paused' ? 'Check paused' : 'Checking screens'}</p>
          <p className="ins-muted">
            {checked} of {job.items.length} checked · {PLATFORM_LABEL[job.settings.platform]} · started {new Date(job.createdAt).toLocaleString()}
          </p>
        </div>
        {job.state === 'done' ? (
          <button type="button" className="ins-btn ins-btn--ghost" onClick={() => void onControl(job, 'clear')}><CloseIcon size={13} /> Clear</button>
        ) : (
          <div className="ins-admin-actions ins-admin-actions--tight">
            {job.state === 'running' ? (
              <button type="button" className="ins-btn ins-btn--ghost" onClick={() => void onControl(job, 'pause')}>Pause</button>
            ) : (
              <button type="button" className="ins-btn ins-btn--ghost" onClick={() => void onControl(job, 'resume')}><PlayIcon size={13} /> Resume</button>
            )}
            <button type="button" className="ins-btn ins-btn--ghost" onClick={() => { if (window.confirm('Stop checking? Screens not checked yet are skipped; screens waiting for review stay.')) void onControl(job, 'stop'); }}><StopIcon size={13} /> Stop</button>
          </div>
        )}
      </div>
      {job.note && <p className="ins-admin-err">{job.note}</p>}
      <ol className="ins-batch-items">
        {job.apps.map((app) => {
          const mine = job.items.filter((i) => i.appId === app.appId);
          const of = (stages: Stage[]) => mine.filter((i) => stages.includes(i.stage)).length;
          const busy = of(['queued', 'checking']) > 0 && job.state !== 'done';
          // One app at a time: the one with screens with the agent is checking, the ones not reached yet wait.
          const started = of(['checking']) > 0 || of(['queued', 'checking']) < mine.length;
          const stage = !busy ? 'done' : job.state === 'paused' ? 'paused' : of(['checking']) > 0 ? 'checking' : started ? 'checking' : 'waiting';
          return (
            <li key={app.appId} className={`ins-batch-item is-${stage === 'done' ? 'done' : stage === 'waiting' ? 'queued' : 'uploading'}`}>
              <div className="ins-batch-item-main">
                <span className="ins-batch-item-title">{app.name}</span>
                <span className="ins-batch-stage">
                  {stage === 'checking' && <span className="ins-spinner" aria-hidden />}
                  {stage === 'done' && <CheckIcon size={12} />}
                  {stage === 'checking' ? 'Checking' : stage === 'waiting' ? 'Waiting' : stage === 'paused' ? 'Paused' : 'Done'}
                </span>
              </div>
              <div className="ins-batch-item-sub">
                <span>{mine.length - of(['queued', 'checking'])} of {mine.length} screens checked</span>
                <span>{of(['found', 'applied', 'skipped'])} with personal content</span>
                <span>{of(['applied'])} protected</span>
                {of(['found']) > 0 && <span>{of(['found'])} to review</span>}
                {of(['failed']) > 0 && <span title={mine.find((i) => i.stage === 'failed')?.error}>{of(['failed'])} failed</span>}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="ins-muted ins-protect-usage">
        {STAGE_LABEL[job.state]} · Sonnet 5.5 · AI {tokensOf(job.usage.tokens)} tokens · {clockOf(job.workMs)}
      </p>
    </section>
  );
}

/** One screen to review: its boxes over it, previewed as they'll look; × on a box removes it, a drag adds one. */
function ReviewShot({ item, style, stamp, onBoxes, onApprove, onSkip, onRecheck }: { item: Item; style: Settings['style']; stamp: number; onBoxes: (boxes: Box[]) => void; onApprove: () => void; onSkip: () => void; onRecheck: () => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{ x0: number; y0: number; x: number; y: number } | null>(null);
  const src = `${inspirationsApi.mediaUrl(`/api/inspirations/screens/${item.file}`)}?t=${stamp}`;

  const at = (e: ReactPointerEvent) => {
    const r = frame.current!.getBoundingClientRect();
    return { x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)), y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)) };
  };
  const rect = draft && { x: Math.min(draft.x0, draft.x), y: Math.min(draft.y0, draft.y), w: Math.abs(draft.x - draft.x0), h: Math.abs(draft.y - draft.y0) };

  return (
    <article className="ins-protect-shot">
      <div
        ref={frame}
        className="ins-protect-frame"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = at(e);
          setDraft({ x0: p.x, y0: p.y, x: p.x, y: p.y });
        }}
        onPointerMove={(e) => draft && setDraft({ ...draft, ...at(e) })}
        onPointerUp={() => {
          if (rect && rect.w > 1 && rect.h > 0.6) onBoxes([...item.boxes, { kind: 'photo', ...rect }]);
          setDraft(null);
        }}
      >
        <img src={src} alt={item.name} draggable={false} />
        {item.boxes.map((box, index) => (
          <span key={index} className={`ins-protect-box is-${style}`} style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }} title={box.text ? `${KIND_LABEL[box.kind]}: ${box.text}` : KIND_LABEL[box.kind]}>
            <button type="button" className="ins-protect-box-x" aria-label={`Leave this ${KIND_LABEL[box.kind].toLowerCase()} as it is`} onClick={() => onBoxes(item.boxes.filter((_, i) => i !== index))}>
              <CloseIcon size={10} />
            </button>
          </span>
        ))}
        {rect && <span className="ins-protect-box is-draft" style={{ left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.w}%`, height: `${rect.h}%` }} />}
      </div>
      <div className="ins-protect-shot-foot">
        <span className="ins-protect-shot-name" title={item.name}>{item.name}</span>
        <span className="ins-muted">{[...new Set(item.boxes.map((b) => KIND_LABEL[b.kind]))].join(', ')}</span>
        <div className="ins-protect-shot-actions">
          <button type="button" className="ins-btn ins-btn--ghost ins-btn--sm" onClick={onRecheck} title="The agent looks at this screen again">Check again</button>
          <button type="button" className="ins-btn ins-btn--ghost ins-btn--sm" onClick={onSkip}>Skip</button>
          <button type="button" className="ins-btn ins-btn--primary ins-btn--sm" onClick={onApprove} disabled={!item.boxes.length}>Protect</button>
        </div>
      </div>
    </article>
  );
}

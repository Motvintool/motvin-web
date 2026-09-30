'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { useAuth } from '@/components/shared/AuthProvider';
import { adminApi, isAdminEmail, type AdminAppRecord, type AdminState } from '@/lib/inspirations/admin';
import { dayLabel, localDateString, parseDateInput } from '@/lib/inspirations/dates';
import { describeOp, labelFor, type AdminOp } from '@/lib/inspirations/assistantActions';
import { invalidateInspirationsCache } from '@/lib/inspirations/api';
import {
  INGEST_STAGES,
  adminSays,
  aiLabel,
  answersPending,
  askAssistant,
  assistantSays,
  cancelPending,
  clearAssistantChat,
  getPending,
  heldUploadFilesNow,
  holdImage,
  holdUpload,
  loadAssistantChat,
  performAction,
  platformIn,
  PLATFORM_CHOICES,
  releaseImage,
  offerAction,
  releaseUpload,
  setUploadPlan,
  stopActiveRun,
  stopAssistant,
  clock,
  dismissIngestJob,
  isActive,
  megabytes,
  stageIndex,
  useAiStatus,
  useAssistantChat,
  useIngestJobs,
  type AssistantAction,
  type ChatMessage,
  type ConfirmAction,
  type IngestJob,
  type UploadPlan,
} from '@/lib/inspirations/ingestJobs';
import { ArrowRightIcon, CheckIcon, CloseIcon, ExpandIcon, ExternalIcon, MinusIcon, PlusIcon, SparklesIcon, StopIcon, TrashIcon, UploadIcon } from '../Icons';
import { tone } from './AiPicker';

/**
 * The assistant in the corner — the library owner's helper on every page.
 *
 * It reads like a chat and works like one. Drop a screen recording on it, or
 * press the plus, and a run starts; the run then shows as a thread — the
 * request at the top, the assistant's reply beneath, updating live with the
 * step it is on, a progress bar, "AI is writing screen content — screens
 * 13–18 of 64" with a typing indicator, and finally what landed with a link
 * into the gallery. Type a question and it answers: how far a run is, how
 * long is left, what the last one produced, which AI is on. Questions about
 * runs are answered from the job list at once; anything else goes to the free
 * AI with the same facts as context.
 *
 * Runs live on the server (lib/server/ingestJobs.ts) and the conversation in
 * a module store, so the card follows the admin from page to page without
 * losing its place. It folds to a small pill when they want it out of the
 * way, and shows nothing at all to anyone who is not the admin.
 */

const COLLAPSED_KEY = 'motvin:ingest-dock:collapsed';
const WIDE_KEY = 'motvin:ingest-dock:wide';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * The little markdown a chat reply uses — bold, italics, inline code and
 * bullet or numbered lists — rendered from escaped text, so nothing the
 * model writes can become markup of its own.
 */
export function renderChat(text: string): string {
  const inline = (line: string) =>
    escapeHtml(line)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  const blocks: string[] = [];
  let list: { kind: 'ul' | 'ol'; items: string[] } | null = null;
  const flush = () => {
    if (list) blocks.push(`<${list.kind}>${list.items.map((item) => `<li>${item}</li>`).join('')}</${list.kind}>`);
    list = null;
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const bullet = line.match(/^[-•*]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const kind = bullet ? 'ul' : 'ol';
      if (!list || list.kind !== kind) {
        flush();
        list = { kind, items: [] };
      }
      list.items.push(inline((bullet ?? numbered)![1]));
      continue;
    }
    flush();
    if (line) blocks.push(`<p>${inline(line)}</p>`);
  }
  flush();
  return blocks.join('');
}

const SUGGESTIONS = ['How far is the run?', 'How long is left?', 'What did the last run do?', 'Which AI is on?', 'What can you do?'];

/** "Update Latest", "latest", "29 Sep 2026", "2026-09-29", "sep 29" → that version of the app, if it has one. */
function matchHeldVersion(versions: { id: string; label: string; isLatest: boolean }[], text: string) {
  const needle = text.trim().toLowerCase().replace(/^update\s+/, '').replace(/\s+version$/, '');
  if (/^(latest|newest|current)$/.test(needle)) return versions.find((v) => v.isLatest) ?? null;
  const asDate = parseDateInput(needle);
  return (
    versions.find((v) => v.id === needle || v.label.toLowerCase() === needle) ??
    (asDate ? versions.find((v) => v.id === asDate) : null) ??
    versions.find((v) => v.label.toLowerCase().includes(needle)) ??
    null
  );
}

export function IngestDock() {
  const { user, ready } = useAuth();
  const admin = ready && Boolean(user && !user.isAnonymous && isAdminEmail(user.email));
  const { jobs } = useIngestJobs(admin);
  const { messages, pending: pendingAction, heldImage, heldUpload, expecting } = useAssistantChat();
  const [logoFor, setLogoFor] = useState<ConfirmAction | null>(null);
  const { status: ai, loading: aiLoading } = useAiStatus(admin);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [wide, setWide] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(WIDE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [now, setNow] = useState(() => Date.now());
  const [dragging, setDragging] = useState(false);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  /** The library as it stood when a recording was dropped — apps and their versions, for the questions that follow. */
  const libraryRef = useRef<AdminState | null>(null);

  const visible = jobs.filter((job) => !job.dismissed).slice(0, 3);
  const running = visible.some(isActive);
  /** The one job the composer's stop control acts on, if any is going. */
  const liveJob = visible.find(isActive) ?? null;

  // The saved conversation comes back once the admin is known.
  useEffect(() => {
    if (admin) void loadAssistantChat();
  }, [admin]);

  // The elapsed time ticks once a second while a run is on.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  // The gallery's own cache would otherwise keep showing the library as it
  // was before a run that finished while another page was open.
  const doneIds = visible.filter((job) => job.status === 'done').map((job) => job.id).join(',');
  useEffect(() => {
    if (doneIds) invalidateInspirationsCache();
  }, [doneIds]);

  // New messages scroll into view, the way a chat does.
  const lastMessageId = messages[messages.length - 1]?.id ?? '';
  const latestJobId = visible[0]?.id ?? '';
  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [lastMessageId, latestJobId, running]);

  if (!admin) return null;

  const toggle = () => {
    setCollapsed((value) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, value ? '0' : '1');
      } catch {
        // Private mode or blocked storage.
      }
      return !value;
    });
  };

  const isImage = (file: File) => file.type.startsWith('image/') || /\.(png|jpe?g|webp|svg|gif|avif)$/i.test(file.name);

  /** Dropped or picked files: a recording starts a run, several screenshots are filed, one image becomes a logo or a screen. */
  const upload = async (picked: File[]) => {
    if (!user || !picked.length) return;
    const images = picked.filter(isImage);
    const videos = picked.filter((file) => file.type.startsWith('video/') || /\.(mov|mp4|m4v|avi|mkv)$/i.test(file.name));
    if (images.length === 1 && !videos.length) {
      const file = images[0];
      // Picked for a logo or a screen the admin just confirmed, or for one waiting.
      const target = logoFor ?? (pendingAction?.op.kind === 'set-logo' || pendingAction?.op.kind === 'add-screen' ? pendingAction : null);
      if (target) {
        setLogoFor(null);
        await performAction(target, file);
        return;
      }
      holdImage(file);
      assistantSays(`Got “${file.name}”. Is it a logo or a screen? Say, for example, “set this as Swiggy’s logo” or “add this as a screen to Swiggy”.`);
      return;
    }
    if (images.length > 1) {
      // Several screenshots: the admin page's Manual upload, asked as
      // questions — platform, then which app (or a new one), then version.
      holdUpload('screens', images);
      libraryRef.current = null;
      assistantSays(`Got ${images.length} screenshots. Which platform are they from?`, [...PLATFORM_CHOICES.map((choice) => chip(choice.label)), chip('Cancel')]);
      return;
    }
    const video = videos[0];
    if (!video) {
      assistantSays('I can take a screen recording (.mov or .mp4) to add an app, several screenshots to file under an app, or one image to set a logo.');
      return;
    }
    if (running) {
      assistantSays('A run is already going. One at a time keeps the Mac usable — drop the next recording when it finishes.');
      return;
    }
    // A recording does not say what it was recorded on, and that decides
    // where its screens are filed — so the platform is asked first. Which
    // app, and which of its versions, follow: the same choices the admin
    // page's Automatic tab offers as controls, asked here one at a time.
    holdUpload('video', [video]);
    libraryRef.current = null;
    assistantSays(`Got “${video.name}” (${megabytes(video.size)}). Which platform is it from?`, [...PLATFORM_CHOICES.map((choice) => chip(choice.label)), chip('Cancel')]);
  };

  const chip = (text: string) => ({ type: 'reply' as const, text });
  const library = async (): Promise<AdminState> => (libraryRef.current ??= await adminApi.getState());
  const versionName = (v: { isLatest: boolean; label: string }) => (v.isLatest ? 'Latest' : v.label);

  /**
   * Every question answered: the upload is offered as a Confirm, the same
   * as any other change — nothing is sent until it is pressed (or a typed
   * yes). The files themselves stay held by the chat store until then.
   */
  const offerHeld = (opts: { platform: 'ios' | 'android' | 'web'; appId?: string; version?: string; newApp?: { id: string; name: string } }) => {
    const held = heldUpload;
    const files = heldUploadFilesNow();
    if (!held || !files.length || !user) return;
    const app = opts.appId ? (libraryRef.current?.apps.find((entry) => entry.id === opts.appId) ?? null) : null;
    const existing = app?.versions?.find((v) => v.id === opts.version);
    const versionLabel = opts.version ? (existing ? `${versionName(existing)} version` : `new version dated ${dayLabel(opts.version)}`) : undefined;
    const appName = app?.name ?? opts.newApp?.name;
    setUploadPlan({ ...held.plan, step: 'confirm', platform: opts.platform, appId: opts.appId ?? opts.newApp?.id, appName, newApp: opts.newApp });
    const op: AdminOp =
      held.kind === 'video'
        ? { kind: 'start-ingest', fileName: files[0].name, platform: opts.platform, appId: opts.appId, appName: app?.name, version: opts.version, versionLabel, startedBy: user.email }
        : {
            kind: 'upload-screens',
            count: files.length,
            platform: opts.platform,
            appId: opts.appId ?? opts.newApp?.id ?? '',
            appName: appName ?? '',
            version: opts.version ?? localDateString(),
            versionLabel: versionLabel ?? `new version dated ${dayLabel(localDateString())}`,
            newApp: opts.newApp,
          };
    offerAction(describeOp(op), { type: 'confirm', op, label: labelFor(op), destructive: false });
  };

  const cancelHeld = () => {
    const waiting = getPending();
    if (waiting && (waiting.op.kind === 'start-ingest' || waiting.op.kind === 'upload-screens')) {
      cancelPending();
      return;
    }
    releaseUpload();
    assistantSays('Okay, I’ve set that aside. Drop it again whenever you like.');
  };

  const askApp = async (plan: UploadPlan) => {
    const state = await library();
    if (!state.apps.length) {
      if (heldUpload?.kind === 'screens') askName(plan);
      else offerHeld({ platform: plan.platform! });
      return;
    }
    setUploadPlan({ ...plan, step: 'app' });
    assistantSays('Is this a new app, or more screens of one already in the library?', [chip('New app'), ...state.apps.slice(0, 8).map((app) => chip(app.name)), chip('Cancel')]);
  };

  /** Screenshots for an app that does not exist yet: a recording identifies its app itself; screenshots cannot. */
  const askName = (plan: UploadPlan) => {
    setUploadPlan({ ...plan, step: 'name' });
    assistantSays('What is the app called? I’ll create it and file the screenshots under it.', [chip('Cancel')]);
  };

  const askVersion = (plan: UploadPlan, app: AdminAppRecord) => {
    const versions = app.versions ?? [];
    setUploadPlan({ ...plan, step: 'version', appId: app.id, appName: app.name, newApp: undefined });
    assistantSays(`Which version of ${app.name} should these screens go into?`, [...versions.map((v) => chip(`Update ${versionName(v)}`)), chip('New version'), chip('Cancel')]);
  };

  const askDate = (plan: UploadPlan) => {
    setUploadPlan({ ...plan, step: 'date' });
    assistantSays(`What date should the ${plan.newApp ? 'first' : 'new'} version have? Today is ${dayLabel(localDateString())}.`, [chip('Today'), chip('Cancel')]);
  };

  /** One typed or chipped answer to whichever question the held upload is on. */
  const answerHeld = async (raw: string) => {
    const text = raw.trim();
    const plan: UploadPlan = heldUpload?.plan ?? { step: 'platform' };
    if (plan.step === 'confirm') {
      // The questions are done; only the Confirm (or a yes/no) is left.
      const waiting = getPending();
      const reply = answersPending(text);
      if (waiting && reply === 'yes') await run(waiting);
      else if (reply === 'no' || /^(cancel|discard|never ?mind|forget it)\b/i.test(text)) cancelHeld();
      else assistantSays('Press Confirm above to go ahead, or say cancel.');
      return;
    }
    if (/^(cancel|discard|never ?mind|forget it|no)\b/i.test(text)) {
      cancelHeld();
      return;
    }
    if (plan.step === 'platform') {
      const platform = platformIn(text);
      if (!platform) {
        assistantSays('Which platform — iOS, Android or Web?', [...PLATFORM_CHOICES.map((choice) => chip(choice.label)), chip('Cancel')]);
        return;
      }
      await askApp({ ...plan, platform });
      return;
    }
    if (plan.step === 'app') {
      if (/^(a )?new( app)?$/i.test(text)) {
        if (heldUpload?.kind === 'screens') askName(plan);
        else offerHeld({ platform: plan.platform! });
        return;
      }
      const state = await library();
      const needle = text.toLowerCase();
      const app =
        state.apps.find((entry) => entry.name.toLowerCase() === needle || entry.id === needle) ??
        state.apps.find((entry) => needle.includes(entry.name.toLowerCase()) || entry.name.toLowerCase().includes(needle));
      if (!app) {
        assistantSays(`I don’t know an app called “${text}”. Pick one, or say “new app”.`, [chip('New app'), ...state.apps.slice(0, 8).map((entry) => chip(entry.name)), chip('Cancel')]);
        return;
      }
      askVersion(plan, app);
      return;
    }
    if (plan.step === 'name') {
      const name = text.replace(/^[“"']+|[”"']+$/g, '').trim().slice(0, 80);
      if (!name) {
        assistantSays('What should the app be called?', [chip('Cancel')]);
        return;
      }
      const state = await library();
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
      // Named an app that turns out to exist: file under it rather than make a twin.
      const existing = state.apps.find((entry) => entry.id === id || entry.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        askVersion(plan, existing);
        return;
      }
      askDate({ ...plan, appName: name, newApp: { id, name } });
      return;
    }
    const state = await library();
    const app = state.apps.find((entry) => entry.id === plan.appId);
    const versions = app?.versions ?? [];
    if (plan.step === 'version') {
      if (/\bnew\b/i.test(text)) {
        askDate(plan);
        return;
      }
      const version = matchHeldVersion(versions, text);
      if (!version) {
        assistantSays(`Which version? ${app?.name ?? 'It'} has ${versions.map(versionName).join(', ') || 'none yet'} — or say “new version”.`, [...versions.map((v) => chip(`Update ${versionName(v)}`)), chip('New version'), chip('Cancel')]);
        return;
      }
      offerHeld({ platform: plan.platform!, appId: plan.appId, version: version.id });
      return;
    }
    // step === 'date': a date for the new version — or a change of mind, adding to an existing one.
    const asExisting = /^update\b/i.test(text) ? matchHeldVersion(versions, text) : null;
    if (asExisting) {
      offerHeld({ platform: plan.platform!, appId: plan.appId, version: asExisting.id });
      return;
    }
    const date = parseDateInput(text);
    if (!date) {
      assistantSays('I didn’t catch a date in that — say it like 2026-09-30, “30 Sep 2026”, or “today”.', [chip('Today'), chip('Cancel')]);
      return;
    }
    const clash = versions.find((v) => v.id === date);
    if (clash) {
      assistantSays(`${app?.name ?? 'It'} already has a version dated ${versionName(clash)} — pick a different date, or add these screens to that one.`, [chip(`Update ${versionName(clash)}`), chip('Today'), chip('Cancel')]);
      return;
    }
    offerHeld({ platform: plan.platform!, appId: plan.appId, version: date, newApp: plan.newApp });
  };

  const ask = async (event?: FormEvent) => {
    event?.preventDefault();
    await send(question);
  };

  /** Runs a confirmed operation; a logo without an image opens the picker. */
  const run = async (action: ConfirmAction) => {
    const outcome = await performAction(action);
    if (outcome === 'needs-image') {
      setLogoFor(action);
      assistantSays(action.op.kind === 'add-screen' ? `Choose the screenshot to add to ${action.op.name} — PNG, JPG or WebP.` : `Choose the image for ${action.op.kind === 'set-logo' ? action.op.name : 'the app'}’s logo — PNG, SVG or WebP.`);
      fileRef.current?.click();
    }
  };

  const send = async (text: string) => {
    // Nothing goes out while there is a reply still typing or a run still
    // going — same rule as the disabled input and the stop button above.
    if (!text.trim() || asking || liveJob) return;
    setQuestion('');
    if (/^upload$/i.test(text.trim())) {
      fileRef.current?.click();
      return;
    }
    // A held upload is part-way through its questions — platform, app,
    // version, date, Confirm; whatever is typed answers the one it is on.
    if (heldUploadFilesNow().length) {
      adminSays(text.trim());
      await answerHeld(text);
      return;
    }
    const waiting = getPending();
    const reply = answersPending(text);
    if (reply && waiting) {
      adminSays(text.trim());
      if (reply === 'yes') await run(waiting);
      else cancelPending();
      return;
    }
    setAsking(true);
    const answer = await askAssistant(text);
    setAsking(false);
    if (answer.actions?.some((action) => action.type === 'upload') && /\b(upload|new video|add)\b/i.test(text)) fileRef.current?.click();
  };

  const act = (action: AssistantAction) => {
    if (action.type === 'upload') fileRef.current?.click();
    else if (action.type === 'confirm') void run(action);
    else if (action.type === 'reply') {
      if (heldUploadFilesNow().length) {
        adminSays(action.text);
        void answerHeld(action.text);
        return;
      }
      if (/^cancel/i.test(action.text) && getPending()) {
        adminSays(action.text);
        cancelPending();
      } else void send(action.text);
    }
  };

  const toggleWide = () => {
    setWide((value) => {
      try {
        localStorage.setItem(WIDE_KEY, value ? '0' : '1');
      } catch {
        // Private mode.
      }
      return !value;
    });
  };

  const latest = visible[0];
  const picker = (
    <input
      ref={fileRef}
      type="file"
      accept="video/*,image/*,.mov,.mp4,.m4v,.png,.jpg,.jpeg,.webp,.svg"
      multiple
      hidden
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = '';
        if (files.length) void upload(files);
      }}
    />
  );

  if (collapsed) {
    return (
      <>
        {picker}
        <button type="button" className={`ins-dock-pill ${latest && isActive(latest) ? 'is-running' : ''}`} onClick={toggle} aria-label="Open the assistant">
          {latest && isActive(latest) ? <span className="ins-spinner" /> : <SparklesIcon size={15} />}
          <span className="ins-dock-pill-text">{latest && isActive(latest) ? pillText(latest) : 'Motvin assistant'}</span>
        </button>
      </>
    );
  }

  return (
    <aside
      className={`ins-dock ${dragging ? 'is-dragging' : ''} ${wide ? 'is-wide' : ''}`}
      role="complementary"
      aria-label="Motvin assistant"
      onDragOver={(e: DragEvent) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const files = Array.from(e.dataTransfer.files ?? []);
        if (files.length) void upload(files);
      }}
    >
      {picker}
      <header className="ins-dock-head">
        <span className="ins-dock-avatar" aria-hidden>
          <SparklesIcon size={16} />
        </span>
        <div className="ins-dock-title">
          <strong>Motvin assistant</strong>
          <span className={`ins-dock-ai is-${tone(ai, aiLoading)}`}>
            <span className="ins-ai-dot" aria-hidden />
            {aiLabel(ai)}
            {ai?.usable && ai.connected ? ' · connected' : ai && ai.enabled && !ai.usable ? ' · not connected' : ''}
          </span>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            className="ins-iconbtn ins-iconbtn--plain"
            onClick={() => {
              if (window.confirm('Clear this conversation? Runs and changes are not affected.')) void clearAssistantChat();
            }}
            aria-label="Clear the conversation"
            title="Clear the conversation"
          >
            <TrashIcon size={15} />
          </button>
        )}
        <button type="button" className="ins-iconbtn ins-iconbtn--plain" onClick={toggleWide} aria-label={wide ? 'Smaller' : 'Larger'} title={wide ? 'Smaller' : 'Larger'}>
          <ExpandIcon size={15} />
        </button>
        <button type="button" className="ins-iconbtn ins-iconbtn--plain" onClick={toggle} aria-label="Minimise">
          <MinusIcon size={15} />
        </button>
      </header>

      <div ref={bodyRef} className="ins-dock-body" role="log" aria-live="polite">
        {visible.length === 0 && messages.length === 0 && (
          <div className="ins-chat">
            <div className="ins-chat-msg ins-chat-msg--assistant">
              <p className="ins-chat-line">
                Hi. Drop a screen recording — or several screenshots — to add an app or more screens to one, drop one image to set a logo, or tell me what to change — “change Swiggy’s tagline to …”, “delete the splash screen from Swiggy’s Sep 29 version”, “move Airbnb’s latest version to 30 Sep 2026”. I’ll ask before doing anything.
              </p>
              <div className="ins-chat-actions">
                <button type="button" className="ins-chip-btn" onClick={() => fileRef.current?.click()}>
                  <UploadIcon size={13} /> Upload a video
                </button>
                {SUGGESTIONS.slice(0, 2).map((text) => (
                  <button key={text} type="button" className="ins-chip-btn" onClick={() => setQuestion(text)}>
                    {text}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {timeline(visible, messages).map((item) =>
          item.kind === 'job' ? (
            <JobThread key={item.job.id} job={item.job} now={now} />
          ) : (
            <ChatBubble key={item.message.id} message={item.message} onAction={act} pending={pendingAction} onCancel={cancelPending} />
          ),
        )}
        {dragging && <div className="ins-dock-drop">Drop to start a run</div>}
      </div>

      {visible.filter(isActive).slice(0, 1).map((job) => (
        <div key={job.id} className="ins-dock-live" role="status">
          <span className="ins-spinner" />
          <span className="ins-dock-live-text">
            <strong>{job.status === 'uploading' ? `Uploading ${Math.round((job.uploaded ?? 0) * 100)}%` : INGEST_STAGES[stageIndex(job.stage)]?.label ?? 'Working'}</strong>
            <span>
              {job.message} · {clock((now - Date.parse(job.startedAt)) / 1000)}
            </span>
          </span>
          {/* The actual stop control lives in the composer below, right next
              to send — one consistent place for "stop what's happening",
              the same as stopping a reply mid-type. */}
        </div>
      ))}
      {heldUpload && (
        <div className="ins-dock-held">
          <span>
            {heldUpload.kind === 'video' ? (
              <>
                Recording ready: <strong>{heldUpload.names[0]}</strong>
              </>
            ) : (
              <>
                <strong>{heldUpload.names.length} screenshots</strong> ready
              </>
            )}{' '}
            —{' '}
            {heldUpload.plan.step === 'platform'
              ? 'which platform? iOS, Android or Web.'
              : heldUpload.plan.step === 'app'
                ? 'a new app, or which existing one?'
                : heldUpload.plan.step === 'name'
                  ? 'what is the new app called?'
                  : heldUpload.plan.step === 'version'
                    ? `which version of ${heldUpload.plan.appName}?`
                    : heldUpload.plan.step === 'date'
                      ? 'what date for the new version?'
                      : 'waiting for your Confirm above.'}
          </span>
          <button type="button" className="ins-linkbtn" onClick={cancelHeld}>
            Discard
          </button>
        </div>
      )}
      {heldImage && (
        <div className="ins-dock-held">
          <span>
            Image ready: <strong>{heldImage.name}</strong> — say which app it is the logo for.
          </span>
          <button type="button" className="ins-linkbtn" onClick={releaseImage}>
            Discard
          </button>
        </div>
      )}
      <form className="ins-dock-composer" onSubmit={(event) => void ask(event)}>
        <button type="button" className="ins-iconbtn ins-iconbtn--plain" onClick={() => fileRef.current?.click()} aria-label="Upload a video or an image" title="Upload a video or a logo image">
          <PlusIcon size={16} />
        </button>
        <input
          className="ins-dock-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={
            liveJob
              ? liveJob.status === 'uploading'
                ? 'Uploading — press stop to cancel…'
                : 'A run is going — press stop to cancel it…'
              : heldUpload
                ? 'Answer the question above…'
                : expecting
                  ? `Type ${expecting.app}’s new ${expecting.field}…`
                  : heldImage
                    ? 'Which app is this logo for?'
                    : 'Ask, or tell me what to change…'
          }
          aria-label="Ask the assistant"
          list="ins-dock-suggestions"
          // Nothing can be typed while a reply is still coming, or while a
          // run is going — the button in this state is Stop, not Send, so
          // there is nothing for a message to do here until it finishes.
          disabled={asking || Boolean(liveJob)}
        />
        <datalist id="ins-dock-suggestions">
          {SUGGESTIONS.map((text) => (
            <option key={text} value={text} />
          ))}
        </datalist>
        {asking || liveJob ? (
          // One button, one job: while there is anything to stop — a reply
          // still typing, or a run still going — it *is* the stop button.
          // Send has nothing to do here, exactly like mid-reply.
          <button
            type="button"
            className="ins-dock-send is-stop"
            onClick={() => (asking ? stopAssistant() : liveJob && stopActiveRun(liveJob))}
            aria-label={asking ? 'Stop generating' : liveJob?.status === 'uploading' ? 'Cancel the upload' : 'Stop the run'}
            title={asking ? 'Stop generating' : liveJob?.status === 'uploading' ? 'Cancel the upload' : 'Stop the run'}
          >
            <StopIcon size={13} />
          </button>
        ) : (
          <button type="submit" className="ins-dock-send" disabled={!question.trim()} aria-label="Send">
            <ArrowRightIcon size={15} />
          </button>
        )}
      </form>
    </aside>
  );
}

function pillText(job: IngestJob): string {
  if (job.status === 'uploading') return `Uploading ${Math.round((job.uploaded ?? 0) * 100)}%`;
  if (job.status === 'running') return job.stage === 'research' ? 'AI writing content…' : INGEST_STAGES[stageIndex(job.stage)]?.label ?? 'Working…';
  if (job.status === 'done') return job.result ? `${job.result.app.name} is ready` : 'Done';
  return 'Run failed';
}

function fraction(job: IngestJob): number | null {
  if (job.status === 'uploading') return job.uploaded;
  if ((job.stage === 'classify' || job.stage === 'research') && job.total) return Math.min(1, (job.done ?? 0) / job.total);
  return null;
}

/** One answer, with any actions it offers. */
function ChatBubble({
  message,
  onAction,
  pending,
  onCancel,
}: {
  message: ChatMessage;
  onAction: (action: AssistantAction) => void;
  pending: ConfirmAction | null;
  onCancel: () => void;
}) {
  if (message.role === 'user') {
    return (
      <div className="ins-chat">
        <div className="ins-chat-msg ins-chat-msg--user">
          <span>{message.text}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="ins-chat">
      <div className="ins-chat-msg ins-chat-msg--assistant">
        {message.pending && !message.text ? (
          <p className="ins-chat-line">
            <span className="ins-typing" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            Thinking…
          </p>
        ) : (
          <div className="ins-chat-text">
            <div dangerouslySetInnerHTML={{ __html: renderChat(message.text) }} />
            {message.pending && <span className="ins-caret" aria-hidden />}
          </div>
        )}
        {!message.pending && message.actions && message.actions.length > 0 && (
          <div className="ins-chat-actions">
            {message.actions.map((action, index) => {
              if (action.type === 'open') {
                return (
                  <Link key={index} href={action.href} className="ins-chip-btn">
                    {action.label} <ExternalIcon size={11} />
                  </Link>
                );
              }
              if (action.type === 'confirm') {
                // Offered once: the buttons go once the admin has answered.
                const live = pending && pending.label === action.label && JSON.stringify(pending.op) === JSON.stringify(action.op);
                if (!live) return <span key={index} className="ins-chat-meta">{action.label} — answered</span>;
                return (
                  <span key={index} className="ins-chat-actions">
                    <button type="button" className={`ins-chip-btn ${action.destructive ? 'ins-chip-btn--danger' : 'ins-chip-btn--primary'}`} onClick={() => onAction(action)}>
                      <CheckIcon size={13} /> Confirm: {action.label}
                    </button>
                    <button type="button" className="ins-chip-btn" onClick={onCancel}>
                      Cancel
                    </button>
                  </span>
                );
              }
              if (action.type === 'reply') {
                return (
                  <button key={index} type="button" className="ins-chip-btn ins-chip-btn--quiet" onClick={() => onAction(action)}>
                    {action.text}
                  </button>
                );
              }
              return (
                <button key={index} type="button" className="ins-chip-btn" onClick={() => onAction(action)}>
                  <UploadIcon size={13} /> Upload a video
                </button>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}

/** One request and its reply, the way a chat shows them. */
/** Runs and messages in the order they happened, so a run sits where it was started. */
function timeline(jobs: IngestJob[], messages: ChatMessage[]): ({ kind: 'job'; at: number; job: IngestJob } | { kind: 'message'; at: number; message: ChatMessage })[] {
  const items: ({ kind: 'job'; at: number; job: IngestJob } | { kind: 'message'; at: number; message: ChatMessage })[] = [
    ...jobs.map((job) => ({ kind: 'job' as const, at: Date.parse(job.startedAt), job })),
    ...messages.map((message) => ({ kind: 'message' as const, at: Date.parse(message.at), message })),
  ];
  return items.sort((a, b) => a.at - b.at);
}

export function JobThread({ job, now }: { job: IngestJob; now: number }) {
  const started = Date.parse(job.startedAt);
  const ended = job.finishedAt ? Date.parse(job.finishedAt) : now;
  const elapsed = clock((ended - started) / 1000);
  const active = isActive(job);
  const current = stageIndex(job.stage);
  const bar = fraction(job);
  const app = job.result?.app ?? job.interim?.app ?? null;
  const appHref = app?.id ? `/inspirations/app/${encodeURIComponent(app.id)}` : null;

  return (
    <div className="ins-chat">
      <div className="ins-chat-msg ins-chat-msg--user">
        <span>{job.mode === 'research' ? job.title : `Find screens in “${job.title}”`}</span>
        {job.sizeBytes !== null && <span className="ins-chat-meta">{(job.sizeBytes / 1024 / 1024).toFixed(0)} MB</span>}
      </div>

      <div className={`ins-chat-msg ins-chat-msg--assistant is-${job.status}`}>
        {active && (
          <>
            <ol className="ins-chat-steps">
              {INGEST_STAGES.map((stage, index) => {
                if (job.mode === 'research' && stage.id !== 'research') return null;
                const state = job.status === 'uploading' ? (index === 0 ? 'is-active' : '') : index < current ? 'is-done' : index === current ? 'is-active' : '';
                if (!state && index > current + 1) return null;
                return (
                  <li key={stage.id} className={`ins-chat-step ${state}`}>
                    <span className="ins-chat-step-mark" aria-hidden>
                      {state === 'is-done' ? <CheckIcon size={11} /> : state === 'is-active' ? <span className="ins-spinner" /> : <span className="ins-chat-step-dot" />}
                    </span>
                    {stage.label}
                  </li>
                );
              })}
            </ol>
            <p className="ins-chat-line">
              <span className="ins-typing" aria-hidden>
                <i />
                <i />
                <i />
              </span>
              {job.message}
            </p>
            <div className={`ins-ingest-bar ${bar === null ? 'is-indeterminate' : ''}`}>
              <span style={{ width: bar === null ? '30%' : `${Math.round(bar * 100)}%` }} />
            </div>
            {job.interim && appHref && (
              <p className="ins-chat-line ins-chat-line--soft">
                {job.interim.screens?.length ?? 0} screens are already live in the library.{' '}
                <Link href={appHref} className="ins-link">
                  Open {app?.name} <ExternalIcon size={11} />
                </Link>
              </p>
            )}
          </>
        )}

        {job.status === 'done' && !job.result && (
          <p className="ins-chat-line">
            <CheckIcon size={13} className="ins-chat-ok" />
            Done. {job.message}
          </p>
        )}

        {job.status === 'done' && job.result && (
          <>
            <p className="ins-chat-line">
              <CheckIcon size={13} className="ins-chat-ok" />
              Done. <strong>{job.result.app.name}</strong> — {job.result.ingested} screen{job.result.ingested === 1 ? '' : 's'} in {job.result.flows.length} flow
              {job.result.flows.length === 1 ? '' : 's'}.
            </p>
            {job.result.researched && (job.result.researched.flows > 0 || job.result.researched.screens > 0) && (
              <p className="ins-chat-line ins-chat-line--soft">
                The AI named {job.result.researched.flows} flow{job.result.researched.flows === 1 ? '' : 's'} and {job.result.researched.screens} screen
                {job.result.researched.screens === 1 ? '' : 's'}.
              </p>
            )}
            {job.result.excluded.length > 0 && (
              <p className="ins-chat-line ins-chat-line--soft">
                {job.result.excluded.length} screen{job.result.excluded.length === 1 ? '' : 's'} left out (loading states, third-party sign-in).
              </p>
            )}
          </>
        )}

        {job.status === 'failed' && (
          <p className="ins-chat-line is-error">
            <CloseIcon size={13} />
            {job.error ?? 'The run failed.'}
          </p>
        )}

        <div className="ins-chat-foot">
          <span className="ins-chat-meta">
            {active ? `${elapsed} elapsed` : `took ${elapsed}`}
            {job.analyzer && active ? ` · ${job.analyzer.replace(/^free AI — /, '')}` : ''}
          </span>
          {/* Stop/Cancel lives in exactly one place — the pinned strip right
              above the composer — so it doesn't repeat itself down the
              conversation for the same run. */}
          {!active && appHref && (
            <Link href={appHref} className="ins-linkbtn">
              Open in gallery
            </Link>
          )}
          {!active && (
            <button type="button" className="ins-linkbtn" onClick={() => void dismissIngestJob(job.id)}>
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

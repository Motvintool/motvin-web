'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type DragEvent, type FormEvent, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/components/shared/AuthProvider';
import { useHydrated } from '@/components/shared/useHydrated';
import { adminApi, isAdminEmail, type AdminAppRecord, type AdminState } from '@/lib/inspirations/admin';
import { dayLabel, localDateString, parseDateInput } from '@/lib/inspirations/dates';
import { describeOp, labelFor, type AdminOp, type ScreensAction } from '@/lib/inspirations/assistantActions';
import { inspirationsApi, invalidateInspirationsCache } from '@/lib/inspirations/api';
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
  questionBefore,
  releaseImage,
  offerAction,
  releaseUpload,
  resumeIngest,
  reviewFrameBlob,
  setUploadPlan,
  stopActiveRun,
  stopAssistant,
  truncateChatAt,
  undoChange,
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
  type ThreadEntry,
  type IngestJob,
  type UploadPlan,
} from '@/lib/inspirations/ingestJobs';
import { ArrowRightIcon, CheckIcon, ChevronDownIcon, CloseIcon, CopyIcon, ExpandIcon, ExternalIcon, MinusIcon, PencilIcon, PlusIcon, RetryIcon, SparklesIcon, StopIcon, TrashIcon, UndoIcon, UploadIcon } from '../Icons';
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

/** Apps that already have at least one screen filed under the given platform — an app's platform isn't a field on AdminAppRecord itself, only on its screen files. */
function appsOnPlatform(state: AdminState, platform: 'ios' | 'android' | 'web'): AdminAppRecord[] {
  const ids = new Set(state.files.filter((file) => file.platform === platform).map((file) => file.appId));
  return state.apps.filter((app) => ids.has(app.id));
}

export function IngestDock() {
  const { user, ready } = useAuth();
  const admin = ready && Boolean(user && !user.isAnonymous && isAdminEmail(user.email));
  const { jobs } = useIngestJobs(admin);
  const { messages, pending: pendingAction, heldImage, heldUpload, expecting } = useAssistantChat();
  // Only the newest answer can be asked again — earlier ones already have
  // what came after them.
  const lastAnswerId = [...messages].reverse().find((message) => message.role === 'assistant' && !message.pending && message.text)?.id ?? null;
  // Which reply chip, if any, the admin actually picked for a question that
  // has since moved on — the chat's next message is the chip's own text,
  // sent as if typed (see `act`'s 'reply' branch) — so the chosen one can be
  // shown picked instead of every option still looking equally pickable.
  const answeredReply = new Map<string, string>();
  messages.forEach((message, index) => {
    if (message.role !== 'assistant' || !message.actions?.some((action) => action.type === 'reply')) return;
    const next = messages[index + 1];
    if (next?.role === 'user') answeredReply.set(message.id, next.text);
  });
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
  const inputRef = useRef<HTMLInputElement>(null);
  const focusWhenOpen = useRef(false);

  // ⌘/ (Ctrl+/ elsewhere) opens the assistant and puts the cursor in the
  // composer from anywhere on the page; Esc in the composer folds it away.
  useEffect(() => {
    if (!admin) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === '/') {
        event.preventDefault();
        focusWhenOpen.current = true;
        setCollapsed((value) => {
          if (value) {
            try {
              localStorage.setItem(COLLAPSED_KEY, '0');
            } catch {
              // Private mode or blocked storage.
            }
          }
          return false;
        });
        inputRef.current?.focus();
      } else if (event.key === 'Escape' && document.activeElement === inputRef.current) {
        inputRef.current?.blur();
        setCollapsed(true);
        try {
          localStorage.setItem(COLLAPSED_KEY, '1');
        } catch {
          // Private mode or blocked storage.
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [admin]);
  useEffect(() => {
    if (!collapsed && focusWhenOpen.current) {
      focusWhenOpen.current = false;
      inputRef.current?.focus();
    }
  }, [collapsed]);
  /** The library as it stood when a recording was dropped — apps and their versions, for the questions that follow. */
  const libraryRef = useRef<AdminState | null>(null);

  const visible = jobs.filter((job) => !job.dismissed).slice(0, 3);
  const running = visible.some(isActive);
  /** The one job the composer's stop control acts on, if any is going. */
  const liveJob = visible.find(isActive) ?? null;
  /** A run paused for review, if any — its decision buttons render in the
   * pinned strip below (`reviewSlot`), not inside the scrolling chat log, so
   * they stay reachable no matter how far down a long raw-sample grid the
   * admin has scrolled. */
  const reviewJob = visible.find((job) => job.status === 'awaiting-review') ?? null;
  const [reviewSlot, setReviewSlot] = useState<HTMLDivElement | null>(null);

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
    const apps = appsOnPlatform(state, plan.platform!);
    if (!apps.length) {
      if (heldUpload?.kind === 'screens') askName(plan);
      else offerHeld({ platform: plan.platform! });
      return;
    }
    setUploadPlan({ ...plan, step: 'app' });
    assistantSays('Is this a new app, or more screens of one already in the library?', [chip('New app'), ...apps.slice(0, 8).map((app) => chip(app.name)), chip('Cancel')]);
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
      const apps = appsOnPlatform(state, plan.platform!);
      const needle = text.toLowerCase();
      const app =
        apps.find((entry) => entry.name.toLowerCase() === needle || entry.id === needle) ??
        apps.find((entry) => needle.includes(entry.name.toLowerCase()) || entry.name.toLowerCase().includes(needle));
      if (!app) {
        const platformLabel = PLATFORM_CHOICES.find((choice) => choice.id === plan.platform)?.label ?? '';
        assistantSays(`I don’t know a ${platformLabel} app called “${text}”. Pick one, or say “new app”.`, [chip('New app'), ...apps.slice(0, 8).map((entry) => chip(entry.name)), chip('Cancel')]);
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

  /** Edit a sent message and send it again: the conversation continues from there. */
  const resend = (message: ChatMessage, text: string) => {
    if (asking || liveJob || !text.trim()) return;
    truncateChatAt(message.id);
    void send(text.trim());
  };

  /** Ask the same thing again, for another answer. */
  const retry = (message: ChatMessage) => {
    if (asking || liveJob) return;
    const question = questionBefore(message.id);
    if (!question) return;
    truncateChatAt(question.id);
    void send(question.text);
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
        <button type="button" className={`ins-dock-pill ${latest && isActive(latest) ? 'is-running' : ''}`} onClick={toggle} aria-label="Open the assistant" title="Open the assistant (⌘/)">
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
        <button type="button" className="ins-iconbtn ins-iconbtn--plain" onClick={toggle} aria-label="Minimise" title="Minimise (Esc in the composer)">
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
            <JobThread key={item.job.id} job={item.job} now={now} reviewSlot={item.job.id === reviewJob?.id ? reviewSlot : null} />
          ) : (
            <ChatBubble
              key={item.message.id}
              message={item.message}
              onAction={act}
              pending={pendingAction}
              onCancel={cancelPending}
              onResend={resend}
              onRetry={retry}
              onUndo={(target) => void undoChange(target.id)}
              canRetry={!asking && !liveJob && item.message.id === lastAnswerId}
              busy={asking || Boolean(liveJob)}
              newest={item.message.id === lastAnswerId}
              answeredWith={answeredReply.get(item.message.id)}
            />
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
      {/* A paused run's decision buttons, in the same always-visible strip as
          the questions above — not inside the scrolling chat log, where a
          long raw-sample grid could put them hundreds of thumbnails away
          from view. ReviewGrid portals its actual buttons into this div once
          it mounts; the label here stays generic, since the finer detail
          ("likely loading and sign-in screens are already ticked…") is
          already right there above the grid, which is still worth scrolling
          to for the grid itself even if the decision no longer requires it. */}
      {reviewJob && (
        <div className="ins-dock-held">
          <div className="ins-dock-held-row">
            <span>
              <strong>{reviewJob.title}</strong> — clean up its screens automatically, or review them yourself?
            </span>
            <button type="button" className="ins-linkbtn" onClick={() => void dismissIngestJob(reviewJob.id)}>
              Dismiss
            </button>
          </div>
          <div className="ins-dock-held-actions" ref={setReviewSlot} />
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
          ref={inputRef}
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
/** When a message was sent — the time today, the day and time otherwise. */
function timeLabel(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return date.toDateString() === new Date().toDateString() ? time : `${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${time}`;
}

/**
 * Screens shown in the chat as thumbnails — the "image list" the admin asks
 * for when picking what to delete. Tap to select; the button under the grid
 * offers the delete as a Confirm, the same as every other change. Once the
 * offer is answered the grid stays as a record, without its controls.
 */
function ScreenPicker({ action, live, disabled }: { action: ScreensAction; live: boolean; disabled: boolean }) {
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) => setPicked((list) => (list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id]));
  const offer = () => {
    const chosen = action.screens.filter((screen) => picked.includes(screen.id));
    if (!chosen.length) return;
    const op: AdminOp =
      chosen.length === 1
        ? { kind: 'delete-screen', platform: action.platform, appId: action.appId, file: chosen[0].file, version: chosen[0].version, flow: chosen[0].flow, name: chosen[0].name }
        : { kind: 'delete-screens', platform: action.platform, appId: action.appId, name: action.appName, screens: chosen.map(({ file, version, flow, name }) => ({ file, version, flow, name })) };
    setPicked([]);
    offerAction(describeOp(op), { type: 'confirm', op, label: labelFor(op), destructive: true });
  };
  return (
    <div className="ins-chat-screens">
      <div className="ins-chat-screens-head">
        <span className="ins-chat-meta">
          {action.screens.length} screen{action.screens.length === 1 ? '' : 's'} · {action.appName}
          {action.versionLabel ? ` · ${action.versionLabel}` : ''}
        </span>
        {live && picked.length > 0 && (
          <button type="button" className="ins-linkbtn" onClick={() => setPicked([])}>
            Clear
          </button>
        )}
      </div>
      <div className="ins-chat-screens-grid" role={live ? 'listbox' : 'list'} aria-multiselectable={live || undefined} aria-label={`Screens of ${action.appName}`}>
        {action.screens.map((screen) => {
          const src = inspirationsApi.mediaUrl(screen.path);
          const selected = picked.includes(screen.id);
          return (
            <button
              key={screen.id}
              type="button"
              role={live ? 'option' : undefined}
              aria-selected={live ? selected : undefined}
              className={`ins-chat-screen ${selected ? 'is-picked' : ''}`}
              onClick={() => live && toggle(screen.id)}
              disabled={!live || disabled}
              title={screen.name}
            >
              {/* The backend serves these already sized; the optimiser would only add a hop. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {src ? <img src={src} alt={screen.name} loading="lazy" /> : <span className="ins-chat-screen-none" aria-hidden />}
              <span className="ins-chat-screen-name">{screen.name}</span>
              {live && <span className="ins-chat-screen-tick" aria-hidden>{selected ? <CheckIcon size={12} /> : null}</span>}
            </button>
          );
        })}
      </div>
      {live && (
        <div className="ins-chat-actions">
          <button type="button" className="ins-chip-btn ins-chip-btn--danger" onClick={offer} disabled={disabled || picked.length === 0}>
            <TrashIcon size={13} /> Delete {picked.length || ''} selected
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * What the assistant did between the question and the answer — its thinking
 * aloud and each lookup or check — as a quiet thread above the answer. Open
 * while it works, folded to one line once it has answered; the admin can
 * open it again to see how the answer came about.
 */
function ThinkingThread({ entries, working, ms }: { entries: ThreadEntry[]; working: boolean; ms?: number }) {
  const steps = entries.filter((entry) => entry.kind === 'step').length;
  const summary = working ? 'Thinking' : `Thought for ${ms ? Math.max(1, Math.round(ms / 1000)) : '—'}s${steps ? ` · ${steps} step${steps === 1 ? '' : 's'}` : ''}`;
  return (
    <details className={`ins-chat-thread ${working ? 'is-working' : ''}`} open={working || undefined}>
      <summary className="ins-chat-thread-summary">
        <span className="ins-chat-thread-title">{summary}</span>
        <ChevronDownIcon size={13} />
      </summary>
      <ol className="ins-chat-thread-list">
        {entries.map((entry, index) => (
          <li key={index} className={`ins-chat-thread-item is-${entry.kind}`}>
            {entry.kind === 'thought' ? (
              <span className="ins-chat-thread-thought">{entry.text}</span>
            ) : (
              <>
                <span className="ins-chat-thread-step">{entry.text}</span>
                {entry.detail && <span className="ins-chat-thread-detail">{entry.detail}</span>}
              </>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}

/** Copies a message's words; the button shows a tick for a moment. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access refused: nothing to show.
    }
  };
  return (
    <button type="button" className="ins-chat-tool" onClick={() => void copy()} aria-label={copied ? 'Copied' : 'Copy'} title={copied ? 'Copied' : 'Copy'}>
      {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
    </button>
  );
}

/**
 * One message, with the small tools under it that a chat is expected to
 * have: Copy on every message; Edit on the admin's own, which sends the
 * edited words again from that point; Undo on an answer that reports a
 * change, while it can still be put back; Try again on the newest answer.
 */
function ChatBubble({
  message,
  onAction,
  pending,
  onCancel,
  onResend,
  onRetry,
  onUndo,
  canRetry,
  busy,
  newest,
  answeredWith,
}: {
  message: ChatMessage;
  onAction: (action: AssistantAction) => void;
  pending: ConfirmAction | null;
  onCancel: () => void;
  onResend: (message: ChatMessage, text: string) => void;
  onRetry: (message: ChatMessage) => void;
  onUndo: (message: ChatMessage) => void;
  canRetry: boolean;
  busy: boolean;
  /** This is the newest answer: a screen grid in it still takes picks. */
  newest: boolean;
  /** The chip text actually picked for this message's reply choices, once the chat has moved past them. */
  answeredWith?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.text);
  if (message.role === 'user') {
    if (editing) {
      const submit = () => {
        if (!draft.trim()) return;
        setEditing(false);
        if (draft.trim() === message.text.trim()) return;
        onResend(message, draft);
      };
      return (
        <div className="ins-chat">
          <div className="ins-chat-edit">
            <textarea
              className="ins-chat-edit-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setEditing(false);
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              rows={Math.min(6, Math.max(1, draft.split('\n').length))}
              aria-label="Edit your message"
              autoFocus
            />
            <div className="ins-chat-edit-actions">
              <button type="button" className="ins-chip-btn ins-chip-btn--quiet" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button type="button" className="ins-chip-btn ins-chip-btn--primary" onClick={submit} disabled={!draft.trim()}>
                Send
              </button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="ins-chat">
        <div className="ins-chat-msg ins-chat-msg--user">
          <span>{message.text}</span>
        </div>
        <div className="ins-chat-tools ins-chat-tools--user">
          <span className="ins-chat-time">{timeLabel(message.at)}</span>
          <CopyButton text={message.text} />
          <button
            type="button"
            className="ins-chat-tool"
            onClick={() => {
              setDraft(message.text);
              setEditing(true);
            }}
            disabled={busy}
            aria-label="Edit message"
            title="Edit message"
          >
            <PencilIcon size={14} />
          </button>
        </div>
      </div>
    );
  }
  const undo = message.undo && !message.undo.used ? message.undo : null;
  const isLatestGrid = newest;
  return (
    <div className="ins-chat">
      <div className="ins-chat-msg ins-chat-msg--assistant">
        {message.thread && message.thread.length > 0 && <ThinkingThread entries={message.thread} working={Boolean(message.pending)} ms={message.thinkingMs} />}
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
              if (action.type === 'screens') {
                return <ScreenPicker key={index} action={action} live={isLatestGrid} disabled={busy} />;
              }
              if (action.type === 'reply') {
                // Once the chat has moved past this question, show which
                // chip was actually picked instead of leaving every option
                // looking equally choosable forever.
                if (answeredWith !== undefined) {
                  const picked = action.text.trim().toLowerCase() === answeredWith.trim().toLowerCase();
                  return (
                    <span key={index} className={`ins-chip-btn ins-chip-btn--static ${picked ? 'ins-chip-btn--selected' : 'ins-chip-btn--quiet'}`}>
                      {picked && <CheckIcon size={12} />}
                      {action.text}
                    </span>
                  );
                }
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
      {!message.pending && message.text && (
        <div className="ins-chat-tools">
          <CopyButton text={message.text} />
          {undo && (
            <button type="button" className="ins-chat-tool ins-chat-tool--text" onClick={() => onUndo(message)} disabled={busy} title={`Undo — ${undo.label}`}>
              <UndoIcon size={14} /> Undo
            </button>
          )}
          {canRetry && (
            <button type="button" className="ins-chat-tool ins-chat-tool--text" onClick={() => onRetry(message)} title="Ask again for another answer">
              <RetryIcon size={14} /> Try again
            </button>
          )}
          <span className="ins-chat-time">{timeLabel(message.at)}</span>
        </div>
      )}
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

/**
 * One captured screen's full-size picture, while its job is still waiting
 * on a decision. These sit in the crawler's own staging dir — nothing has
 * been published yet, not even looked at by an analyzer — so they are
 * fetched with the admin's own credentials rather than linked to directly,
 * the way an already-published screen's image can be.
 */
function ReviewFrameImg({ jobId, frame, name }: { jobId: string; frame: number; name: string }) {
  // Each thumbnail keeps the same component instance for its whole life in
  // the grid in practice, but React does not promise that — so a change of
  // which screen this is showing has to reset state during render, the same
  // "adjust state when a prop changes" pattern used elsewhere in this dock,
  // rather than an effect calling setState on mount.
  const key = `${jobId}:${frame}`;
  const [loadedFor, setLoadedFor] = useState(key);
  const [src, setSrc] = useState<string | null>(null);
  // Still fetching and genuinely missing look the same without this — both
  // a plain empty box — which on a batch of eighty reads as "broken" long
  // before the slowest few have had a chance to arrive.
  const [failed, setFailed] = useState(false);
  // With every raw sample now its own tile, a long recording's grid can hold
  // thousands of these — firing a blob fetch (and the thumbnail-generating
  // sips call behind it) for every one of them on mount would mean thousands
  // of concurrent requests and subprocesses before a single pixel is needed.
  // Only a tile that has actually scrolled near the viewport starts fetching.
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLImageElement | HTMLSpanElement | null>(null);
  if (key !== loadedFor) {
    setLoadedFor(key);
    setSrc(null);
    setFailed(false);
    setVisible(false);
  }
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
      },
      { rootMargin: '800px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [key, visible]);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    void reviewFrameBlob(jobId, frame)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [jobId, frame, visible]);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- fetched as a blob, never a static asset Next could optimise.
    return <img ref={ref as Ref<HTMLImageElement>} src={src} alt={name} loading="lazy" />;
  }
  return <span ref={ref as Ref<HTMLSpanElement>} className={`ins-chat-screen-none ${failed ? '' : 'is-loading'}`} aria-hidden />;
}

/**
 * What a video upload pauses on once its screens are found: every one of
 * them, for the admin to look at, and a choice of how to clean them up —
 * the same choice the admin page's own cleanup rules make on their own the
 * rest of the time, now put to the admin first, before anything is spent
 * classifying a screen they would have thrown away anyway.
 */
/** A dropped candidate's reason, in words the admin did not have to learn the segmenter's vocabulary to read — used in the tooltip, where a full sentence fits. */
const REASON_LABEL: Record<string, string> = {
  transition: 'mid-transition',
  blank: 'blank frame',
  scrim: 'system prompt iOS did not record',
  'still moving': 'still settling',
  absorbed: 'merged into another screen',
  revisit: 'same as an earlier screen',
  duplicate: 'repeat sample of a kept screen',
};

/** The same reasons, short enough to actually fit under a ~90px thumbnail —
 * the tooltip's full sentence just ellipsised into the same few repeated
 * words on every tile ("repeat sample of a…"), which read as noise rather
 * than information across a grid of hundreds. */
const REASON_SHORT: Record<string, string> = {
  transition: 'transition',
  blank: 'blank',
  scrim: 'prompt',
  'still moving': 'settling',
  absorbed: 'merged',
  revisit: 'revisit',
  duplicate: 'duplicate',
};

export function ReviewGrid({ job, slot }: { job: IngestJob; slot?: HTMLDivElement | null }) {
  const screens = job.capturedScreens ?? [];
  const kept = screens.filter((screen) => !screen.dropped);
  const dropped = screens.filter((screen) => screen.dropped);
  // Every raw sample gets its own tile, so a screen held for a few seconds
  // can account for dozens of "dropped" entries that are just repeats of a
  // screen already kept above — worth counting apart from a moment the
  // segmenter genuinely never kept, so the summary line does not read as if
  // hundreds of screens were missed when most of them are just duplicates.
  const duplicateCount = dropped.filter((screen) => screen.kind === 'duplicate').length;
  const setAsideCount = dropped.length - duplicateCount;
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The dock is a narrow, pinned strip — fine for a handful of thumbnails,
  // cramped for the hundreds a long recording's raw-sample grid can hold.
  // Expanding opens the same grid, same state, in a full-size popup instead.
  const [expanded, setExpanded] = useState(false);
  const mounted = useHydrated();
  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [expanded]);

  const toggle = (id: string) => {
    if (busy) return;
    setPicked((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resume = async (decision: { mode: 'automatic' } | { mode: 'manual'; excluded: string[] }) => {
    setBusy(true);
    setError(null);
    try {
      await resumeIngest(job.id, decision);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const label = (screen: NonNullable<IngestJob['capturedScreens']>[number]) =>
    `${screen.dropped ? 'Set aside' : 'Screen'} at ${screen.start.toFixed(1)}s${
      screen.kind === 'overlay' ? ', over another screen' : screen.kind === 'scrolled' ? ', scrolled' : ''
    }${screen.external ? ' — looks like a sign-in page' : ''}${screen.reason ? ` — ${REASON_LABEL[screen.reason] ?? screen.reason}` : ''}`;

  // What ticking actually does, since kept and set-aside screens start from
  // opposite defaults: ticking a kept one removes it, same as before this
  // "show everything" grid existed; ticking a set-aside one simply leaves it
  // out, which is already where it was — the only new, useful move is
  // *untick* one, recovering it as a real screen when the segmenter was wrong
  // to drop it in the first place.
  const toRemove = kept.filter((screen) => picked.has(screen.id));
  const toRecover = dropped.filter((screen) => !picked.has(screen.id));

  // Rendered either inline, right under the grid (VideoPanel's full-width
  // page, where nothing else competes for room), or portaled into the
  // dock's own pinned strip above its composer — the same always-visible
  // spot a held upload's "which app?" question already uses, rather than a
  // floating box inside the scrolling chat log. The dock's narrow column can
  // hold hundreds of raw-sample tiles; nothing about keeping the decision
  // visible should depend on exactly how far down that scroll the admin is.
  const actionButtons = !picking ? (
    <>
      <button
        type="button"
        className="ins-chip-btn"
        onClick={() => {
          // A head start, not the final word: a screen the segmenter
          // itself flagged as loading or already set aside, or that a
          // quick, free, on-device text check caught as a
          // Google/Apple/Facebook sign-in page, is ticked already —
          // all three are what "automatic" would leave out anyway, so
          // the admin only adjusts from there instead of rebuilding
          // the list by hand, and recovers a wrongly set-aside screen
          // with a single untick.
          setPicked(new Set(screens.filter((screen) => screen.dropped || screen.kind === 'loading' || screen.external).map((screen) => screen.id)));
          setPicking(true);
        }}
        disabled={busy}
      >
        I’ll choose myself
      </button>
      <button type="button" className="ins-chip-btn ins-chip-btn--primary" onClick={() => void resume({ mode: 'automatic' })} disabled={busy}>
        Clean up automatically
      </button>
    </>
  ) : (
    <>
      <button type="button" className="ins-chip-btn ins-chip-btn--danger" onClick={() => void resume({ mode: 'manual', excluded: [...picked] })} disabled={busy}>
        <TrashIcon size={13} /> Apply and continue
      </button>
      <button type="button" className="ins-chip-btn ins-chip-btn--quiet" onClick={() => void resume({ mode: 'manual', excluded: [] })} disabled={busy}>
        Recover everything, continue
      </button>
      <button
        type="button"
        className="ins-chip-btn"
        onClick={() => {
          setPicking(false);
          setPicked(new Set());
        }}
        disabled={busy}
      >
        Back
      </button>
    </>
  );

  const headAndGrid = (
    <>
      <div className="ins-chat-screens-head">
        {/* .ins-chat-line is a flex row (built for an icon beside one line of
            text elsewhere in this dock) — wrapped in a span so this summary's
            several conditional fragments are one flex item with normal
            flowing text, not each becoming its own item and wrapping as a
            ragged column of its own. */}
        <p className="ins-chat-line">
          <span>
            <strong>{kept.length}</strong> screen{kept.length === 1 ? '' : 's'} found
            {setAsideCount ? (
              <>
                , <strong>{setAsideCount}</strong> more set aside
              </>
            ) : null}
            {duplicateCount ? (
              <>
                , <strong>{duplicateCount}</strong> repeat sample{duplicateCount === 1 ? '' : 's'} of a kept screen
              </>
            ) : null}
            .{' '}
            {picking
              ? `Likely loading and sign-in screens, and everything set aside, are already ticked to leave out — untick a set-aside one to recover it, or tap any other thumbnail to add or drop it. ${toRemove.length} removed, ${toRecover.length} recovered.`
              : 'Clean them up automatically, or pick through everything — kept and set aside — yourself?'}
          </span>
        </p>
        <button
          type="button"
          className="ins-iconbtn ins-iconbtn--plain"
          onClick={() => setExpanded((value) => !value)}
          aria-label={expanded ? 'Close the expanded view' : 'Expand to a larger preview'}
          title={expanded ? 'Close the expanded view' : 'Expand to a larger preview'}
        >
          {expanded ? <CloseIcon size={15} /> : <ExpandIcon size={15} />}
        </button>
      </div>
      <div className="ins-chat-screens-grid" role={picking ? 'listbox' : 'list'} aria-multiselectable={picking || undefined}>
        {screens.map((screen) => {
          const isPicked = picked.has(screen.id);
          return (
            <button
              key={screen.id}
              type="button"
              role={picking ? 'option' : undefined}
              aria-selected={picking ? isPicked : undefined}
              className={`ins-chat-screen ${isPicked ? 'is-picked' : ''} ${screen.dropped ? 'is-dropped' : ''}`}
              onClick={() => picking && toggle(screen.id)}
              disabled={!picking || busy}
              title={label(screen)}
            >
              <ReviewFrameImg jobId={job.id} frame={screen.frame} name={label(screen)} />
              <span className="ins-chat-screen-name">
                {screen.dropped ? (REASON_SHORT[screen.reason ?? ''] ?? 'set aside') : screen.brief ? 'brief' : `${screen.start.toFixed(1)}s`}
              </span>
              {picking && (
                <span className="ins-chat-screen-tick" aria-hidden>
                  {isPicked ? <CheckIcon size={12} /> : null}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {error && (
        <p className="ins-chat-line is-error">
          <CloseIcon size={13} />
          {error}
        </p>
      )}
    </>
  );

  // Collapsed in the dock, or standalone on VideoPanel's full-width page:
  // actions show right under the grid, unless the dock has already given
  // this a portal target (`slot`) to render into instead.
  const content = (
    <div className="ins-chat-screens">
      {headAndGrid}
      {!slot && <div className="ins-chat-actions">{actionButtons}</div>}
    </div>
  );

  const portalButtons = slot && !expanded ? createPortal(<>{actionButtons}</>, slot) : null;

  if (!expanded) return (
    <>
      {content}
      {portalButtons}
    </>
  );

  // The same grid, same state, in a full-size popup instead of the dock's
  // narrow strip — a long recording's raw-sample grid is easiest to pick
  // through with room to actually see each thumbnail. The dock itself keeps
  // a short placeholder rather than going blank where the grid used to be.
  return (
    <>
      <p className="ins-chat-line ins-chat-line--soft">Reviewing in the expanded view.</p>
      {mounted &&
        createPortal(
          <div className="ins-portal ins-search-overlay" role="presentation" onClick={() => setExpanded(false)}>
            <div className="ins-review-modal" role="dialog" aria-modal="true" aria-label="Review captured screens" onClick={(e) => e.stopPropagation()}>
              <div className="ins-review-modal-body">
                <div className="ins-chat-screens">{headAndGrid}</div>
              </div>
              <div className="ins-review-modal-actions">
                <div className="ins-chat-actions">{actionButtons}</div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export function JobThread({ job, now, reviewSlot }: { job: IngestJob; now: number; reviewSlot?: HTMLDivElement | null }) {
  const started = Date.parse(job.startedAt);
  const ended = job.finishedAt ? Date.parse(job.finishedAt) : now;
  const elapsed = clock((ended - started) / 1000);
  const active = isActive(job);
  const current = stageIndex(job.stage);
  const bar = fraction(job);
  const app = job.result?.app ?? job.interim?.app ?? null;
  const appHref = app?.id ? `/inspirations/app/${encodeURIComponent(app.id)}` : null;

  const foot = (
    <div className="ins-chat-foot">
      <span className="ins-chat-meta">
        {active ? `${elapsed} elapsed` : `took ${elapsed}`}
        {job.analyzer && active ? ` · ${job.analyzer.replace(/^free AI — /, '')}` : ''}
      </span>
      {/* Stop/Cancel lives in exactly one place — the pinned strip right
          above the composer — so it doesn't repeat itself down the
          conversation for the same run. A paused run's own Dismiss lives
          there too now (see IngestDock's .ins-dock-held), so it isn't
          repeated here either. */}
      {!active && appHref && (
        <Link href={appHref} className="ins-linkbtn">
          Open in gallery
        </Link>
      )}
      {!active && job.status !== 'awaiting-review' && (
        <button type="button" className="ins-linkbtn" onClick={() => void dismissIngestJob(job.id)}>
          Dismiss
        </button>
      )}
    </div>
  );

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

        {job.status === 'awaiting-review' && <ReviewGrid job={job} slot={reviewSlot} />}

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

        {foot}
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { useAuth } from '@/components/shared/AuthProvider';
import { isAdminEmail } from '@/lib/inspirations/admin';
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
  heldVideoFileNow,
  holdImage,
  holdVideo,
  loadAssistantChat,
  offerStop,
  performAction,
  platformIn,
  PLATFORM_CHOICES,
  releaseImage,
  releaseVideo,
  clock,
  dismissIngestJob,
  isActive,
  megabytes,
  stageIndex,
  startIngest,
  useAiStatus,
  useAssistantChat,
  useIngestJobs,
  type AssistantAction,
  type ChatMessage,
  type ConfirmAction,
  type IngestJob,
} from '@/lib/inspirations/ingestJobs';
import { ArrowRightIcon, CheckIcon, CloseIcon, ExpandIcon, ExternalIcon, MinusIcon, PlusIcon, SparklesIcon, TrashIcon, UploadIcon } from '../Icons';
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

const SUGGESTIONS = ['How far is the run?', 'How long is left?', 'What did the last run do?', 'Which AI is on?'];

export function IngestDock() {
  const { user, ready } = useAuth();
  const admin = ready && Boolean(user && !user.isAnonymous && isAdminEmail(user.email));
  const { jobs } = useIngestJobs(admin);
  const { messages, pending: pendingAction, heldImage, heldVideo, expecting } = useAssistantChat();
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

  const visible = jobs.filter((job) => !job.dismissed).slice(0, 3);
  const running = visible.some(isActive);

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

  /** A dropped or picked file: a video starts a run, an image becomes a logo. */
  const upload = async (file: File) => {
    if (!user) return;
    if (isImage(file)) {
      // Picked for a logo the admin just confirmed, or for one waiting.
      const target = logoFor ?? (pendingAction?.op.kind === 'set-logo' || pendingAction?.op.kind === 'add-screen' ? pendingAction : null);
      if (target) {
        setLogoFor(null);
        await performAction(target, file);
        return;
      }
      if (pendingAction?.op.kind === 'add-screen') {
        await performAction(pendingAction, file);
        return;
      }
      holdImage(file);
      assistantSays(`Got “${file.name}”. Is it a logo or a screen? Say, for example, “set this as Swiggy’s logo” or “add this as a screen to Swiggy”.`);
      return;
    }
    if (!(file.type.startsWith('video/') || /\.(mov|mp4|m4v|avi|mkv)$/i.test(file.name))) {
      assistantSays('I can take a screen recording (.mov or .mp4) to add an app, or an image to set a logo.');
      return;
    }
    if (running) {
      assistantSays('A run is already going. One at a time keeps the Mac usable — drop the next recording when it finishes.');
      return;
    }
    // A recording does not say what it was recorded on, and that decides
    // where its screens are filed — so the platform is asked first.
    holdVideo(file);
    assistantSays(`Got “${file.name}” (${megabytes(file.size)}). Which platform is it from?`, [...PLATFORM_CHOICES.map((choice) => ({ type: 'reply' as const, text: choice.label })), { type: 'reply' as const, text: 'Cancel' }]);
  };

  /** Starts the held recording once the platform is known. */
  const startHeld = async (platform: 'ios' | 'android' | 'web') => {
    const file = heldVideoFileNow();
    if (!file || !user) return;
    releaseVideo();
    try {
      await startIngest(file, user.email, { platform });
      assistantSays(`Starting on “${file.name}” as ${PLATFORM_CHOICES.find((choice) => choice.id === platform)?.label ?? platform}. The screens will be live in a minute or two; the AI writes the names after that.`);
    } catch (error) {
      assistantSays(`I could not start that run: ${(error as Error).message}`);
    }
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
    if (!text.trim() || asking) return;
    setQuestion('');
    if (/^upload$/i.test(text.trim())) {
      fileRef.current?.click();
      return;
    }
    // A held recording is waiting for its platform; a platform word answers it.
    if (heldVideoFileNow()) {
      const platform = platformIn(text);
      if (platform) {
        adminSays(text.trim());
        await startHeld(platform);
        return;
      }
      if (/^(cancel|never ?mind|forget it|no)\b/i.test(text.trim())) {
        adminSays(text.trim());
        releaseVideo();
        assistantSays('Okay, I’ve set that recording aside. Drop it again whenever you like.');
        return;
      }
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
      if (heldVideoFileNow() && platformIn(action.text)) {
        adminSays(action.text);
        void startHeld(platformIn(action.text)!);
        return;
      }
      if (heldVideoFileNow() && /^cancel/i.test(action.text)) {
        adminSays(action.text);
        releaseVideo();
        assistantSays('Okay, I’ve set that recording aside. Drop it again whenever you like.');
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
      hidden
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file) void upload(file);
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
        const file = e.dataTransfer.files?.[0];
        if (file) void upload(file);
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
                Hi. Drop a screen recording to add an app, drop an image to set a logo, or tell me what to change — “change Swiggy’s tagline to …”, “remove Airbnb”. I’ll ask before doing anything.
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
            <JobThread key={item.job.id} job={item.job} now={now} onStop={() => offerStop(item.job)} />
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
          {job.status === 'running' && (
            <button type="button" className="ins-linkbtn ins-linkbtn--danger" onClick={() => offerStop(job)}>
              Stop
            </button>
          )}
        </div>
      ))}
      {heldVideo && (
        <div className="ins-dock-held">
          <span>
            Recording ready: <strong>{heldVideo.name}</strong> — which platform? iOS, Android or Web.
          </span>
          <button type="button" className="ins-linkbtn" onClick={releaseVideo}>
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
          placeholder={heldVideo ? 'iOS, Android or Web?' : expecting ? `Type ${expecting.app}’s new ${expecting.field}…` : running ? 'Ask how far the run is…' : heldImage ? 'Which app is this logo for?' : 'Ask, or tell me what to change…'}
          aria-label="Ask the assistant"
          list="ins-dock-suggestions"
          disabled={asking}
        />
        <datalist id="ins-dock-suggestions">
          {SUGGESTIONS.map((text) => (
            <option key={text} value={text} />
          ))}
        </datalist>
        <button type="submit" className="ins-dock-send" disabled={!question.trim() || asking} aria-label="Send">
          {asking ? <span className="ins-spinner" /> : <ArrowRightIcon size={15} />}
        </button>
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

export function JobThread({ job, now, onStop }: { job: IngestJob; now: number; onStop?: () => void }) {
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
          {active && job.status === 'running' && onStop && (
            <button type="button" className="ins-linkbtn ins-linkbtn--danger" onClick={onStop}>
              Stop
            </button>
          )}
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

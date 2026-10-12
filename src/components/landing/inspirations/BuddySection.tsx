'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import { IMAGE_SIZE, optimizedImage } from '@/lib/inspirations/optimizedImage';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import type { LandingApp } from './useLandingLibrary';

/**
 * "Meet Motvin Buddy": a chat you can try. Each prompt chip asks Buddy a
 * question; the reply types out and brings real screens from the library
 * with it. The questions play on their own once the section is in view,
 * until the visitor picks one. Asking your own question opens Inspirations
 * with Buddy already answering it.
 */

const PROMPTS = [
  { ask: 'Show me onboarding screens', query: 'onboarding', noun: 'onboarding screens' },
  { ask: 'Find empty states', query: 'empty state', noun: 'empty states' },
  { ask: 'How do apps design login?', query: 'login', noun: 'login screens' },
];

const SHOT_COUNT = 4;
// How many results to look through for screens from different apps.
const SEARCH_LIMIT = 150;
const ASK_DELAY = 350;
const MIN_TYPING = 900;
const WORD_MS = 40;
// How long an answer stays up before the next question plays.
const AUTO_ADVANCE = 6500;

type Shot = { id: string; appId: string; src: string; srcSet?: string };
type Answer = { total: number; shots: Shot[] };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Longest wait for a picture, so a slow one never holds the reply up.
const PRELOAD_TIMEOUT = 2500;
// decode() waits for the page to paint, which a background tab never does.
const DECODE_TIMEOUT = 300;

/** Loads a picture (and decodes it where the browser can), so it can be painted at once. */
function preload(shot: Shot): Promise<void> {
  const img = new Image();
  const loaded = new Promise<void>((resolve) => {
    img.onload = () => resolve();
    img.onerror = () => resolve();
  });
  if (shot.srcSet) img.srcset = shot.srcSet;
  img.src = shot.src;
  const ready = loaded.then(() =>
    Promise.race([img.decode().catch(() => undefined), sleep(DECODE_TIMEOUT)]),
  );
  return Promise.race([ready, sleep(PRELOAD_TIMEOUT)]);
}

/** The library's answer to a prompt: how many screens match, and a few of them from different apps. */
async function findScreens(query: string): Promise<Answer> {
  // iOS only, the same default as the search page "See all" opens.
  const results = await inspirationsApi.search(query, undefined, undefined, { limit: SEARCH_LIMIT }, { platform: 'ios' });
  // iOS screens only, so the answer is always a row of phone screens.
  const pool = results.screens.filter((screen) => screen.platform === 'ios');
  const picked: typeof results.screens = [];
  const seen = new Set<string>();
  // One screen per app first. Only if there are too few apps, fill up with
  // more from the same apps, skipping any that look like a screen already
  // picked (the same step captured twice, say).
  for (const screen of pool) {
    if (picked.length < SHOT_COUNT && !seen.has(screen.appId)) {
      seen.add(screen.appId);
      picked.push(screen);
    }
  }
  for (const screen of pool) {
    if (picked.length >= SHOT_COUNT) break;
    const repeat = picked.some((p) => p === screen || (p.appId === screen.appId && p.name === screen.name));
    if (!repeat) picked.push(screen);
  }
  const shots = picked.flatMap((screen) => {
    const url = inspirationsApi.mediaUrl(screen.url);
    return url ? [{ id: screen.id, appId: screen.appId, ...optimizedImage(url, IMAGE_SIZE.card) }] : [];
  });
  await Promise.all(shots.map(preload));
  return { total: results.screenTotal, shots };
}

/** Buddy's illustration on a dark circle, the same as its button in Inspirations. */
function Avatar() {
  return (
    <span className="lpi-buddy-avatar" aria-hidden="true">
      <img src="/ASSET/Icons/Motvin/bot-Illustration.svg" alt="" width={33} height={33} />
    </span>
  );
}

export function BuddySection({ apps }: { apps: LandingApp[] }) {
  const router = useRouter();
  const sectionRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [stage, setStage] = useState<'idle' | 'asked' | 'typing' | 'answer'>('idle');
  const [reply, setReply] = useState('');
  const [shots, setShots] = useState<Shot[]>([]);
  const [inView, setInView] = useState(false);
  // Once the visitor picks a question, the chat stops moving on by itself.
  const [manual, setManual] = useState(false);
  const [question, setQuestion] = useState('');
  // Counts the questions asked, so a newer one cancels an older one still playing.
  const run = useRef(0);
  const [asked, setAsked] = useState(0);
  const answers = useRef(new Map<number, Promise<Answer>>());

  const play = useCallback(async (index: number) => {
    const id = ++run.current;
    const stale = () => id !== run.current;
    const calm = reducedMotion();
    setAsked(id);
    setActive(index);
    setStage('asked');
    setReply('');
    setShots([]);
    const prompt = PROMPTS[index];
    let loading = answers.current.get(index);
    if (!loading) {
      loading = findScreens(prompt.query).catch(() => ({ total: 0, shots: [] }));
      answers.current.set(index, loading);
    }
    await sleep(calm ? 0 : ASK_DELAY);
    if (stale()) return;
    setStage('typing');
    const [answer] = await Promise.all([loading, sleep(calm ? 0 : MIN_TYPING)]);
    if (stale()) return;
    const text = answer.total
      ? `Here are ${answer.total.toLocaleString('en-US')} ${prompt.noun} from iOS apps.`
      : `I can find ${prompt.noun} for you in Inspirations.`;
    setStage('answer');
    const words = text.split(' ');
    for (let count = 1; count <= words.length; count++) {
      if (stale()) return;
      setReply(words.slice(0, count).join(' '));
      if (!calm) await sleep(WORD_MS);
    }
    setShots(answer.shots);
  }, []);

  // Plays the first question when the section scrolls into view.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.35 });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (inView && stage === 'idle') void play(0);
  }, [inView, stage, play]);

  // Then moves on to the next one, while it is on screen and nobody has picked one.
  useEffect(() => {
    if (!inView || manual || stage !== 'answer' || shots.length === 0 || reducedMotion()) return;
    const timer = setTimeout(() => void play((active + 1) % PROMPTS.length), AUTO_ADVANCE);
    return () => clearTimeout(timer);
  }, [inView, manual, stage, shots, active, play]);

  const pick = (index: number) => {
    setManual(true);
    void play(index);
  };

  const ask = (event: FormEvent) => {
    event.preventDefault();
    router.push(INSPIRATIONS_ROUTES.askBuddy(question.trim() || PROMPTS[active].ask));
  };

  const appById = new Map(apps.map((app) => [app.id, app]));

  return (
    <section className="lpi-buddy" ref={sectionRef} aria-labelledby="lpi-buddy-title">
      <div className="lpi-heading">
        <h2 className="lpi-title" id="lpi-buddy-title">
          Ask Motvin Buddy for any screen
        </h2>
        <p className="lpi-lead">Describe what you need in plain words. Buddy finds it across the library and takes you straight there.</p>
      </div>

      <div className="lpi-buddy-stage">
        <div className="lpi-buddy-window">
          <div className="lpi-buddy-chat" aria-live="polite">
            {stage !== 'idle' ? (
              <p className="lpi-buddy-bubble is-user" key={asked}>
                {PROMPTS[active].ask}
              </p>
            ) : null}
            {stage === 'typing' || stage === 'answer' ? (
              <div className="lpi-buddy-reply">
                <Avatar />
                <p className="lpi-buddy-bubble is-buddy">
                  {stage === 'typing' ? (
                    <span className="lpi-buddy-typing" aria-label="Buddy is typing">
                      <i />
                      <i />
                      <i />
                    </span>
                  ) : (
                    reply
                  )}
                  {shots.length ? (
                    <Link href={INSPIRATIONS_ROUTES.searchFor(PROMPTS[active].query)} className="lpi-buddy-see-all">
                      See all
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 12h14" />
                        <path d="m13 6 6 6-6 6" />
                      </svg>
                    </Link>
                  ) : null}
                </p>
              </div>
            ) : null}
            <div className="lpi-buddy-shots">
              {shots.map((shot, i) => {
                const app = appById.get(shot.appId);
                return (
                  <Link
                    href={`${INSPIRATIONS_ROUTES.screens}?screen=${encodeURIComponent(shot.id)}`}
                    className="lpi-buddy-shot"
                    key={shot.id}
                    style={{ '--i': i } as CSSProperties}
                    aria-label={app ? `${app.name} screen` : 'Open screen'}
                  >
                    <span className="lpi-buddy-shot-frame">
                      <img src={shot.src} srcSet={shot.srcSet} alt="" draggable={false} />
                      <span className="lpi-buddy-shot-open" aria-hidden="true">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M7 17 17 7" />
                          <path d="M8 7h9v9" />
                        </svg>
                      </span>
                      {app ? (
                        <span className="lpi-buddy-shot-app">
                          {app.logo ? <img src={app.logo} alt="" width={18} height={18} /> : null}
                          {app.name}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="lpi-buddy-foot">
            <div className="lpi-buddy-chips" role="group" aria-label="Try a question">
              {PROMPTS.map((prompt, i) => (
                <button
                  type="button"
                  className={`lpi-buddy-chip${i === active && stage !== 'idle' ? ' is-active' : ''}`}
                  aria-pressed={i === active && stage !== 'idle'}
                  onClick={() => pick(i)}
                  key={prompt.ask}
                >
                  <svg className="lpi-buddy-chip-spark" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2c.7 5.2 2.6 8.3 10 10-7.4 1.7-9.3 4.8-10 10-.7-5.2-2.6-8.3-10-10 7.4-1.7 9.3-4.8 10-10Z" />
                  </svg>
                  {prompt.ask}
                </button>
              ))}
            </div>
            <form className="lpi-buddy-ask" onSubmit={ask}>
              <input
                type="text"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask Buddy anything…"
                aria-label="Ask Motvin Buddy"
                maxLength={240}
              />
              <button type="submit" aria-label="Ask in Inspirations">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14" />
                  <path d="m13 6 6 6-6 6" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}

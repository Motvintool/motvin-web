'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { moeiHex, moeiStore, type MoeiSpeed } from '@/lib/inspirations/moei';
import { libraryStore } from '@/lib/inspirations/store';
import { MoeiSprite, type MoeiMood } from './MoeiSprite';

/** Where the moei sits relative to the cursor: just below and to the right. */
const OFFSET = { x: 18, y: 16 };
/**
 * Its pace, by the speed chosen in the studio: how quickly it catches up per
 * 60fps frame (0–1; a little lag reads as walking), and how fast it walks to
 * a seat (px/s). Read as it goes, so a change applies at once.
 */
const PACE: Record<MoeiSpeed, { follow: number; walk: number }> = {
  chill: { follow: 0.06, walk: 200 },
  normal: { follow: 0.1, walk: 280 },
  zoomy: { follow: 0.18, walk: 420 },
};
const pace = () => PACE[moeiStore.getSnapshot().speed];
/** Walking to a seat: the shortest / longest trip. */
const WALK_MIN_MS = 320;
const WALK_MAX_MS = 1200;

/** Gentle start and stop. */
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Still this long: it sits and shows its name. */
const SIT_MS = 1200;
/** Still this long: it falls asleep. */
const SLEEP_MS = 25_000;
/** How long the happy face and heart last after a snack. */
const HAPPY_MS = 1800;

const noSubscribe = () => () => {};
/** Only with a real pointer: on a phone there's no cursor to follow. */
const finePointer = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/** The moei's size, and how far its feet sit above its box's bottom edge. */
const MOEI_SIZE = 44;
const FEET = 41;
/** Things worth sitting on: controls, cards, pills, logos — not page-wide containers. */
const PERCH_TAGS = new Set(['A', 'BUTTON', 'IMG', 'INPUT', 'LABEL', 'LI', 'ARTICLE', 'SELECT', 'TEXTAREA']);
const PERCH_ROLES = new Set(['button', 'tab', 'menuitem', 'option', 'listitem', 'link', 'radio', 'checkbox', 'dialog']);
const PERCH_WORDS = ['card', 'pill', 'chip', 'tab', 'btn', 'button', 'logo', 'item', 'shot', 'tile', 'badge', 'tag'];
const PERCH_CLASS = new RegExp(`(${PERCH_WORDS.join('|')})`, 'i');
/** The same, as one selector: to gather every one of them on screen. */
const PERCH_SELECTOR = [
  ...[...PERCH_TAGS].map((tag) => tag.toLowerCase()),
  ...[...PERCH_ROLES].map((role) => `[role="${role}"]`),
  ...PERCH_WORDS.map((word) => `[class*="${word}" i]`),
].join(',');

function perchable(el: Element): boolean {
  if (PERCH_TAGS.has(el.tagName)) return true;
  const role = el.getAttribute('role');
  if (role && PERCH_ROLES.has(role)) return true;
  return typeof el.className === 'string' && PERCH_CLASS.test(el.className);
}

const BOX_TAGS = new Set(['IMG', 'INPUT', 'SELECT', 'TEXTAREA', 'VIDEO', 'CANVAS', 'PICTURE']);

/** Not a fully transparent colour ("transparent", rgba(…, 0)). */
function visible(color: string): boolean {
  if (!color || color === 'transparent') return false;
  // Only a colour that carries an opacity can be see-through:
  // rgba(r, g, b, a) or rgb(r g b / a).
  const inner = /^rgba?\((.*)\)$/.exec(color.trim())?.[1];
  if (!inner) return true;
  const parts = inner.includes('/') ? [inner.split('/')[1]] : inner.split(',').slice(3);
  return parts.length === 0 || parseFloat(parts[0]) > 0.05;
}

/**
 * Looks like a box you could sit on: an image or field, or something with
 * a background, a border or a shadow. Plain text — a text link, a label, a
 * heading — doesn't, however clickable it is.
 */
function boxy(el: Element): boolean {
  if (BOX_TAGS.has(el.tagName)) return true;
  const cs = getComputedStyle(el);
  if (visible(cs.backgroundColor) || cs.backgroundImage !== 'none') return true;
  if (cs.boxShadow && cs.boxShadow !== 'none') return true;
  return ['top', 'right', 'bottom', 'left'].some(
    (side) => parseFloat(cs.getPropertyValue(`border-${side}-width`)) > 0 && visible(cs.getPropertyValue(`border-${side}-color`)),
  );
}

/** A sensible seat: the right size, and room above it in the window for the moei. */
function seatable(r: DOMRect): boolean {
  // Tall is fine (a phone screenshot card runs ~800px); page-wide isn't.
  if (r.width < 40 || r.height < 18 || r.width > 960 || r.height > 1100) return false;
  return r.top >= FEET + 8 && r.top <= window.innerHeight - 8 && r.right > 0 && r.left < window.innerWidth;
}

/** How far the cursor is from where the moei would sit on this element's top edge. */
function seatDistance(r: DOMRect, x: number, y: number): number {
  const sx = Math.min(Math.max(x, r.left), r.right);
  return Math.hypot(sx - x, r.top - y);
}

/** Has words of its own (not just inside its children): a label, a heading, a line. */
function hasOwnText(el: Element): boolean {
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) return true;
  }
  return false;
}

/**
 * Whether the moei's body would cover anything sitting at (left, top) on
 * `seat`: text, or another control or card. Checks a 3×3 grid inside its outline.
 */
function covers(left: number, top: number, seat: Element, allowPictures = false): boolean {
  for (const fy of [0.15, 0.5, 0.82]) {
    for (const fx of [0.2, 0.5, 0.8]) {
      const px = left + MOEI_SIZE * fx;
      const py = top + MOEI_SIZE * fy;
      if (px < 0 || py < 0 || px > window.innerWidth || py > window.innerHeight) return true;
      const el = document.elementsFromPoint(px, py).find((e) => e !== document.body && e !== document.documentElement);
      if (!el) continue;
      // Over a big screenshot with nowhere clear left, a picture may be covered — never words or controls.
      if (allowPictures && el.tagName === 'IMG') continue;
      if (hasOwnText(el)) return true;
      // The empty part of what the seat sits in (a panel, a card): fine.
      if (!el.contains(seat) && (perchable(el) || el.tagName === 'svg' || el.tagName === 'IMG')) return true;
      // A heading's whole line is taken: its words can change (Explore's
      // rotating title) and grow into a spot that was clear a moment ago.
      if (el.closest('h1, h2, h3, .ins-rotor')) return true;
    }
  }
  return false;
}

/** The places along an element's top edge the moei could sit, nearest the cursor first. */
function seatsAlong(el: Element, r: DOMRect, x: number): number[] {
  // Only the flat part of the top edge: a rounded corner curves away under
  // its feet. Feet are ~28px wide in the middle of its 44px box.
  const cs = getComputedStyle(el);
  // The corner's horizontal radius: "24px", or a share of the width ("19.65% 10.09%").
  const radius = (corner: string) => {
    const first = corner.trim().split(/\s+/)[0] ?? '0';
    const px = first.endsWith('%') ? (parseFloat(first) / 100) * r.width : parseFloat(first);
    return Math.min(px || 0, r.width / 2);
  };
  let min = r.left + radius(cs.borderTopLeftRadius) - 8;
  let max = r.right - radius(cs.borderTopRightRadius) - MOEI_SIZE + 8;
  if (min > max) min = max = r.left + r.width / 2 - MOEI_SIZE / 2;
  const want = Math.min(Math.max(x - MOEI_SIZE / 2, min), max);
  // The whole edge, nearest the cursor first (a long edge can be busy near
  // the cursor — a flow's title — and clear further along).
  const out = [want];
  for (let step = 16; out.length < 40 && (want - step >= min || want + step <= max); step += 16) {
    if (want - step >= min) out.push(want - step);
    if (want + step <= max) out.push(want + step);
  }
  return out;
}

/**
 * The seat is really there under its feet: not clipped away (a sideways
 * strip's screenshot past its edge), scrolled off, or covered by something
 * else (a sticky bar, a popup).
 */
function exposedAt(el: Element, x: number, y: number): boolean {
  // The topmost thing there is the seat (or inside it): nothing over it at all.
  const top = document.elementFromPoint(x, y);
  return top !== null && el.contains(top);
}

/** How choosy it was about a seat: fully clear, clear of words, or anywhere. */
type Strictness = 'clear' | 'pictures' | 'any';
type Seat = { left: number; top: number; el: Element; strictness: Strictness };

/**
 * Everything worth sitting on in the window, nearest the cursor first —
 * every one on screen, so a sparse page (a lone button, a row of icons)
 * still has its seats. Only runs when the cursor comes to rest.
 */
function seatCandidates(x: number, y: number): Element[] {
  const found: [Element, number][] = [];
  for (const el of document.querySelectorAll(PERCH_SELECTOR)) {
    const r = el.getBoundingClientRect();
    if (!seatable(r) || !perchable(el) || el.closest('.ins-moei') || !boxy(el)) continue;
    // Faded out or hidden (a card's hover-only button, a closed menu).
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    found.push([el, seatDistance(r, x, y)]);
  }
  return found.sort((a, b) => a[1] - b[1]).map(([el]) => el);
}

/**
 * Where to sit, as the moei's top-left: on the top edge of the nearest box
 * (a button, card, pill, logo, screenshot…), never in empty space or on a
 * line of text. It wants a spot where its body covers nothing; failing
 * that anywhere on screen, one where it covers only a picture; failing
 * that, the nearest seat as it is. Null only with nothing on screen to sit on.
 */
function findSeat(x: number, y: number): Seat | null {
  const candidates = seatCandidates(x, y).slice(0, 40);
  for (const strictness of ['clear', 'pictures', 'any'] as const) {
    for (const el of candidates) {
      const r = el.getBoundingClientRect();
      const top = r.top - FEET;
      for (const left of seatsAlong(el, r, x)) {
        // Both feet on it, really visible there.
        if (!exposedAt(el, left + 14, r.top + 3) || !exposedAt(el, left + MOEI_SIZE - 14, r.top + 3)) continue;
        if (strictness === 'any' || !covers(left, top, el, strictness === 'pictures')) return { left, top, el, strictness };
      }
    }
  }
  return null;
}

function itemCount() {
  return libraryStore.getSnapshot().collections.reduce((n, c) => n + c.items.length, 0);
}

/**
 * The moei out on the page: follows the cursor with a little lag, faces the
 * way it's going and walks while it moves; when the cursor rests it hops up
 * and sits on the nearest thing (a button, card, pill, logo…), facing the
 * cursor, with its name above it — and falls asleep after a while. Saving something to a
 * collection gives it a snack — a hop, a heart and its count goes up.
 * Never takes a click (pointer-events: none) and only animates while moving.
 */
export function MoeiCompanion() {
  const moei = useSyncExternalStore(moeiStore.subscribe, moeiStore.getSnapshot, moeiStore.getServerSnapshot);
  const canShow = useSyncExternalStore(noSubscribe, finePointer, () => false);
  const elRef = useRef<HTMLDivElement>(null);
  const [mood, setMood] = useState<MoeiMood>('idle');
  const [walking, setWalking] = useState(false);
  const [sitting, setSitting] = useState(false);
  const [facing, setFacing] = useState<1 | -1>(1);
  const [hidden, setHidden] = useState(true);
  const [snack, setSnack] = useState(0);

  const active = moei.out && canShow;

  // Following the cursor.
  useEffect(() => {
    if (!active) return;
    const pos = { x: -100, y: -100 };
    const target = { x: -100, y: -100 };
    const cursor = { x: -100, y: -100 };
    let placed = false;
    let perched = false;
    // A walk to a seat: from where it was, at a steady pace, with a hop.
    let walk: { fromX: number; fromY: number; toX: number; toY: number; start: number; dur: number; arc: number } | null = null;
    let scrollTimer: ReturnType<typeof setTimeout> | undefined;
    // While it sits: its seat, and a slow check that the page hasn't moved under it.
    let seat: Seat | null = null;
    let recheck: ReturnType<typeof setInterval> | undefined;
    const seatStillGood = () => {
      if (!seat) return true;
      if (!seat.el.isConnected) return false;
      const r = seat.el.getBoundingClientRect();
      const mid = target.x + MOEI_SIZE / 2;
      if (Math.abs(r.top - FEET - target.y) >= 1.5 || mid < r.left - 8 || mid > r.right + 8) return false;
      if (!exposedAt(seat.el, mid, r.top + 3)) return false;
      return seat.strictness === 'any' || !covers(target.x, target.y, seat.el, seat.strictness === 'pictures');
    };
    let raf = 0;
    let last = 0;
    let lastMove = performance.now();
    let sitTimer: ReturnType<typeof setTimeout> | undefined;
    let sleepTimer: ReturnType<typeof setTimeout> | undefined;

    const draw = () => {
      const el = elRef.current;
      if (el) el.style.transform = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0)`;
    };

    const tick = (now: number) => {
      if (walk) {
        const t = Math.min(1, (now - walk.start) / walk.dur);
        const e = easeInOut(t);
        pos.x = walk.fromX + (walk.toX - walk.fromX) * e;
        // Along the way, a little hop arc up onto the seat.
        pos.y = walk.fromY + (walk.toY - walk.fromY) * e - walk.arc * Math.sin(Math.PI * t);
        draw();
        if (t < 1) {
          raf = requestAnimationFrame(tick);
          return;
        }
        walk = null;
        raf = 0;
        last = 0;
        setWalking(false);
        // Landed: turn to look at the cursor.
        setFacing(cursor.x >= pos.x + MOEI_SIZE / 2 ? 1 : -1);
        return;
      }
      const dt = last ? Math.min(64, now - last) : 16.7;
      last = now;
      const k = 1 - Math.pow(1 - pace().follow, dt / 16.7);
      const dx = target.x - pos.x;
      const dy = target.y - pos.y;
      pos.x += dx * k;
      pos.y += dy * k;
      draw();
      if (Math.abs(dx) > 1.5) setFacing(dx > 0 ? 1 : -1);
      const moving = Math.hypot(dx, dy) > 1.2;
      setWalking(moving);
      if (moving) raf = requestAnimationFrame(tick);
      else {
        raf = 0;
        last = 0;
        // Arrived on its perch: turn to look at the cursor.
        if (perched) setFacing(cursor.x >= pos.x + MOEI_SIZE / 2 ? 1 : -1);
      }
    };

    // Rest: hop up onto the nearest thing and sit on its top edge, above the
    // cursor; nothing to sit on, sit by the cursor where it is.
    const perch = () => {
      setSitting(true);
      seat = findSeat(cursor.x, cursor.y);
      if (!seat) return;
      perched = true;
      // Content loading in (or a sticky bar sliding) can move things after it
      // sits: every so often, check the seat, and find another if it's gone.
      clearInterval(recheck);
      recheck = setInterval(() => {
        if (perched && !walk && !seatStillGood()) perch();
      }, 1500);
      target.x = seat.left;
      target.y = seat.top;
      const dist = Math.hypot(seat.left - pos.x, seat.top - pos.y);
      if (dist < 2) return;
      const calm = reducedMotion();
      walk = {
        fromX: pos.x,
        fromY: pos.y,
        toX: seat.left,
        toY: seat.top,
        start: performance.now(),
        dur: calm ? 200 : Math.min(WALK_MAX_MS, Math.max(WALK_MIN_MS, (dist / pace().walk) * 1000)),
        arc: calm ? 0 : Math.min(36, 8 + dist * 0.12),
      };
      if (Math.abs(seat.left - pos.x) > 2) setFacing(seat.left > pos.x ? 1 : -1);
      setWalking(true);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      cursor.x = e.clientX;
      cursor.y = e.clientY;
      perched = false;
      walk = null;
      seat = null;
      clearInterval(recheck);
      target.x = e.clientX + OFFSET.x;
      target.y = e.clientY + OFFSET.y;
      if (!placed) {
        // First sight: appear by the cursor rather than walking in from a corner.
        placed = true;
        pos.x = target.x;
        pos.y = target.y;
        draw();
      }
      setHidden(false);
      lastMove = performance.now();
      setSitting(false);
      setMood((m) => (m === 'sleep' ? 'idle' : m));
      clearTimeout(sitTimer);
      clearTimeout(sleepTimer);
      sitTimer = setTimeout(perch, SIT_MS);
      sleepTimer = setTimeout(() => {
        if (performance.now() - lastMove >= SLEEP_MS - 50) setMood('sleep');
      }, SLEEP_MS);
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onLeave = (e: MouseEvent) => {
      if (!e.relatedTarget) setHidden(true);
    };
    // The page scrolled under a perched moei: find its seat again once it settles.
    const onScroll = () => {
      if (!perched) return;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(perch, 140);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    document.documentElement.addEventListener('mouseleave', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(sitTimer);
      clearTimeout(sleepTimer);
      clearTimeout(scrollTimer);
      clearInterval(recheck);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('scroll', onScroll, { capture: true });
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
  }, [active]);

  // Snacks: something new saved to a collection.
  useEffect(() => {
    if (!active) return;
    let count = itemCount();
    let happyTimer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = libraryStore.subscribe(() => {
      const next = itemCount();
      if (next > count) {
        moeiStore.update({ fed: moeiStore.getSnapshot().fed + 1 });
        setMood('happy');
        setSnack((n) => n + 1);
        clearTimeout(happyTimer);
        happyTimer = setTimeout(() => setMood('idle'), HAPPY_MS);
      }
      count = next;
    });
    return () => {
      unsubscribe();
      clearTimeout(happyTimer);
    };
  }, [active]);

  if (!active) return null;

  return createPortal(
    <div
      ref={elRef}
      className={`ins-moei ${walking ? 'is-walking' : ''} ${sitting && !walking ? 'is-sitting' : ''} ${mood === 'sleep' ? 'is-asleep' : ''} ${mood === 'happy' ? 'is-happy' : ''} ${hidden ? 'is-hidden' : ''}`}
      aria-hidden
    >
      <div className="ins-moei-figure" style={{ transform: `scaleX(${facing})` }}>
        {/* Re-keyed on each snack so the hop plays again. */}
        <div key={snack} className={`ins-moei-hop ${snack ? 'is-snack' : ''}`}>
          <MoeiSprite kind={moei.kind} color={moeiHex(moei.color)} accessory={moei.accessory} face={moei.face} mood={mood} size={44} />
        </div>
      </div>
      {snack > 0 && mood === 'happy' && (
        <span key={`heart-${snack}`} className="ins-moei-heart">
          ♥
        </span>
      )}
      {mood === 'sleep' && <span className="ins-moei-zzz">z z</span>}
      {moei.showName && <span className="ins-moei-name">{moei.name}</span>}
    </div>,
    document.body,
  );
}

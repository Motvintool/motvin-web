'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { moeiHex, moeiStore, openMoeiStudio, type MoeiSpeed } from '@/lib/inspirations/moei';
import { libraryStore } from '@/lib/inspirations/store';
import { playMoeiSound } from '@/lib/inspirations/moeiSound';
import { useMediaQuery } from '../useSheet';
import { SWIPE_QUERY } from '../useSiblingCycle';
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
/** Out on its own, the longest a snack waits for it to walk over to where you saved. */
const SNACK_WAIT_MAX_MS = 2500;

const noSubscribe = () => () => {};
/** On a phone (SWIPE_QUERY) there's no cursor to follow: it sits on the page and answers taps and scrolling instead. */
const TOUCH_QUERY = SWIPE_QUERY;
/** A finger resting on the moei this long opens its studio. */
const STUDIO_PRESS_MS = 500;
/** On a phone: the page has settled this long after a scroll before it looks for a new seat. */
const SETTLE_MS = 180;
/** On a phone: clear of the dock buttons and save bar along the screen's foot. */
const FOOT_CLEAR = 120;
/** Open over the page (a sheet, a modal, a menu): the moei moves onto it until it's gone. */
const LAYERS = '.ins-portal, .ins-sheet-overlay, .ins-search-overlay, .ins-guide, .ins-popover, .ins-uielements-menu, .ins-context-menu, [role="menu"], [role="listbox"]';
/** Let a sheet finish sliding up before it looks for a seat on it. */
const LAYER_SETTLE_MS = 360;
/**
 * What it does when it's clicked or tapped: one of these at random (never the
 * same twice running), each with how long it lasts. Woken by a click it
 * startles; clicked five times in a couple of seconds, it gets dizzy.
 */
const TRICKS = ['hop', 'spin', 'wiggle', 'hearts', 'boop', 'hello'] as const;
type Trick = (typeof TRICKS)[number] | 'startle' | 'dizzy';
const TRICK_MS: Record<Trick, number> = {
  hop: 1100,
  spin: 1300,
  wiggle: 1400,
  hearts: 1400,
  boop: 1300,
  hello: 1700,
  startle: 1200,
  dizzy: 1800,
};
/** What it says to each (the name tag steps aside meanwhile). */
const TRICK_SAYS: Partial<Record<Trick, (name: string) => string>> = {
  spin: () => 'wheee!',
  wiggle: () => 'hehe',
  boop: () => 'boop!',
  hello: (name) => `hi, I'm ${name}!`,
  startle: () => '!',
  dizzy: () => '@_@',
};
/** This many clicks within DIZZY_WINDOW_MS: dizzy. */
const DIZZY_CLICKS = 5;
const DIZZY_WINDOW_MS = 2000;
/** Hearts in a burst, sparkles round a spin: their drift (px) and start delay (ms). */
const BURST = [
  { dx: -14, dy: -22, d: 0 },
  { dx: 2, dy: -30, d: 90 },
  { dx: 16, dy: -20, d: 180 },
];

/** Auto on a computer: now and then, between these, it gets up and goes to sit somewhere else on screen. */
const WANDER_MIN_MS = 9000;
const WANDER_MAX_MS = 16000;

/**
 * The open sheet, modal or menu on top, if any (the last open one in the
 * page) — the whole of it: a list or menu inside an open sheet or the search
 * page is part of that, not a layer of its own (sitting on the list's edge
 * put the moei over the search field above it).
 */
function openLayer(): Element | null {
  const open = [...document.querySelectorAll(LAYERS)].filter(
    (el) => !el.closest('.ins-moei') && el.getBoundingClientRect().height > 20 && el.checkVisibility({ opacityProperty: true, visibilityProperty: true }),
  );
  const outermost = open.filter((el) => !open.some((other) => other !== el && other.contains(el)));
  return outermost.at(-1) ?? null;
}

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

/** How high and low on the window a seat's top edge may be (a phone keeps it between the header and the foot). */
type Bounds = { minTop: number; maxTop: number };

/** A sensible seat: the right size, and room above it in the window for the moei. */
function seatable(r: DOMRect, bounds?: Bounds): boolean {
  // Tall is fine (a phone screenshot card runs ~800px); page-wide isn't.
  if (r.width < 40 || r.height < 18 || r.width > 960 || r.height > 1100) return false;
  const minTop = Math.max(FEET + 8, bounds?.minTop ?? 0);
  const maxTop = Math.min(window.innerHeight - 8, bounds?.maxTop ?? Infinity);
  return r.top >= minTop && r.top <= maxTop && r.right > 0 && r.left < window.innerWidth;
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
function covers(left: number, top: number, seat: Element, allowPictures = false, within?: Element | null): boolean {
  for (const fy of [0.15, 0.5, 0.82]) {
    for (const fx of [0.2, 0.5, 0.8]) {
      const px = left + MOEI_SIZE * fx;
      const py = top + MOEI_SIZE * fy;
      if (px < 0 || py < 0 || px > window.innerWidth || py > window.innerHeight) return true;
      const el = document.elementsFromPoint(px, py).find((e) => e !== document.body && e !== document.documentElement && !e.closest('.ins-moei'));
      if (!el) continue;
      // On an open sheet or menu, only what's on it matters: it's drawn over the page behind.
      if (within && !within.contains(el)) continue;
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
  // Its name, shown above it while it sits (a pill ~24px over its head): not over words either.
  if (moeiStore.getSnapshot().showName) {
    for (const dy of [-20, -8]) {
      for (const dx of [-16, 0, 16]) {
        const px = left + MOEI_SIZE / 2 + dx;
        const py = top + dy;
        if (px < 0 || py < 0 || px > window.innerWidth) continue;
        const el = document.elementsFromPoint(px, py).find((e) => e !== document.body && e !== document.documentElement && !e.closest('.ins-moei'));
        if (el && (!within || within.contains(el)) && hasOwnText(el)) return true;
      }
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
  // (Not the moei itself: on a phone it can be pressed, so it's in the way of the look.)
  const top = document.elementsFromPoint(x, y).find((e) => !e.closest('.ins-moei'));
  return top !== undefined && el.contains(top);
}

/** How choosy it was about a seat: fully clear, clear of words, or anywhere. */
type Strictness = 'clear' | 'pictures' | 'any';
type Seat = { left: number; top: number; el: Element; strictness: Strictness };

/**
 * Everything worth sitting on in the window, nearest the cursor first —
 * every one on screen, so a sparse page (a lone button, a row of icons)
 * still has its seats. Only runs when the cursor comes to rest.
 */
function seatCandidates(x: number, y: number, bounds?: Bounds, within?: Element | null): Element[] {
  const found: [Element, number][] = [];
  // With a sheet or menu open, only what's on it — and the menu itself, whatever it's called.
  const all = within ? [within, ...within.querySelectorAll(PERCH_SELECTOR)] : document.querySelectorAll(PERCH_SELECTOR);
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (!seatable(r, bounds) || !(perchable(el) || el === within) || el.closest('.ins-moei') || !boxy(el)) continue;
    // On a phone, not the floating assistant buttons: they don't scroll with the page it sits on.
    if (bounds && el.closest('.ins-dock-pill')) continue;
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
function findSeat(x: number, y: number, bounds?: Bounds, within?: Element | null): Seat | null {
  const candidates = seatCandidates(x, y, bounds, within).slice(0, 40);
  // On a phone (the only caller with bounds) never over words or controls,
  // on the page or an open sheet or menu: with no clear seat it waits out
  // of sight until a scroll, a tap or the layer closing gives it another.
  // Following a cursor, it sits by it as best it can.
  const choices: readonly Strictness[] = bounds ? ['clear', 'pictures'] : ['clear', 'pictures', 'any'];
  for (const strictness of choices) {
    for (const el of candidates) {
      const r = el.getBoundingClientRect();
      const top = r.top - FEET;
      for (const left of seatsAlong(el, r, x)) {
        // Both feet on it, really visible there.
        if (!exposedAt(el, left + 14, r.top + 3) || !exposedAt(el, left + MOEI_SIZE - 14, r.top + 3)) continue;
        if (strictness === 'any' || !covers(left, top, el, strictness === 'pictures', within)) return { left, top, el, strictness };
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
 * Following the cursor it never takes a click (pointer-events: none); out on
 * its own (a phone, or Auto) a click or tap on it gets a trick — a hop, a
 * spin, a giggle, a burst of hearts, a boop, a hello — and holding it opens
 * its studio. It only animates while moving.
 *
 * On a phone (no cursor) it lives on the page instead: it sits on a card
 * near the middle of the screen, rides along with it as the page scrolls
 * and, once the page settles, hops onto another if its own has gone. A tap
 * on the page brings it over to sit by the tap. Tapped itself, it hops with
 * a heart; held, it opens its studio. It sleeps when the screen's left
 * alone. A sheet, modal or menu opening over the page, it hops onto that
 * (its top edge, over the dimmed page) and back down to the page once it's
 * closed.
 */
export function MoeiCompanion() {
  const moei = useSyncExternalStore(moeiStore.subscribe, moeiStore.getSnapshot, moeiStore.getServerSnapshot);
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  const touch = useMediaQuery(TOUCH_QUERY);
  const elRef = useRef<HTMLDivElement>(null);
  const [mood, setMood] = useState<MoeiMood>('idle');
  const [walking, setWalking] = useState(false);
  const [sitting, setSitting] = useState(false);
  const [facing, setFacing] = useState<1 | -1>(1);
  const [hidden, setHidden] = useState(true);
  // On a phone: sitting on an open sheet or menu, so drawn over it.
  const [onLayer, setOnLayer] = useState(false);
  const [snack, setSnack] = useState(0);
  // The trick it's doing for a click or tap, re-keyed each time so it plays again.
  const [trick, setTrick] = useState<{ id: number; kind: Trick } | null>(null);
  const lastTrick = useRef<Trick | null>(null);
  // Out on its own: whether it's still (not walking, no click's walk about to
  // start), so a snack waits until it has arrived where you saved.
  const settled = useRef<() => boolean>(() => true);
  const clicks = useRef<number[]>([]);
  const press = useRef<{ timer: ReturnType<typeof setTimeout> | undefined; held: boolean; wasAsleep: boolean }>({
    timer: undefined,
    held: false,
    wasAsleep: false,
  });
  const happyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const active = moei.out && mounted;
  // Getting about on its own (a phone, or Auto chosen in the studio) rather than following the cursor.
  const auto = touch || moei.mode === 'auto';

  // Following the cursor.
  useEffect(() => {
    if (!active || auto) return;
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
  }, [active, auto]);

  // On its own (a phone, or Auto): sitting on the page, moved by scrolling and
  // taps or clicks — and, on a computer, wandering to another seat now and then.
  useEffect(() => {
    if (!active || !auto) return;
    const pos = { x: -100, y: -100 };
    let placed = false;
    let seat: Seat | null = null;
    // Where along its seat it sits, so it rides along as the page scrolls.
    let seatOffset = 0;
    let walk: { fromX: number; fromY: number; toX: number; toY: number; start: number; dur: number; arc: number } | null = null;
    let raf = 0;
    let scrollRaf = 0;
    // The sheet, modal or menu open over the page, which it sits on instead.
    let layer: Element | null = null;
    let layerTimer: ReturnType<typeof setTimeout> | undefined;
    let down: { x: number; y: number; t: number } | null = null;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    let tapTimer: ReturnType<typeof setTimeout> | undefined;
    let sleepTimer: ReturnType<typeof setTimeout> | undefined;
    let wanderTimer: ReturnType<typeof setTimeout> | undefined;
    let asleep = false;
    // A click's walk over to it, queued but not yet started.
    let tapPending = false;
    settled.current = () => !walk && !tapPending;

    const draw = () => {
      const el = elRef.current;
      if (el) el.style.transform = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0)`;
    };
    // Below the header (and a bar docked into it, which can hang lower), clear of the screen's foot.
    // On a sheet or menu: anywhere it fits on screen (the dim covers the header and the dock).
    const bounds = (): Bounds => {
      if (layer) return { minTop: FEET + 8, maxTop: window.innerHeight - 40 };
      let below = 0;
      for (const el of document.querySelectorAll('.ins-header, .is-docked')) below = Math.max(below, el.getBoundingClientRect().bottom);
      return { minTop: below + FEET + 4, maxTop: window.innerHeight - FOOT_CLEAR };
    };
    // Where it looks for a seat when nothing's been tapped: a little above
    // the middle of the page, or the top edge of an open sheet or menu.
    const home = () => {
      if (!layer) return { x: window.innerWidth / 2, y: window.innerHeight * 0.45 };
      const box = (layer.querySelector('.ins-sheet') ?? layer).getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top };
    };
    const faceMiddle = () => setFacing(pos.x + MOEI_SIZE / 2 <= window.innerWidth / 2 ? 1 : -1);

    const seatGone = () => {
      if (!seat || !seat.el.isConnected) return true;
      const r = seat.el.getBoundingClientRect();
      if (Math.abs(r.top - FEET - pos.y) >= 1.5 || !seatable(r, bounds())) return true;
      if (!exposedAt(seat.el, pos.x + MOEI_SIZE / 2, r.top + 3)) return true;
      // Something loaded in under it since it sat (a page still filling in): find a clear seat again.
      return seat.strictness !== 'any' && covers(pos.x, pos.y, seat.el, seat.strictness === 'pictures', layer);
    };

    const tick = (now: number) => {
      if (!walk) return;
      const t = Math.min(1, (now - walk.start) / walk.dur);
      const e = easeInOut(t);
      pos.x = walk.fromX + (walk.toX - walk.fromX) * e;
      pos.y = walk.fromY + (walk.toY - walk.fromY) * e - walk.arc * Math.sin(Math.PI * t);
      draw();
      if (t < 1) {
        raf = requestAnimationFrame(tick);
        return;
      }
      walk = null;
      raf = 0;
      setWalking(false);
      faceMiddle();
    };

    // Hops onto the seat nearest (x, y); with nowhere to sit it waits, hidden.
    const perchNear = (x: number, y: number) => {
      const next = findSeat(x, y, bounds(), layer);
      if (!next) {
        seat = null;
        // Next time it's back, it's there at once.
        placed = false;
        setHidden(true);
        return;
      }
      seat = next;
      seatOffset = next.left - next.el.getBoundingClientRect().left;
      setHidden(false);
      setSitting(true);
      if (!placed) {
        // First sight: already sitting there, not walking in from a corner.
        placed = true;
        pos.x = next.left;
        pos.y = next.top;
        draw();
        faceMiddle();
        return;
      }
      const dist = Math.hypot(next.left - pos.x, next.top - pos.y);
      if (dist < 2) return;
      const calm = reducedMotion();
      walk = {
        fromX: pos.x,
        fromY: pos.y,
        toX: next.left,
        toY: next.top,
        start: performance.now(),
        dur: calm ? 200 : Math.min(WALK_MAX_MS, Math.max(WALK_MIN_MS, (dist / pace().walk) * 1000)),
        arc: calm ? 0 : Math.min(36, 8 + dist * 0.12),
      };
      if (Math.abs(next.left - pos.x) > 2) setFacing(next.left > pos.x ? 1 : -1);
      setWalking(true);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };

    // Anything the visitor does wakes it, and puts sleep off again.
    const stir = () => {
      asleep = false;
      setMood((m) => (m === 'sleep' ? 'idle' : m));
      clearTimeout(sleepTimer);
      sleepTimer = setTimeout(() => {
        asleep = true;
        setMood('sleep');
      }, SLEEP_MS);
    };

    // Auto on a computer: every so often, awake and sitting still on the
    // page, it gets up and goes to sit somewhere else in view.
    const wander = () => {
      clearTimeout(wanderTimer);
      if (touch) return;
      wanderTimer = setTimeout(() => {
        if (!asleep && !walk && !layer && seat && !document.hidden) {
          const b = bounds();
          const x = 80 + Math.random() * Math.max(0, window.innerWidth - 160);
          const y = b.minTop + Math.random() * Math.max(0, b.maxTop - b.minTop);
          perchNear(x, y);
        }
        wander();
      }, WANDER_MIN_MS + Math.random() * (WANDER_MAX_MS - WANDER_MIN_MS));
    };

    // The page scrolling: it rides along on its seat, out of sight once that
    // goes under the header or into the foot, and settles somewhere new after.
    const onScroll = () => {
      stir();
      if (!scrollRaf) {
        scrollRaf = requestAnimationFrame(() => {
          scrollRaf = 0;
          if (!seat || walk) return;
          const r = seat.el.getBoundingClientRect();
          pos.x = r.left + seatOffset;
          pos.y = r.top - FEET;
          draw();
          const b = bounds();
          if (r.top < b.minTop || r.top > b.maxTop) setHidden(true);
        });
      }
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        if (seatGone()) {
          // Gone from view: back in at a seat near the middle, no walk across the screen.
          placed = false;
          walk = null;
          const h = home();
          perchNear(h.x, h.y);
        }
      }, SETTLE_MS);
    };

    // A tap on the page (not a drag, not a long press): it comes to sit by it,
    // once whatever the tap opened has had a moment to open.
    const onDown = (e: PointerEvent) => {
      stir();
      down = (e.target as Element).closest?.('.ins-moei') ? null : { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const onUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10 || performance.now() - d.t > 450) return;
      clearTimeout(tapTimer);
      tapPending = true;
      tapTimer = setTimeout(() => {
        tapPending = false;
        perchNear(e.clientX, e.clientY);
      }, 260);
    };

    // A sheet, modal or menu opening over the page: drawn over it, it hops
    // onto it once it's slid up; closed, back down onto the page. The same
    // look also notices a seat gone with whatever held it.
    const watch = setInterval(() => {
      const now = openLayer();
      if (now !== layer) {
        layer = now;
        setOnLayer(layer !== null);
        clearTimeout(layerTimer);
        layerTimer = setTimeout(() => {
          const h = home();
          perchNear(h.x, h.y);
        }, layer ? LAYER_SETTLE_MS : 0);
        return;
      }
      // (Only while it sits: with no seat to be had it waits for a scroll, a
      // tap or a layer, rather than searching the screen every few moments.)
      if (seat && !walk && seatGone()) {
        placed = false;
        const h = home();
        perchNear(h.x, h.y);
      }
    }, 400);

    // In once the page has drawn — and again as it fills in, if there was
    // nowhere clear to sit at first.
    const start = setTimeout(() => {
      layer = openLayer();
      setOnLayer(layer !== null);
      const h = home();
      perchNear(h.x, h.y);
      stir();
      wander();
    }, 600);
    const retries = [1500, 3000].map((ms) =>
      setTimeout(() => {
        if (seat) return;
        const h = home();
        perchNear(h.x, h.y);
      }, ms),
    );

    // On a computer, the cursor moving about keeps it awake too (checked every couple of seconds, not every move).
    let lastMoveStir = 0;
    const onPointerMove = () => {
      const now = performance.now();
      if (!asleep && now - lastMoveStir < 2000) return;
      lastMoveStir = now;
      stir();
    };

    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('pointerdown', onDown, { passive: true, capture: true });
    window.addEventListener('pointerup', onUp, { passive: true, capture: true });
    if (!touch) window.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => {
      clearTimeout(wanderTimer);
      window.removeEventListener('pointermove', onPointerMove);
      cancelAnimationFrame(raf);
      cancelAnimationFrame(scrollRaf);
      clearTimeout(settleTimer);
      clearTimeout(tapTimer);
      clearTimeout(sleepTimer);
      clearTimeout(start);
      retries.forEach(clearTimeout);
      clearTimeout(layerTimer);
      clearInterval(watch);
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('pointerdown', onDown, { capture: true });
      window.removeEventListener('pointerup', onUp, { capture: true });
      setHidden(true);
      setSitting(false);
      setWalking(false);
      setOnLayer(false);
      settled.current = () => true;
    };
  }, [active, auto, touch]);

  useEffect(
    () => () => {
      clearTimeout(press.current.timer);
      clearTimeout(happyTimer.current);
    },
    [],
  );

  // Out on its own (a phone, or Auto) the moei itself answers a click or a
  // tap with a trick; held, it opens its studio.
  const onMoeiDown = () => {
    press.current.held = false;
    // Read before the press wakes it (the page's own listener runs first, in the same event).
    press.current.wasAsleep = mood === 'sleep';
    clearTimeout(press.current.timer);
    press.current.timer = setTimeout(() => {
      press.current.held = true;
      navigator.vibrate?.(10);
      openMoeiStudio();
    }, STUDIO_PRESS_MS);
  };
  const onMoeiUp = () => {
    clearTimeout(press.current.timer);
    if (press.current.held) return;
    const now = performance.now();
    clicks.current = [...clicks.current.filter((t) => now - t < DIZZY_WINDOW_MS), now];
    let kind: Trick;
    if (press.current.wasAsleep) kind = 'startle';
    else if (clicks.current.length >= DIZZY_CLICKS) {
      kind = 'dizzy';
      clicks.current = [];
    } else {
      const options = TRICKS.filter((t) => t !== lastTrick.current);
      kind = options[Math.floor(Math.random() * options.length)];
    }
    lastTrick.current = kind;
    if (moei.sound) playMoeiSound(kind);
    setTrick((t) => ({ id: (t?.id ?? 0) + 1, kind }));
    setMood(kind === 'dizzy' || kind === 'startle' ? 'idle' : 'happy');
    clearTimeout(happyTimer.current);
    happyTimer.current = setTimeout(() => {
      setMood('idle');
      setTrick(null);
    }, TRICK_MS[kind]);
  };
  const onMoeiCancel = () => clearTimeout(press.current.timer);

  // Snacks: something new saved to a collection. Following the cursor it's
  // right there; out on its own (Auto, a phone) it first walks over to where
  // you clicked Save, then eats it there — the walk's bob would hide the hop.
  useEffect(() => {
    if (!active) return;
    let count = itemCount();
    let happyTimer: ReturnType<typeof setTimeout> | undefined;
    let waitTimer: ReturnType<typeof setTimeout> | undefined;
    const eat = () => {
      moeiStore.update({ fed: moeiStore.getSnapshot().fed + 1 });
      setMood('happy');
      setSnack((n) => n + 1);
      clearTimeout(happyTimer);
      happyTimer = setTimeout(() => setMood('idle'), HAPPY_MS);
    };
    const eatOnceSettled = (waited: number) => {
      if (settled.current() || waited >= SNACK_WAIT_MAX_MS) eat();
      else waitTimer = setTimeout(() => eatOnceSettled(waited + 100), 100);
    };
    const unsubscribe = libraryStore.subscribe(() => {
      const next = itemCount();
      if (next > count) {
        clearTimeout(waitTimer);
        if (auto) waitTimer = setTimeout(() => eatOnceSettled(0), 60);
        else eat();
      }
      count = next;
    });
    return () => {
      unsubscribe();
      clearTimeout(happyTimer);
      clearTimeout(waitTimer);
    };
  }, [active, auto]);

  if (!active) return null;

  return createPortal(
    <div
      ref={elRef}
      className={`ins-moei ${touch ? 'is-touch' : ''} ${auto && !touch ? 'is-clickable' : ''} ${trick ? 'is-tricking' : ''} ${auto && onLayer ? 'is-on-layer' : ''} ${walking ? 'is-walking' : ''} ${sitting && !walking ? 'is-sitting' : ''} ${mood === 'sleep' ? 'is-asleep' : ''} ${mood === 'happy' ? 'is-happy' : ''} ${hidden ? 'is-hidden' : ''}`}
      aria-hidden
      {...(auto && {
        onPointerDown: onMoeiDown,
        onPointerUp: onMoeiUp,
        onPointerCancel: onMoeiCancel,
        onPointerLeave: onMoeiCancel,
        onContextMenu: (e: ReactMouseEvent) => e.preventDefault(),
      })}
    >
      <div className="ins-moei-figure" style={{ transform: `scaleX(${facing})` }}>
        {/* Re-keyed on each snack and trick so its hop plays again. */}
        <div
          key={`${snack}-${trick?.id ?? 0}`}
          className={`ins-moei-hop ${snack ? 'is-snack' : ''} ${trick ? `is-trick is-${trick.kind}` : ''}`}
        >
          <MoeiSprite kind={moei.kind} color={moeiHex(moei.color)} accessory={moei.accessory} face={moei.face} mood={mood} size={44} />
        </div>
      </div>
      {((snack > 0 && mood === 'happy' && !trick) || trick?.kind === 'hop') && (
        <span key={`heart-${snack}-${trick?.id ?? 0}`} className="ins-moei-heart">
          ♥
        </span>
      )}
      {trick?.kind === 'hearts' &&
        BURST.map((b, i) => (
          <span
            key={`burst-${trick.id}-${i}`}
            className="ins-moei-heart is-burst"
            style={{ '--dx': `${b.dx}px`, '--dy': `${b.dy}px`, animationDelay: `${b.d}ms` } as CSSProperties}
          >
            ♥
          </span>
        ))}
      {trick?.kind === 'spin' &&
        BURST.map((b, i) => (
          <span
            key={`spark-${trick.id}-${i}`}
            className="ins-moei-spark"
            style={{ '--dx': `${b.dx * 1.6}px`, '--dy': `${b.dy}px`, animationDelay: `${180 + b.d}ms` } as CSSProperties}
          >
            ✦
          </span>
        ))}
      {/* Eating a snack (something saved): it says so, in its name tag's own dark pill. */}
      {snack > 0 && mood === 'happy' && !trick && (
        <span key={`yum-${snack}`} className="ins-moei-say is-yum" style={{ animationDuration: `${HAPPY_MS}ms` }}>
          tasty! saved
        </span>
      )}
      {trick && TRICK_SAYS[trick.kind] && (
        <span key={`say-${trick.id}`} className="ins-moei-say" style={{ animationDuration: `${TRICK_MS[trick.kind]}ms` }}>
          {TRICK_SAYS[trick.kind]!(moei.name)}
        </span>
      )}
      {mood === 'sleep' && <span className="ins-moei-zzz">z z</span>}
      {moei.showName && <span className="ins-moei-name">{moei.name}</span>}
    </div>,
    document.body,
  );
}

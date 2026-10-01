/**
 * Turning a recording into screens.
 *
 * A screen recording is a timeline, not a pile of frames. Someone launched the
 * app, waited on a splash, typed a number, dismissed a prompt, tapped a tab,
 * watched it load, scrolled, opened a sheet, went back. The segmenter reads
 * that story off the thumbnails the frame reader produced and answers, for
 * every moment the UI held still: is this a screen worth keeping, and what is
 * it in relation to the screens around it?
 *
 * Everything here is pure arithmetic on small grayscale grids — no model, no
 * OCR, no subprocess — so it is fast, deterministic, and testable on synthetic
 * frames. What it produces is structure: holds, overlays, loading states,
 * scrolled variants, revisits and the edges between them. Naming and typing
 * the screens is the classifier's job, downstream.
 *
 * The decisions, in order:
 *
 *   1. Label every frame-to-frame step: still, soft (settling, a spinner, a
 *      carousel advancing), scroll (a vertical shift explains the change), or
 *      cut (a navigation).
 *   2. Group consecutive still frames into holds, then merge holds that are
 *      only settling into each other — a page whose header draws a beat after
 *      its list is one screen, not three.
 *   3. Keep a hold when it lasted long enough to be looked at. A shorter hold
 *      is kept only when it is a real, distinct frame rather than a blend of
 *      its neighbours — that is how a splash, a toast, or a flash of a loading
 *      screen survives while a slide transition does not.
 *   4. Relate each kept screen to its neighbours: a scrim over the previous
 *      screen with nothing drawn on it is a system prompt iOS did not record
 *      (dropped); a scrim with a card on it is a dialog or sheet; the same
 *      chrome with emptier content is a loading state; a shift of content
 *      under fixed chrome is a scroll; a near-identical earlier screen is a
 *      revisit.
 *
 * Thresholds are grouped at the top and expressed in the units they measure
 * — mean absolute difference on 0–255 grayscale, fractions of the frame,
 * seconds — so they can be read against a trace and tuned honestly.
 */

import {
  bestVerticalShift,
  changedBox,
  changedFraction,
  dominantColors,
  edgeEnergy,
  fingerprintFromThumb,
  flatShare,
  hamming,
  meanAbsDiff,
  THUMB,
} from './hash.js';

/** A step with less change than this is the UI holding still. */
const STILL_MAD = 3.5;
const STILL_CHANGED = 0.03;

/** Up to this much change is something settling rather than a navigation. */
const SOFT_MAD = 12;

/** A hold's last frame is a candidate to represent it only if it arrived this quietly. */
const SETTLED_MAD = 8;
const SETTLED_CHANGED = 0.1;

/** Two adjacent holds this close are one screen that was still drawing… */
const MERGE_MAD = 14;
const MERGE_CHANGED = 0.15;
/** …unless the first had already been still this long and this much of it then changed: a new state of the page. */
const SETTLED_SECONDS = 1.5;
const STATE_CHANGED = 0.08;

/** A vertical shift that removes this share of the difference is a scroll. */
const SCROLL_RESIDUAL_RATIO = 0.45;
const SCROLL_RESIDUAL_MAX = 10;

/** How long a screen has to hold to be believed without further evidence. */
const DEFAULT_MIN_HOLD_SECONDS = 0.5;

/**
 * A hold of a single frame is never a screen. At the rates recordings are
 * read (2–10 a second) one frame is at most half a second, and a push, a
 * fade or a sheet sliding up takes about a third of a second — so a lone
 * frame between two settled screens is, in practice, always a picture of
 * the transition: half of one screen and half of the next. A screen someone
 * actually looked at holds still for a good part of a tenth of a second, so
 * at a faster read it leaves several identical frames where a transition
 * leaves several different ones — which is what lets a screen swiped past
 * in a third of a second be kept when the recording is read at ten or
 * fifteen frames a second. The first hold — the launch state — is the one
 * exception, since a recording can start on it.
 */
const MIN_BRIEF_SECONDS = 0.15;
/** …as frames at the rate the recording was read, never fewer than two. */
const briefFramesAt = (fps) => Math.max(2, Math.ceil(MIN_BRIEF_SECONDS * fps));

/**
 * A lone frame right after a settled screen, with the same header and
 * footer and more drawn on it, is that screen finishing its drawing — the
 * images landing on a feed a beat before the tap — and becomes its
 * picture instead of being thrown away.
 */
const ABSORB_MAD = 24;
const ABSORB_EDGE_GAIN = 1.05;

/**
 * A skeleton page: light grey placeholder blocks on a lighter background,
 * nothing dark drawn (no text, no button), almost no structure. Read from
 * the frame alone, so it is caught even when the page it was loading into
 * never appears in the recording.
 */
const SKELETON_LIGHT_SHARE = 0.9;
const SKELETON_DARK_SHARE = 0.02;
const SKELETON_MAX_EDGE = 6;
/** A skeleton is gone in a moment; a pale page someone read for longer is a page. */
const SKELETON_MAX_SECONDS = 2;

/** A brief hold is the next screen still moving when its header matches and this little of the frame differs. */
const STILL_MOVING_HEADER_MAD = 2;
const STILL_MOVING_CHANGED = 0.35;

/** A brief hold must differ from both neighbours by at least this much. */
const BRIEF_DISTINCT_MAD = 12;
/** …and must not be a blend of them: the two half-distances exceed the whole. */
const BRIEF_INTERPOLATION_RATIO = 1.25;

/** Below this gradient energy a frame is flat — a colour, not a screen. */
const FLAT_EDGE = 1.0;
/** Below this a frame is nearly empty — a spinner on a blank, a skeleton. */
const SPARSE_EDGE = 3.0;

/** Scrim detection: how much of the screen got uniformly darker. */
const SCRIM_FRACTION = 0.85;
const OVERLAY_DIM_FRACTION = 0.3;
const DIM_MIN_DROP = 14;
const DIM_MAX_DROP = 220;
/** Gradient correlation between the screen and its dimmed self; a scrim keeps the picture. */
const SCRIM_STRUCTURE = 0.8;
const OVERLAY_STRUCTURE = 0.5;

/** Overlay geometry, as fractions of the screen. */
const TOAST_MAX_HEIGHT = 0.14;
const SHEET_MAX_HEIGHT = 0.8;
/** An undimmed bottom sheet's box must reach at least this close to the bottom edge. */
const SHEET_BOTTOM_MARGIN = 0.82;
const OVERLAY_UNCHANGED_FRACTION = 0.6;

/** Loading state: same chrome, content this much emptier, gone this quickly. */
const LOADING_EDGE_RATIO = 1.5;
const LOADING_MAX_SECONDS = 4;
const LOADING_CONTENT_MAD = 15;
/** A loading screen is sparse in absolute terms too; a dense page is never one. */
const LOADING_MAX_EDGE = 10;
/** Below this structure a frame is a loading state on its own evidence… */
const LOADING_SURE_EDGE = 6;
/** …above it, only when this much of it is flat, on a pale or a dark ground. */
const LOADING_FLAT_SHARE = 0.45;
/** This flat, a frame needs no shared chrome to be loading into what follows… */
const LOADING_BARE_FLAT = 0.55;
/** …as long as it was gone this quickly; a sparse panel someone read is a design. */
const LOADING_BARE_MAX_SECONDS = 1.5;
const CHROME_MAD = 8;
/** Loading allows a little more chrome movement: a tab indicator sliding over. */
const LOADING_CHROME_MAD = 14;

/** Revisit: the same screen seen again. */
const REVISIT_MAD = 6;
const REVISIT_BITS = 8;
const REVISIT_LOOSE_MAD = 10;
const REVISIT_LOOSE_SAME = 0.8;
const REVISIT_LOOSE_BITS = 16;
/** Of the ink in either frame, the share that has to agree for a revisit… */
const REVISIT_INK_SAME = 0.7;
/** …and, unless this much agrees, how little of the whole frame may have changed (at a 10-level tolerance). */
const REVISIT_INK_SURE = 0.85;
const REVISIT_MAX_CHANGED = 0.15;

/** Bands of the screen, as fractions of its height. */
const HEADER_BAND = 0.12;
const FOOTER_BAND = 0.12;

/**
 * @typedef {object} Screen
 * @property {string} id            c001, c002, … in timeline order
 * @property {number} frame         index of the representative frame
 * @property {number} start         seconds into the recording the hold began
 * @property {number} end           seconds the hold ended
 * @property {number} holdSeconds
 * @property {boolean} brief        kept on distinctiveness, not on duration
 * @property {'screen'|'overlay'|'loading'|'scrolled'} kind
 * @property {{kind: 'dialog'|'bottom_sheet'|'toast', dimmed: boolean, box: object}|null} overlay
 * @property {string|null} overlayOf   id of the screen underneath
 * @property {string|null} loadingOf   id of the screen this was loading into
 * @property {'chrome'|'skeleton'|'bare'|'chain'|undefined} loadingEvidence  why it was taken for a loading state; 'bare' and 'chain' are the weaker grounds
 * @property {string|null} scrolledFrom id of the screen this is a scrolled view of
 * @property {string|null} revisitOf   id of the earlier screen this repeats
 * @property {string|undefined} variantOf  id of the screen right before, when this is the same page in a new state
 * @property {number} visits
 * @property {boolean} flat
 * @property {{dhash: string, ahash: string, luminance: number, edge: number}} print
 * @property {{hex: string, share: number, role: string}[]} colors
 */

/**
 * @param {Buffer[]} thumbs raw RGB thumbnails, one per frame, in order
 * @param {{fps: number, width?: number, height?: number, minHoldSeconds?: number, keepBrief?: boolean, trace?: boolean}} options
 */
export function segmentRecording(thumbs, options) {
  const fps = options.fps;
  const width = options.width ?? THUMB.width;
  const height = options.height ?? THUMB.height;
  const minHold = options.minHoldSeconds ?? DEFAULT_MIN_HOLD_SECONDS;
  const keepBrief = options.keepBrief !== false;
  const briefFrames = briefFramesAt(fps);
  if (!fps || fps <= 0) throw new Error('segmentRecording needs the frame rate the thumbnails were sampled at');

  const n = thumbs.length;
  const dropped = { transitions: 0, blank: 0, scrims: 0, revisits: 0, merged: 0 };
  if (n === 0) return { fps, frames: 0, screens: [], edges: [], dropped, steps: [] };

  const prints = thumbs.map((thumb) => fingerprintFromThumb(thumb, width, height));
  const seconds = (frame) => Math.round((frame / fps) * 100) / 100;

  // ─── 1. Steps ────────────────────────────────────────────────────────────
  /** steps[i] describes the change from frame i-1 to frame i; steps[0] is null. */
  const steps = [null];
  for (let i = 1; i < n; i++) {
    const a = prints[i - 1].gray;
    const b = prints[i].gray;
    const mad = meanAbsDiff(a, b, width, height);
    const changed = changedFraction(a, b);
    let label = 'cut';
    let shift = 0;
    if (mad <= STILL_MAD && changed <= STILL_CHANGED) {
      label = 'still';
    } else {
      // A scroll moves the content under chrome that stays put. A screen
      // sliding in from the bottom also shifts vertically, but takes its
      // header and tab bar with it, and is a navigation.
      const moved = bestVerticalShift(a, b, width, height);
      if (
        moved.shift !== 0 &&
        moved.mad <= SCROLL_RESIDUAL_RATIO * moved.madAtZero &&
        moved.mad <= SCROLL_RESIDUAL_MAX &&
        chromeStable(a, b, width, height)
      ) {
        label = 'scroll';
        shift = moved.shift;
      } else if (mad <= SOFT_MAD) {
        label = 'soft';
      }
    }
    steps.push({ mad, changed, label, shift });
  }

  // ─── 2. Holds ────────────────────────────────────────────────────────────
  let holds = [];
  let start = 0;
  for (let i = 1; i < n; i++) {
    if (steps[i].label !== 'still') {
      holds.push({ start, end: i - 1 });
      start = i;
    }
  }
  holds.push({ start, end: n - 1 });

  const merges = [];
  // Merge holds that were only settling into each other. A step that is a
  // compact change near an edge of the screen is left alone: that is how a
  // toast or a banner looks, and merging it would lose it.
  let mergedSomething = true;
  while (mergedSomething) {
    mergedSomething = false;
    const next = [];
    for (const hold of holds) {
      const previous = next[next.length - 1];
      if (previous) {
        const step = steps[hold.start];
        const a = prints[previous.end].gray;
        const b = prints[hold.start].gray;
        const box = changedBox(a, b, width, height);
        // A compact change floating near the top or bottom is a toast or a
        // banner and must stay its own hold. A change confined to the header
        // or footer band is the chrome drawing in — a tab bar appearing a beat
        // after the list — and is part of the same screen.
        const inChrome = box && (box.y >= 0.86 || box.y + box.h <= 0.13);
        const compact =
          box && !inChrome && box.h <= TOAST_MAX_HEIGHT * 1.5 && (box.y < 0.25 || box.y + box.h > 0.75);
        // A page settles in its first second or so. A change of any size
        // after it has been still longer than that is something the person
        // did — a section opened, a tab within the page, an option chosen —
        // and the screen in its new state is its own screen. Small changes
        // (a toggle, a radio, typed text) still fold in; so does chrome.
        const previousSeconds = (previous.end - previous.start + 1) / fps;
        const stateChange = previousSeconds >= SETTLED_SECONDS && step.changed >= STATE_CHANGED && !inChrome;
        if (
          step.label !== 'scroll' &&
          step.mad <= MERGE_MAD &&
          step.changed <= MERGE_CHANGED &&
          !compact &&
          !stateChange &&
          scrim(a, b, width).fraction < OVERLAY_DIM_FRACTION
        ) {
          if (options.trace) merges.push({ at: hold.start, previousFrames: previous.end - previous.start + 1, frames: hold.end - hold.start + 1, mad: Math.round(step.mad * 10) / 10, changed: Math.round(step.changed * 100) / 100, box: box ? { y: Math.round(box.y * 100) / 100, h: Math.round(box.h * 100) / 100, w: Math.round(box.w * 100) / 100 } : null });
          previous.end = hold.end;
          dropped.merged++;
          mergedSomething = true;
          continue;
        }
      }
      next.push({ ...hold });
    }
    holds = next;
  }

  for (const hold of holds) {
    hold.frames = hold.end - hold.start + 1;
    hold.seconds = hold.frames / fps;
    hold.rep = representative(hold, steps, prints, fps);
    hold.print = prints[hold.rep];
  }

  // ─── 3. Which holds are screens ──────────────────────────────────────────
  const isBlank = (print) =>
    print.edge < FLAT_EDGE && (print.luminance > 245 || print.luminance < 10);

  for (let h = 0; h < holds.length; h++) {
    const hold = holds[h];
    const print = hold.print;
    hold.flat = print.edge < FLAT_EDGE;

    if (isBlank(print)) {
      hold.keep = false;
      hold.why = 'blank';
      dropped.blank++;
      continue;
    }
    if (h === 0) {
      // The first thing on screen is the launch state, and a launch state is
      // brief by nature. Kept unless it is nothing at all.
      hold.first = true;
      hold.keep = true;
      hold.brief = hold.seconds < minHold;
      continue;
    }
    if (hold.seconds >= minHold) {
      hold.keep = true;
      hold.brief = false;
      continue;
    }

    // A short hold: real screen, or a frame caught mid-transition?
    if (!keepBrief) {
      hold.keep = false;
      hold.why = 'transition';
      dropped.transitions++;
      continue;
    }
    if (hold.frames < briefFrames) {
      // One frame. Either the screen before it, drawn more fully — then it
      // is the better picture of that screen; or something drawn over that
      // screen, which it leaves standing — a toast, a card on a scrim — and
      // then it is an overlay however short; or a transition.
      const before = nearestKept(holds, h, -1);
      const following = holds[h + 1] ?? null;
      // …and the screen it was drawn over is what is on screen again right
      // after it. A dialog that is there for one frame and then, fuller, for
      // two seconds is a dialog fading in, and that first frame is not it.
      const overPrevious =
        before &&
        following &&
        following.seconds >= minHold &&
        sameScreen(before.print, following.print, width, height) &&
        relate(before, hold, steps, width, height).overlay &&
        meanAbsDiff(hold.print.gray, following.print.gray, width, height) >= BRIEF_DISTINCT_MAD;
      if (overPrevious) {
        hold.keep = true;
        hold.brief = true;
        continue;
      }
      if (before && !before.brief && absorbs(before, hold, steps, width, height)) {
        before.rep = hold.rep;
        before.print = hold.print;
        before.end = hold.end;
        before.frames = before.end - before.start + 1;
        before.seconds = before.frames / fps;
        hold.keep = false;
        hold.why = 'absorbed';
        dropped.merged++;
        continue;
      }
      hold.keep = false;
      hold.why = 'transition';
      dropped.transitions++;
      continue;
    }
    // A brief hold that is the next screen already on its way — the same
    // header, most of the frame the same, nothing dimmed — is that screen
    // still moving: a video playing in it, a carousel advancing, a pause
    // mid-scroll before it settles. It is folded into that screen rather
    // than kept as a second, third and fourth picture of it. A toast or a
    // card over the screen before it is drawn over that screen, and stays.
    {
      const following = holds[h + 1] ?? null;
      const before = nearestKept(holds, h, -1);
      const overBefore = before && relate(before, hold, steps, width, height).overlay;
      if (
        following &&
        !overBefore &&
        meanAbsDiff(print.gray, following.print.gray, width, height, 0, Math.floor(height * HEADER_BAND)) <= STILL_MOVING_HEADER_MAD &&
        changedFraction(print.gray, following.print.gray) <= STILL_MOVING_CHANGED &&
        scrim(following.print.gray, print.gray, width).fraction < OVERLAY_DIM_FRACTION &&
        scrim(print.gray, following.print.gray, width).fraction < OVERLAY_DIM_FRACTION
      ) {
        following.start = hold.start;
        following.frames = following.end - following.start + 1;
        following.seconds = following.frames / fps;
        hold.keep = false;
        hold.why = 'still moving';
        dropped.merged++;
        continue;
      }
    }
    // A brief hold is only believable when it sits directly between two
    // settled screens. A frame in the middle of a run of changing frames is a
    // transition, however different it looks from what came before and after
    // — a slide carries the old screen out and the new one in, and no single
    // frame of that is a screen anyone saw.
    const previous = holds[h - 1] ?? null;
    const following = holds[h + 1] ?? null;
    // …and a brief hold at the very end of a recording has nothing after it
    // to prove it was a screen rather than the cut where recording stopped.
    // "Settled" here means still for long enough to be a screen itself, not
    // necessarily long enough to be believed on duration alone: a run of
    // onboarding pages swiped through in half a second each is a run of
    // brief screens, each bracketed by motion, and each is kept.
    const settledNeighbours =
      (!previous || previous.frames >= briefFrames || previous.keep) && Boolean(following) && following.frames >= briefFrames;
    const toPrevious = previous ? meanAbsDiff(previous.print.gray, print.gray, width, height) : Infinity;
    const toNext = following ? meanAbsDiff(print.gray, following.print.gray, width, height) : Infinity;
    const across = previous && following ? meanAbsDiff(previous.print.gray, following.print.gray, width, height) : 0;
    const distinct = toPrevious >= BRIEF_DISTINCT_MAD && toNext >= BRIEF_DISTINCT_MAD;
    const interpolated = previous && following && toPrevious + toNext < BRIEF_INTERPOLATION_RATIO * across;
    const substantial = print.edge >= FLAT_EDGE;

    if (settledNeighbours && distinct && !interpolated && substantial) {
      hold.keep = true;
      hold.brief = true;
    } else {
      hold.keep = false;
      hold.why = 'transition';
      dropped.transitions++;
    }
  }

  // ─── 4. Relations between kept screens ───────────────────────────────────
  const kept = holds.filter((hold) => hold.keep);
  const screens = [];
  let sequence = 0;

  for (let k = 0; k < kept.length; k++) {
    const hold = kept[k];
    const previous = screens.length ? screens[screens.length - 1] : null;
    const previousHold = previous ? previous.hold : null;
    const nextHold = kept[k + 1] ?? null;

    // A scrim with nothing on it. iOS leaves system alerts — location, camera,
    // notifications, "wants to use google.com to sign in" — out of a screen
    // recording, so all that is captured is the app dimmed underneath. That
    // is an event worth noting, not a screen worth publishing.
    const base = scrimBase(hold, previousHold, nextHold, width, height);
    if (base) {
      hold.keep = false;
      hold.why = 'scrim';
      dropped.scrims++;
      continue;
    }

    const screen = {
      id: `c${String(++sequence).padStart(3, '0')}`,
      frame: hold.rep,
      start: seconds(hold.start),
      end: seconds(hold.end + 1),
      holdSeconds: Math.round(hold.seconds * 100) / 100,
      brief: Boolean(hold.brief),
      kind: 'screen',
      overlay: null,
      overlayOf: null,
      loadingOf: null,
      scrolledFrom: null,
      revisitOf: null,
      variantOf: undefined,
      visits: 1,
      flat: hold.flat,
      print: {
        dhash: hold.print.dhash,
        ahash: hold.print.ahash,
        luminance: Math.round(hold.print.luminance),
        edge: Math.round(hold.print.edge * 10) / 10,
        flat: Math.round(flatShare(hold.print.gray, width, height) * 100) / 100,
      },
      colors: dominantColors(thumbs[hold.rep], width, height),
      hold,
    };

    if (previous) {
      const relation = relate(previous.hold, hold, steps, width, height);
      if (relation.overlay) {
        screen.kind = 'overlay';
        screen.overlay = relation.overlay;
        screen.overlayOf = canonical(previous);
      } else if (relation.scrolled) {
        screen.kind = 'scrolled';
        screen.scrolledFrom = canonical(previous);
      } else if (relation.previousWasLoading && !previous.revisitOf && !previous.overlayOf) {
        previous.kind = 'loading';
        previous.loadingOf = screen.id;
        previous.loadingEvidence = relation.loadingEvidence;
      } else if (previous.overlayOf) {
        // Dismissing an overlay lands back on the screen beneath it. If that
        // screen was still loading when the overlay came up, what we see now
        // is what it was loading into.
        const beneath = screens.find((s) => s.id === previous.overlayOf);
        if (beneath && beneath.kind === 'screen' && !beneath.revisitOf) {
          const under = relate(beneath.hold, hold, steps, width, height);
          if (under.previousWasLoading) {
            beneath.kind = 'loading';
            beneath.loadingOf = screen.id;
            beneath.loadingEvidence = under.loadingEvidence;
          }
        }
      }
    }

    // Seen before? Compare against every earlier distinct screen, nearest
    // first, so a return to the home tab is recorded as a return rather than
    // as a new screen.
    // …except the screen right before this one when nothing was navigated
    // in between: the same page in a new state — a section opened, a tab
    // within the page — is a screen of its own, not a return to the page.
    let cutBetween = !previous;
    if (previous) {
      for (let frame = previous.hold.end + 1; frame <= hold.start; frame++) if (steps[frame]?.label === 'cut') cutBetween = true;
    }
    for (let e = screens.length - 1; e >= 0; e--) {
      const earlier = screens[e];
      if (earlier.revisitOf) continue;
      if (earlier === previous && !cutBetween && screen.kind === 'screen') {
        if (sameScreen(earlier.hold.print, hold.print, width, height)) screen.variantOf = canonical(earlier);
        continue;
      }
      if (sameScreen(earlier.hold.print, hold.print, width, height)) {
        screen.revisitOf = earlier.id;
        earlier.visits++;
        dropped.revisits++;
        // The first sighting may have been a glimpse; a later, longer look at
        // the same screen is the better picture of it.
        if ((earlier.brief && !screen.brief) || screen.holdSeconds >= 2 * earlier.holdSeconds) {
          earlier.frame = screen.frame;
          earlier.brief = false;
          earlier.holdSeconds = screen.holdSeconds;
          earlier.colors = screen.colors;
        }
        // A screen that was loading into what turned out to be a revisit is
        // loading into the original.
        if (previous && previous.loadingOf === screen.id) previous.loadingOf = earlier.id;
        break;
      }
    }

    // A skeleton is a loading state whatever came before or after it.
    if (!screen.revisitOf && !hold.first && screen.kind === 'screen' && hold.seconds <= SKELETON_MAX_SECONDS && skeletonLike(hold.print, width, height)) {
      screen.kind = 'loading';
      screen.skeleton = true;
      screen.loadingEvidence = 'skeleton';
    }

    screens.push(screen);
  }
  // A skeleton loads into whatever settled next.
  for (let i = 0; i < screens.length; i++) {
    if (!screens[i].skeleton || screens[i].loadingOf) continue;
    const after = screens.slice(i + 1).find((entry) => entry.kind !== 'loading');
    screens[i].loadingOf = after ? canonical(after) : null;
  }

  // ─── Slide-ins that looked like sheets ───────────────────────────────────
  // A screen pushing up from the bottom passes through a state where the old
  // screen's top half is untouched and the bottom half is new — exactly what
  // a bottom sheet looks like. The difference is what happens next: a sheet
  // is dismissed back to its base, or something is tapped on it; a slide-in
  // keeps moving until it fills the screen. If the frames after an undimmed
  // "sheet" only scroll or settle into a screen that is not its base, it was
  // a slide-in, and it goes.
  for (let i = 0; i < screens.length - 1; i++) {
    const screen = screens[i];
    if (screen.kind !== 'overlay' || screen.overlay.dimmed) continue;
    const after = screens[i + 1];
    if (canonical(after) === screen.overlayOf) continue;
    let onlyMoving = true;
    for (let frame = screen.hold.end + 1; frame <= after.hold.start; frame++) {
      const step = steps[frame];
      if (step && step.label === 'cut') onlyMoving = false;
    }
    if (!onlyMoving) continue;
    screen.dropped = 'slide-in';
    dropped.transitions++;
  }
  if (screens.some((screen) => screen.dropped)) {
    const keptScreens = screens.filter((screen) => !screen.dropped);
    // Anything that pointed at a dropped screen now points past it.
    const gone = new Set(screens.filter((screen) => screen.dropped).map((screen) => screen.id));
    for (const screen of keptScreens) {
      if (gone.has(screen.loadingOf)) screen.loadingOf = null;
      if (gone.has(screen.overlayOf)) screen.overlayOf = null;
      if (gone.has(screen.scrolledFrom)) screen.scrolledFrom = null;
      if (screen.loadingOf === null && screen.kind === 'loading' && !screen.skeleton) {
        screen.kind = 'screen';
        delete screen.loadingEvidence;
      }
      if (screen.overlayOf === null && screen.kind === 'overlay') {
        screen.kind = 'screen';
        screen.overlay = null;
      }
    }
    screens.length = 0;
    screens.push(...keptScreens);
  }

  // ─── Overlays seen against what came after ───────────────────────────────
  // A dialog is compared with the screen before it, but the screen underneath
  // may still have been loading when the dialog came up, in which case the
  // scrim test against the earlier frame fails. Dismissing the dialog shows
  // the finished screen, and against that the scrim is clean.
  for (let i = 0; i < screens.length - 1; i++) {
    const screen = screens[i];
    // The launch screen is never an overlay, and neither is a flat colour:
    // an overlay has something drawn on it.
    if (i === 0 || screen.kind !== 'screen' || screen.revisitOf || screen.flat) continue;
    const after = screens[i + 1];
    if (after.overlayOf === screen.id) continue;
    const base = after.hold.print;
    const over = screen.hold.print;
    const dimmed = scrim(base.gray, over.gray, width);
    if (dimmed.fraction < OVERLAY_DIM_FRACTION || dimmed.structure < OVERLAY_STRUCTURE) continue;
    const box = drawnBox(base.gray, over.gray, width, height);
    if (!box || box.h > SHEET_MAX_HEIGHT) continue;
    screen.kind = 'overlay';
    screen.overlay = { kind: overlayKind(box), dimmed: true, box };
    screen.overlayOf = canonical(after);
    // Whatever was flagged as loading into the overlay was loading into the
    // screen beneath it.
    const before = screens[i - 1];
    if (before && before.loadingOf === screen.id) before.loadingOf = canonical(after);
    // And the screen before the overlay, if it shares chrome with the screen
    // after, may have been the same page still loading.
    if (before && before.kind === 'screen' && !before.revisitOf) {
      const under = relate(before.hold, after.hold, steps, width, height);
      if (under.previousWasLoading) {
        before.kind = 'loading';
        before.loadingOf = canonical(after);
        before.loadingEvidence = under.loadingEvidence;
      }
    }
  }

  // ─── Loading states in a row ─────────────────────────────────────────────
  // A page arrives in stages — a blank, then a skeleton, then the content.
  // The skeleton is tied to the content by the relation above; the blank
  // before it, sparse and short and followed by a loading state, was
  // loading into the same page.
  for (let i = screens.length - 2; i >= 0; i--) {
    const screen = screens[i];
    const after = screens[i + 1];
    if (after.kind !== 'loading' || screen.kind !== 'screen' || screen.revisitOf || screen.hold.first) continue;
    const print = screen.hold.print;
    const sparse = print.edge <= LOADING_SURE_EDGE || skeletonLike(print, width, height);
    if (!sparse || screen.hold.seconds > LOADING_MAX_SECONDS) continue;
    if (!chromeStable(print.gray, after.hold.print.gray, width, height, LOADING_CHROME_MAD) && !(flatShare(print.gray, width, height) >= LOADING_BARE_FLAT && screen.hold.seconds <= LOADING_BARE_MAX_SECONDS)) continue;
    screen.kind = 'loading';
    screen.loadingOf = after.loadingOf;
    screen.loadingEvidence = skeletonLike(print, width, height) ? 'skeleton' : 'chain';
  }

  // ─── Edges: the journey, with revisits resolved to the screen they repeat ──
  const edges = [];
  for (let i = 1; i < screens.length; i++) {
    const previous = screens[i - 1];
    const next = screens[i];
    const from = canonical(previous);
    const to = canonical(next);
    if (from === to) continue;
    // The press: the frame right after the hold, before the screen leaves,
    // usually differs in one small region — the control redrawing under the
    // finger. Kept as a box so the label under it can be read downstream.
    let pressBox = null;
    const last = previous.hold.end;
    if (last + 1 < n) {
      const box = changedBox(prints[last].gray, prints[last + 1].gray, width, height, 20);
      if (box && box.w * box.h <= 0.2 && steps[last + 1] && steps[last + 1].label !== 'scroll') pressBox = box;
    }
    edges.push({
      from,
      to,
      atSeconds: next.start,
      pressBox,
      revisit: Boolean(next.revisitOf),
      dismissed: Boolean(previous.overlayOf && canonical(next) === previous.overlayOf),
      scrolled: next.scrolledFrom === from,
    });
  }

  // Every hold and what became of it — for the trace tool, so a screen that
  // went missing can be found in the timeline it was dropped from.
  const trace = options.trace
    ? holds.map((hold) => ({ start: hold.start, end: hold.end, frames: hold.frames, seconds: Math.round(hold.seconds * 100) / 100, rep: hold.rep, keep: Boolean(hold.keep), why: hold.why ?? null, brief: Boolean(hold.brief), edge: Math.round(hold.print.edge * 10) / 10, screen: screens.find((screen) => screen.hold === hold)?.id ?? null }))
    : undefined;
  for (const screen of screens) delete screen.hold;

  return {
    fps,
    frames: n,
    screens,
    edges,
    dropped,
    steps: steps.map((step, index) => (step ? { frame: index, ...step } : null)).filter(Boolean),
    ...(trace ? { holds: trace, merges } : {}),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** The id a screen stands for: itself, or the earlier screen it repeats. */
function canonical(screen) {
  return screen.revisitOf ?? screen.id;
}

/**
 * The frame that best represents a hold: the last state it settled into.
 *
 * A hold often spans a screen still completing itself — a splash whose logo
 * fades in, a page whose header and tab bar arrive a beat after its list, a
 * dialog fading in and, after the tap, fading out again. Inside the hold
 * these are stretches of settled frames (each arriving with little change)
 * separated by frames caught in motion. The frame someone would screenshot
 * is the end of the last settled stretch that lasted: the state the screen
 * reached and stayed in before it left. A stretch of one frame does not
 * count — that is a fade-out or the first frame of the transition — and if
 * the stretch's own tail is losing structure (a slow fade), the frame with
 * the most drawn on it stands in for its end.
 */
function representative(hold, steps, prints, fps) {
  const lastingFrames = briefFramesAt(fps);
  // Settled stretches: consecutive frames that each arrived with little change.
  const stretches = [];
  let start = hold.start;
  for (let frame = hold.start + 1; frame <= hold.end + 1; frame++) {
    const step = frame <= hold.end ? steps[frame] : null;
    const settled = step && step.mad <= SETTLED_MAD && step.changed <= SETTLED_CHANGED;
    if (!settled) {
      stretches.push({ start, end: frame - 1, length: frame - start });
      start = frame;
    }
  }
  const lasting = stretches.filter((stretch) => stretch.length >= lastingFrames);
  // When nothing ever settled for long enough to be believed — a custom
  // cross-fade, a push whose animation ran past the hold, a sheet still
  // sliding up when the person moved on — there is no genuinely resolved
  // moment to fall back on, so the hold's own last stretch is taken: by
  // construction it ends on the hold's final frame, the closest thing to
  // "arrived" that was actually recorded. The previous rule took the
  // longest stretch regardless of where it sat, which on a continuous,
  // never-plateauing change meant the very first sliver of it — the least
  // finished frame available, not the most.
  const chosen = lasting.length ? lasting[lasting.length - 1] : stretches[stretches.length - 1];
  if (!chosen) return hold.start;
  let best = chosen.end;
  let most = prints[best].edge;
  for (let frame = chosen.end - 1; frame >= chosen.start; frame--) {
    if (prints[frame].edge > most) {
      most = prints[frame].edge;
      if (most >= prints[chosen.end].edge * 1.25) best = frame;
    }
  }
  // Content that lands late — the images of a feed arriving one by one just
  // before the tap — makes every frame after the settled stretch a large
  // change, so none of them counts as settled; yet the hold's last frame is
  // then the finished page. It is taken when it has clearly more drawn on it
  // and the chrome has not moved: a dialog fading out lightens the whole
  // frame, bands included, and a scroll shifts it, and neither qualifies.
  const last = hold.end;
  if (last > best && prints[last].edge >= prints[best].edge * 1.25 && steps[last]?.label !== 'scroll') {
    const a = prints[best].gray;
    const b = prints[last].gray;
    const darkened = scrim(a, b, prints[best].width);
    const lightened = scrim(b, a, prints[best].width);
    const scrimmed = (side) => side.fraction >= OVERLAY_DIM_FRACTION && side.structure >= OVERLAY_STRUCTURE;
    if (chromeDiff(a, b, prints[best].width, prints[best].height) <= CHROME_MAD && !scrimmed(darkened) && !scrimmed(lightened)) best = last;
  }
  return best;
}

/**
 * Whether a lone frame is the kept hold before it, drawn more fully: same
 * header and footer, nothing scrolled, more structure, and not far from it.
 */
function absorbs(before, hold, steps, width, height) {
  const a = before.print;
  const b = hold.print;
  if (b.edge < a.edge * ABSORB_EDGE_GAIN) return false;
  if (chromeDiff(a.gray, b.gray, width, height) > CHROME_MAD) return false;
  const mad = meanAbsDiff(a.gray, b.gray, width, height);
  if (mad > ABSORB_MAD) return false;
  const shifted = bestVerticalShift(a.gray, b.gray, width, height);
  if (shifted.shift !== 0 && shifted.mad < 0.6 * shifted.madAtZero) return false;
  return scrim(a.gray, b.gray, width).fraction < OVERLAY_DIM_FRACTION;
}

/**
 * Whether a frame is a light skeleton page: nearly all of it pale, none of
 * it dark, and next to no structure. The status bar rows are left out — the
 * clock is dark on every screen.
 */
function skeletonLike(print, width, height) {
  // The header and footer bands are left out: a skeleton often keeps the
  // real page's title, back arrow and tab bar around its placeholder blocks
  // — and those carry most of the structure such a frame has.
  const fromRow = Math.ceil(height * HEADER_BAND);
  const toRow = height - Math.ceil(height * FOOTER_BAND);
  if (edgeEnergy(print.gray, width, height, fromRow, toRow) >= SKELETON_MAX_EDGE) return false;
  const from = fromRow * width;
  const to = toRow * width;
  let light = 0;
  let dark = 0;
  let dim = 0;
  let bright = 0;
  let count = 0;
  for (let i = from; i < to; i++) {
    const value = print.gray[i];
    count++;
    if (value >= 196) light++;
    else if (value < 110) dark++;
    if (value <= 60) dim++;
    else if (value >= 170) bright++;
  }
  if (!count) return false;
  // Pale blocks on a paler ground with nothing dark drawn — or, in a dark
  // theme, dim blocks on a darker ground with nothing bright drawn.
  return (light / count >= SKELETON_LIGHT_SHARE && dark / count <= SKELETON_DARK_SHARE) || (dim / count >= SKELETON_LIGHT_SHARE && bright / count <= SKELETON_DARK_SHARE);
}

function nearestKept(holds, index, direction) {
  for (let i = index + direction; i >= 0 && i < holds.length; i += direction) {
    if (holds[i].keep) return holds[i];
  }
  return null;
}

/**
 * Whether two prints are the same screen, allowing for a carousel having
 * moved on.
 *
 * Whole-frame measures are not enough on their own. Two sparse pages on a
 * white ground — Settings and Addresses, Profile and Account — agree on
 * nine pixels in ten because nine in ten are the ground, and a difference of
 * a few levels is all the mean shows. So the comparison that decides is made
 * over the ink: the pixels that stand out from the background in either
 * frame. The same screen has the same ink in the same places; a different
 * page with the same ground does not.
 */
function sameScreen(a, b, width, height) {
  const mad = meanAbsDiff(a.gray, b.gray, width, height);
  // Two steps of the same flow — the phone number page and the OTP page
  // that follows it — share a whole hero and differ only in the card below
  // it. Most of their ink agrees, yet a fifth of the frame has moved. The
  // same screen seen again agrees on most of its ink and, unless it agrees
  // on nearly all of it, has hardly a pixel changed elsewhere (a carousel
  // moved on; nothing else did).
  const agree = () => {
    const ink = inkMatch(a.gray, b.gray);
    return ink >= REVISIT_INK_SAME && (ink >= REVISIT_INK_SURE || changedFraction(a.gray, b.gray, 10) <= REVISIT_MAX_CHANGED);
  };
  if (mad <= REVISIT_MAD && hamming(a.dhash, b.dhash) <= REVISIT_BITS && hamming(a.ahash, b.ahash) <= REVISIT_BITS) return agree();
  if (mad <= REVISIT_LOOSE_MAD && 1 - changedFraction(a.gray, b.gray, 10) >= REVISIT_LOOSE_SAME && hamming(a.dhash, b.dhash) <= REVISIT_LOOSE_BITS) return agree();
  return false;
}

/**
 * Of the pixels that are ink in either frame — more than a little away from
 * that frame's background level — the share that agree between the two.
 * 1 when neither frame has any ink to compare.
 */
function inkMatch(a, b, away = 24, agree = 24) {
  const backgroundA = medianOf(a);
  const backgroundB = medianOf(b);
  let ink = 0;
  let same = 0;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - backgroundA) <= away && Math.abs(b[i] - backgroundB) <= away) continue;
    ink++;
    if (Math.abs(a[i] - b[i]) <= agree) same++;
  }
  return ink < a.length * 0.01 ? 1 : same / ink;
}

function medianOf(gray) {
  const counts = new Uint32Array(256);
  for (const value of gray) counts[value]++;
  let seen = 0;
  for (let level = 0; level < 256; level++) {
    seen += counts[level];
    if (seen * 2 >= gray.length) return level;
  }
  return 255;
}

/** Mean difference over the header and footer bands — the app's chrome. */
function chromeDiff(a, b, width, height) {
  const headerRows = Math.floor(height * HEADER_BAND);
  const footerRows = Math.floor(height * FOOTER_BAND);
  const top = meanAbsDiff(a, b, width, height, 0, headerRows);
  const bottom = meanAbsDiff(a, b, width, height, height - footerRows, height);
  return Math.max(top, bottom);
}

/** Whether at least one chrome band — header or footer — stayed put. */
function chromeStable(a, b, width, height, limit = CHROME_MAD) {
  const headerRows = Math.floor(height * HEADER_BAND);
  const footerRows = Math.floor(height * FOOTER_BAND);
  const top = meanAbsDiff(a, b, width, height, 0, headerRows);
  const bottom = meanAbsDiff(a, b, width, height, height - footerRows, height);
  return Math.min(top, bottom) <= limit;
}

function contentDiff(a, b, width, height) {
  return meanAbsDiff(a, b, width, height, Math.floor(height * HEADER_BAND), height - Math.floor(height * FOOTER_BAND));
}

/**
 * Bounding box of pixels that changed but were not merely dimmed — the thing
 * drawn on top of a scrim.
 */
/**
 * Whether a pixel is part of something drawn on top, given what the change
 * from `base` to `over` looks like overall.
 *
 * Under a scrim, everything that was bright should have got darker; a bright
 * pixel that did not is the card, the sheet, the button — even when it is
 * white on a white page and so barely differs from what was underneath.
 * Without a scrim, drawn simply means changed.
 */
function isDrawn(base, over, i, scrimmed) {
  if (scrimmed) {
    if (base[i] < 40) return false;
    const ratio = over[i] / base[i];
    return ratio < 0.12 || ratio > 0.9;
  }
  return Math.abs(base[i] - over[i]) > 24;
}

function drawnBox(base, over, width, height, scrimmed = true) {
  // Rows that carry drawn pixels, then the largest block of such rows,
  // allowing small gaps. A dialog and the tab bar it sits above both change
  // against a scrim; the block that matters is the dialog, and taking a box
  // around everything would call it a sheet.
  const rows = new Array(height).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isDrawn(base, over, y * width + x, scrimmed)) rows[y]++;
    }
  }
  // A sheet's handle and its body are one drawn thing with a sliver of
  // background between them; the gap allowed here is a tenth of the screen,
  // enough to join those and too little to join a card in the middle to a
  // tab bar left undimmed at the bottom. The heaviest block wins, so a card
  // beats the button beneath it and the tab bar below that.
  const maxGap = Math.max(2, Math.round(height * 0.1));
  let best = null;
  let start = -1;
  let gap = 0;
  let weight = 0;
  for (let y = 0; y <= height; y++) {
    const drawn = y < height && rows[y] > 0;
    if (drawn) {
      if (start === -1) start = y;
      weight += rows[y];
      gap = 0;
    } else if (start !== -1 && (++gap > maxGap || y === height)) {
      const end = y - gap;
      if (!best || weight > best.weight) best = { start, end, weight };
      start = -1;
      weight = 0;
      gap = 0;
    }
  }
  if (!best) return null;
  let left = width;
  let right = -1;
  for (let y = best.start; y <= best.end; y++) {
    for (let x = 0; x < width; x++) {
      if (isDrawn(base, over, y * width + x, scrimmed)) {
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  return {
    x: left / width,
    y: best.start / height,
    w: (right - left + 1) / width,
    h: (best.end - best.start + 1) / height,
  };
}

/**
 * How much of the screen a scrim covers, and whether what is under it is the
 * same picture.
 *
 * A scrim is a translucent black layer: the screen underneath is still there,
 * only darker, so its edges — where one pixel is brighter than its neighbour —
 * are all still in the same places. Content arriving over a blank page also
 * darkens pixels, but draws new edges where there were none. The correlation
 * of horizontal gradients across the dimmed pixels is what tells the two
 * apart: near 1 under a scrim, near 0 for new content. Pixels that were
 * already dark carry no information about a scrim and are left out.
 */
function scrim(base, over, width) {
  let measured = 0;
  let count = 0;
  let gxy = 0;
  let gxx = 0;
  let gyy = 0;
  for (let i = 0; i < base.length; i++) {
    if (base[i] < 40) continue;
    measured++;
    const ratio = over[i] / base[i];
    if (ratio < 0.12 || ratio > 0.9) continue;
    count++;
    if ((i + 1) % width === 0 || i + 1 >= base.length) continue;
    // Only gradients between two dimmed pixels say anything about the scrim;
    // the edge where the scrim meets the card drawn on it is the card's edge,
    // not the picture underneath.
    if (base[i + 1] < 40) continue;
    const nextRatio = over[i + 1] / base[i + 1];
    if (nextRatio < 0.12 || nextRatio > 0.9) continue;
    const gradientBase = base[i + 1] - base[i];
    const gradientOver = over[i + 1] - over[i];
    gxy += gradientBase * gradientOver;
    gxx += gradientBase * gradientBase;
    gyy += gradientOver * gradientOver;
  }
  if (!count || !measured) return { fraction: 0, structure: 0 };
  const structure = gxx && gyy ? gxy / Math.sqrt(gxx * gyy) : 0;
  return { fraction: count / measured, structure };
}

/**
 * If this hold is a scrim over a neighbouring screen with nothing drawn on it,
 * returns that neighbour; otherwise null.
 */
function scrimBase(hold, previousHold, nextHold, width, height) {
  for (const candidate of [previousHold, nextHold]) {
    if (!candidate) continue;
    const dimmed = scrim(candidate.print.gray, hold.print.gray, width);
    if (dimmed.fraction < SCRIM_FRACTION || dimmed.structure < SCRIM_STRUCTURE) continue;
    const box = drawnBox(candidate.print.gray, hold.print.gray, width, height, true);
    if (!box || box.w * box.h < 0.03) return candidate;
  }
  return null;
}

/**
 * How a kept screen relates to the kept screen before it.
 *
 * @returns {{overlay: object|null, scrolled: boolean, previousWasLoading: boolean, loadingEvidence: 'chrome'|'bare'|null}}
 */
function relate(previousHold, hold, steps, width, height) {
  const a = previousHold.print;
  const b = hold.print;
  const result = { overlay: null, scrolled: false, previousWasLoading: false, loadingEvidence: null };

  // Overlay: a scrim with something drawn on it, or a compact region changing
  // against an otherwise untouched screen.
  const dimmed = scrim(a.gray, b.gray, width);
  const unchanged = 1 - changedFraction(a.gray, b.gray, 10);
  if (dimmed.fraction >= OVERLAY_DIM_FRACTION && dimmed.structure >= OVERLAY_STRUCTURE) {
    const box = drawnBox(a.gray, b.gray, width, height);
    if (box && box.h <= SHEET_MAX_HEIGHT) {
      result.overlay = { kind: overlayKind(box), dimmed: true, box };
      return result;
    }
  }
  if (unchanged >= OVERLAY_UNCHANGED_FRACTION) {
    const box = changedBox(a.gray, b.gray, width, height);
    if (box && box.h <= TOAST_MAX_HEIGHT && (box.y < 0.2 || box.y + box.h > 0.8)) {
      result.overlay = { kind: 'toast', dimmed: false, box };
      return result;
    }
    // A system sheet — the iOS share sheet among them — does not always
    // dim what is behind it, and its card can stop a little short of the
    // very bottom edge (a safe-area inset, a drag handle, rounded corners).
    // Anchored to the bottom and tall enough to be a sheet rather than a
    // toast is enough; it need not reach the last pixel.
    if (box && box.y + box.h >= SHEET_BOTTOM_MARGIN && box.y > 0.3 && box.h <= 0.6) {
      result.overlay = { kind: 'bottom_sheet', dimmed: false, box };
      return result;
    }
  }

  // Scroll: every step between the two holds was a scroll or a settle, or the
  // two representatives line up under a vertical shift.
  let onlyScrolling = true;
  let sawScroll = false;
  for (let frame = previousHold.end + 1; frame <= hold.start; frame++) {
    const step = steps[frame];
    if (!step) continue;
    if (step.label === 'scroll') sawScroll = true;
    else if (step.label === 'cut') onlyScrolling = false;
  }
  const shifted = bestVerticalShift(a.gray, b.gray, width, height);
  const aligned =
    shifted.shift !== 0 && shifted.mad <= SCROLL_RESIDUAL_RATIO * shifted.madAtZero && shifted.mad <= SCROLL_RESIDUAL_MAX;
  if ((onlyScrolling && sawScroll && chromeStable(a.gray, b.gray, width, height)) || (aligned && chromeStable(a.gray, b.gray, width, height))) {
    result.scrolled = true;
    return result;
  }

  // Loading: the previous screen had the same chrome but far less in it, and
  // did not stay long — a skeleton, a spinner, a page still fetching. What
  // it had less of is the point: a loading state is mostly empty, and empty
  // means pale or dark. A light page of products, or a landing page whose
  // top half is a block of brand colour, has the same chrome as what
  // follows and less structure, and is a finished design all the same.
  const sparse = a.edge < SPARSE_EDGE;
  const sameChrome = chromeStable(a.gray, b.gray, width, height, LOADING_CHROME_MAD);
  const flat = flatShare(a.gray, width, height);
  const mostlyEmpty = a.edge <= LOADING_SURE_EDGE || (flat >= LOADING_FLAT_SHARE && (a.luminance >= 200 || a.luminance <= 60)) || skeletonLike(a, width, height);
  if (
    !previousHold.first &&
    previousHold.seconds <= LOADING_MAX_SECONDS &&
    a.edge <= LOADING_MAX_EDGE &&
    mostlyEmpty &&
    b.edge >= LOADING_EDGE_RATIO * Math.max(a.edge, 0.5) &&
    contentDiff(a.gray, b.gray, width, height) >= LOADING_CONTENT_MAD &&
    // Same chrome, or so little on the frame that chrome is beside the
    // point: a spinner on white, a skeleton, an interstitial with one line
    // of copy — followed by a page with several times its structure.
    (sameChrome || ((sparse || (flat >= LOADING_BARE_FLAT && previousHold.seconds <= LOADING_BARE_MAX_SECONDS)) && b.edge >= 3 * Math.max(a.edge, 0.5)))
  ) {
    result.previousWasLoading = true;
    // Same chrome with the content arriving is strong evidence; a bare frame
    // followed by a fuller one is weaker, and the text pass may overrule it.
    result.loadingEvidence = sameChrome ? 'chrome' : 'bare';
  }

  return result;
}

function overlayKind(box) {
  if (box.h <= TOAST_MAX_HEIGHT) return 'toast';
  if (box.y + box.h >= 0.9 && box.y > 0.2) return 'bottom_sheet';
  return 'dialog';
}

/** Exported for the self-test and the trace tool. */
export const _thresholds = {
  STILL_MAD,
  SOFT_MAD,
  MERGE_MAD,
  DEFAULT_MIN_HOLD_SECONDS,
  BRIEF_DISTINCT_MAD,
  SCRIM_FRACTION,
};

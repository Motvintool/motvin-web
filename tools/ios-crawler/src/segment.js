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
  fingerprintFromThumb,
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

/** Two adjacent holds this close are one screen that was still drawing. */
const MERGE_MAD = 14;
const MERGE_CHANGED = 0.15;

/** A vertical shift that removes this share of the difference is a scroll. */
const SCROLL_RESIDUAL_RATIO = 0.45;
const SCROLL_RESIDUAL_MAX = 10;

/** How long a screen has to hold to be believed without further evidence. */
const DEFAULT_MIN_HOLD_SECONDS = 0.5;

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
const OVERLAY_UNCHANGED_FRACTION = 0.6;

/** Loading state: same chrome, content this much emptier, gone this quickly. */
const LOADING_EDGE_RATIO = 1.5;
const LOADING_MAX_SECONDS = 4;
const LOADING_CONTENT_MAD = 15;
/** A loading screen is sparse in absolute terms too; a dense page is never one. */
const LOADING_MAX_EDGE = 10;
const CHROME_MAD = 8;
/** Loading allows a little more chrome movement: a tab indicator sliding over. */
const LOADING_CHROME_MAD = 14;

/** Revisit: the same screen seen again. */
const REVISIT_MAD = 6;
const REVISIT_BITS = 8;
const REVISIT_LOOSE_MAD = 10;
const REVISIT_LOOSE_SAME = 0.8;

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
 * @property {string|null} scrolledFrom id of the screen this is a scrolled view of
 * @property {string|null} revisitOf   id of the earlier screen this repeats
 * @property {number} visits
 * @property {boolean} flat
 * @property {{dhash: string, ahash: string, luminance: number, edge: number}} print
 * @property {{hex: string, share: number, role: string}[]} colors
 */

/**
 * @param {Buffer[]} thumbs raw RGB thumbnails, one per frame, in order
 * @param {{fps: number, width?: number, height?: number, minHoldSeconds?: number, keepBrief?: boolean}} options
 */
export function segmentRecording(thumbs, options) {
  const fps = options.fps;
  const width = options.width ?? THUMB.width;
  const height = options.height ?? THUMB.height;
  const minHold = options.minHoldSeconds ?? DEFAULT_MIN_HOLD_SECONDS;
  const keepBrief = options.keepBrief !== false;
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
        if (
          step.label !== 'scroll' &&
          step.mad <= MERGE_MAD &&
          step.changed <= MERGE_CHANGED &&
          !compact &&
          scrim(a, b, width).fraction < OVERLAY_DIM_FRACTION
        ) {
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
    hold.rep = representative(hold, steps, prints);
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
    // A brief hold is only believable when it sits directly between two
    // settled screens. A frame in the middle of a run of changing frames is a
    // transition, however different it looks from what came before and after
    // — a slide carries the old screen out and the new one in, and no single
    // frame of that is a screen anyone saw.
    const previous = holds[h - 1] ?? null;
    const following = holds[h + 1] ?? null;
    // …and a brief hold at the very end of a recording has nothing after it
    // to prove it was a screen rather than the cut where recording stopped.
    const settledNeighbours =
      (!previous || previous.seconds >= minHold || previous.keep) && Boolean(following) && following.seconds >= minHold;
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
      visits: 1,
      flat: hold.flat,
      print: {
        dhash: hold.print.dhash,
        ahash: hold.print.ahash,
        luminance: Math.round(hold.print.luminance),
        edge: Math.round(hold.print.edge * 10) / 10,
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
          }
        }
      }
    }

    // Seen before? Compare against every earlier distinct screen, nearest
    // first, so a return to the home tab is recorded as a return rather than
    // as a new screen.
    for (let e = screens.length - 1; e >= 0; e--) {
      const earlier = screens[e];
      if (earlier.revisitOf) continue;
      if (sameScreen(earlier.hold.print, hold.print, width, height)) {
        screen.revisitOf = earlier.id;
        earlier.visits++;
        dropped.revisits++;
        // The first sighting may have been a glimpse; a later, longer look at
        // the same screen is the better picture of it.
        if (earlier.brief && !screen.brief) {
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

    screens.push(screen);
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
      if (screen.loadingOf === null && screen.kind === 'loading') screen.kind = 'screen';
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
      }
    }
  }

  // ─── Edges: the journey, with revisits resolved to the screen they repeat ──
  const edges = [];
  for (let i = 1; i < screens.length; i++) {
    const from = canonical(screens[i - 1]);
    const to = canonical(screens[i]);
    if (from === to) continue;
    edges.push({ from, to, atSeconds: screens[i].start });
  }

  for (const screen of screens) delete screen.hold;

  return {
    fps,
    frames: n,
    screens,
    edges,
    dropped,
    steps: steps.map((step, index) => (step ? { frame: index, ...step } : null)).filter(Boolean),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** The id a screen stands for: itself, or the earlier screen it repeats. */
function canonical(screen) {
  return screen.revisitOf ?? screen.id;
}

/**
 * The frame that best represents a hold: the settled frame with the most
 * drawn on it.
 *
 * A hold often spans a screen still completing itself — a splash whose logo
 * fades in, a page whose header and tab bar arrive a beat after its list, a
 * feed whose images land one by one. The frame someone would screenshot is the
 * last one of those, not the first. So the candidates are the end of every
 * still run inside the hold plus the hold's last frame, and the one with the
 * most structure wins; later frames win ties. Taking structure rather than
 * simply the last frame keeps a fade-out at the end of a hold from being
 * chosen over the screen before it.
 */
function representative(hold, steps, prints) {
  // The hold's last frame counts only when it is itself settled: the step
  // into it was small. A hold merged across settling can end on the first
  // frame of the transition out, and that frame is mid-motion however much
  // is drawn on it.
  const lastStep = steps[hold.end];
  const candidates = new Set();
  if (hold.end === hold.start || !lastStep || (lastStep.mad <= SETTLED_MAD && lastStep.changed <= SETTLED_CHANGED)) {
    candidates.add(hold.end);
  }
  let runStart = hold.start;
  for (let frame = hold.start + 1; frame <= hold.end + 1; frame++) {
    const still = frame <= hold.end && steps[frame] && steps[frame].label === 'still';
    if (!still) {
      if (frame - 1 > runStart) candidates.add(frame - 1);
      runStart = frame;
    }
  }
  if (!candidates.size) candidates.add(hold.start);
  let best = hold.end;
  let bestEdge = -1;
  for (const frame of [...candidates].sort((a, b) => a - b)) {
    const edge = prints[frame].edge;
    if (edge >= bestEdge * 0.98) {
      bestEdge = Math.max(bestEdge, edge);
      best = frame;
    }
  }
  return best;
}

function nearestKept(holds, index, direction) {
  for (let i = index + direction; i >= 0 && i < holds.length; i += direction) {
    if (holds[i].keep) return holds[i];
  }
  return null;
}

/** Whether two prints are the same screen, allowing for a carousel having moved on. */
function sameScreen(a, b, width, height) {
  const mad = meanAbsDiff(a.gray, b.gray, width, height);
  if (mad <= REVISIT_MAD && hamming(a.dhash, b.dhash) <= REVISIT_BITS && hamming(a.ahash, b.ahash) <= REVISIT_BITS) {
    return true;
  }
  if (mad <= REVISIT_LOOSE_MAD && 1 - changedFraction(a.gray, b.gray, 10) >= REVISIT_LOOSE_SAME) {
    return true;
  }
  return false;
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
 * @returns {{overlay: object|null, scrolled: boolean, previousWasLoading: boolean}}
 */
function relate(previousHold, hold, steps, width, height) {
  const a = previousHold.print;
  const b = hold.print;
  const result = { overlay: null, scrolled: false, previousWasLoading: false };

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
    if (box && box.y + box.h >= 0.9 && box.y > 0.3 && box.h <= 0.55) {
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
  // did not stay long — a skeleton, a spinner, a page still fetching.
  const sparse = a.edge < SPARSE_EDGE;
  const sameChrome = chromeStable(a.gray, b.gray, width, height, LOADING_CHROME_MAD);
  if (
    !previousHold.first &&
    previousHold.seconds <= LOADING_MAX_SECONDS &&
    a.edge <= LOADING_MAX_EDGE &&
    b.edge >= LOADING_EDGE_RATIO * Math.max(a.edge, 0.5) &&
    contentDiff(a.gray, b.gray, width, height) >= LOADING_CONTENT_MAD &&
    (sameChrome || (sparse && b.edge >= 3 * Math.max(a.edge, 0.5)))
  ) {
    result.previousWasLoading = true;
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

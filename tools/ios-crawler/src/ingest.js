/**
 * Getting screens in without a Simulator.
 *
 * The crawler's capture stage needs Xcode and idb; everything after it —
 * deduplication, classification, naming, the store writer — needs nothing but
 * macOS. This module exposes that second half directly, so a folder of
 * screenshots taken on a real iPhone, or a screen recording of someone using
 * the app, goes through exactly the same pipeline a crawl does and lands in
 * exactly the same shape.
 *
 * It is also the only route to apps the Simulator cannot run at all, which is
 * every App Store binary.
 *
 * Two commands:
 *   ingest   — a folder of screenshots, or a recording → the Inspirations store
 *   classify — (re)analyse screens already stored, filling in their sidecars
 *
 * A recording is read as a timeline rather than a pile of frames. The
 * segmenter (segment.js) finds every moment the UI held still and works out
 * how each relates to its neighbours — a dialog over a screen, a page still
 * loading, a scrolled view, a return to somewhere already seen. That
 * structure travels with each screen into its classification, its name, its
 * flow and its stored record, so the library shows a journey, not a contact
 * sheet.
 */

import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { run } from './exec.js';
import { log, dim } from './log.js';
import { extractFramesAt, extractThumbs } from './frames.js';
import { dominantColors, fingerprint, fingerprintFromThumb, jaccard, THUMB } from './hash.js';
import { ScreenGraph } from './graph.js';
import { segmentRecording, skeletonLike } from './segment.js';
import { analyseScreen, complete, encodeForModel, groupIntoFlows, identifyApp, pickBackend, probeAnalyzer, resolveBackend } from './analyze.js';
import { resolveIndustry } from './category.js';
import { researchTree } from './researcher.js';
import { extractJson } from './analyze.js';
import { syncFolders } from './folders.js';
import { applyRulesToGraph, startPrefetch, writeReviewPack } from './review.js';
import { checkTree, foldSmallRepeats, groupIntoFeatures, liftAppTasksOutOfOnboarding, mergeSameNamedSiblings, nameBrokenSections, promoteAreas, tidyNames, reviewStructure, settleCategories, splitOnboardingTail } from './structure.js';
import { buildJourneys } from './journeys.js';
import { actionPhrase, describeAction } from './actions.js';
import { isBlockingScreen, isExternalAuthScreen } from './safety.js';
import { localDateString, publishCrawl, rebuildManifest, resolveDataDir, resolveVersionId, safeName, updatePublishedContent } from './publish.js';
import { readText } from './ocr.js';
import { filterStyles, isPublishable, labelFor, publishedTypeFor, PUBLISHED_TYPES, settledType, stateFor } from './taxonomy.js';

/** What a phone or a Finder export might hand us. */
const READABLE = ['.png', '.jpg', '.jpeg', '.heic', '.heif', '.webp', '.tiff'];

/** Screen recordings. iOS writes .mov; anything the readers accept works. */
const WATCHABLE = ['.mov', '.mp4', '.m4v', '.avi', '.mkv'];

/** What the pipeline works in. sips converts everything else to this. */
const CANONICAL = '.png';

/**
 * Frames pulled per second of recording. Expressed here as an interval —
 * one frame every 0.3 seconds — because that is the number the admin
 * chose, with the tradeoff spelled out first: at 10 frames a second (one
 * every 0.1s) a screen swiped past in a third of a second still left three
 * identical frames to tell it apart from a transition; at one every 0.3s
 * it leaves at most one, so a screen held for less than that is no longer
 * distinguishable from a push or a fade and can be missed. Chosen anyway,
 * for the shorter run and smaller upload it buys. Raise the rate again
 * (lower the interval) if fast screens start going missing.
 */
const SAMPLE_INTERVAL_SECONDS = 0.3;
const DEFAULT_FPS = 1 / SAMPLE_INTERVAL_SECONDS;

/** Above this many extracted frames, stop and tell the user to trim or slow the rate. */
const MAX_FRAMES = 6000;

/**
 * A scrolled view whose recognised text overlaps this much with the screen it
 * scrolled from is the same content nudged, not a new view of it.
 */
const SCROLL_DUPLICATE_TEXT = 0.8;

/** The record used when no analyzer is available, or when one fails. */
function unclassified(name) {
  return {
    screenType: 'other',
    category: null,
    flow: null,
    name,
    description: '',
    tags: [],
    elements: [],
    style: [],
    states: [],
    blocked: false,
    blockedReason: null,
    actions: [],
    unclassified: true,
  };
}

function listImages(folder) {
  if (!existsSync(folder)) throw new Error(`folder not found: ${folder}`);
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && READABLE.includes(extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    // Sorted by name so a phone's own numbering carries the capture order
    // through to flow ordering. Numeric-aware, so IMG_9 precedes IMG_10.
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

/** Progress, for a caller that is driving this as a subprocess. */
function report(options, stage, message, extra = {}) {
  if (typeof options.onProgress === 'function') options.onProgress({ stage, message, ...extra });
}

// ─── Video ───────────────────────────────────────────────────────────────────

/**
 * Pulls frames out of a screen recording.
 *
 * A recording is a much better source than hand-taken screenshots: someone taps
 * through an app for three minutes and the whole session is captured, including
 * the screens they would never have thought to screenshot. The cost is that
 * most frames are worthless — mid-animation, mid-scroll, or the same screen
 * held for four seconds. `segmentRecording` is what sorts that out.
 */
async function thumbsFromVideo(videoPath, stagingDir, fps) {
  const extracted = await extractThumbs(videoPath, join(stagingDir, 'frames'), fps);

  if (extracted.count > MAX_FRAMES) {
    throw new Error(
      `${extracted.count} frames from ${basename(videoPath)} — too many to process. ` +
        `Trim the recording, or lower the rate with --fps ${Math.max(1, Math.floor(fps / 2))}.`,
    );
  }
  return extracted;
}

/**
 * Keeps one frame per moment the UI actually held still.
 *
 * Kept for callers that only have frame files. The recording path proper uses
 * `segmentRecording` on the thumbnails the frame reader produced, which is
 * both faster and far better informed; this wraps the same segmenter around
 * fingerprints read from disk, so the result is the same kind of answer.
 *
 * @returns {Promise<{kept: string[], transitions: number, runs: number, screens: object[]}>}
 */
export async function selectStableFrames(framePaths, options = {}) {
  const fps = options.fps ?? 2;
  const thumbs = [];
  for (const path of framePaths) {
    thumbs.push(await thumbFromFile(path));
  }
  const segmented = segmentRecording(thumbs, {
    fps,
    // The old contract: a screen had to hold for two frames. Kept as the
    // default here so callers of this helper see the same answers.
    minHoldSeconds: options.minRun !== undefined ? options.minRun / fps : options.minHoldSeconds ?? 2 / fps,
    keepBrief: options.keepBrief,
  });
  const distinct = segmented.screens.filter((screen) => !screen.revisitOf);
  return {
    kept: distinct.map((screen) => framePaths[screen.frame]),
    transitions: segmented.dropped.transitions + segmented.dropped.blank + segmented.dropped.scrims,
    runs: segmented.screens.length,
    screens: distinct,
  };
}

/**
 * A thumbnail in the frame reader's format, made from an image file with
 * sips. Slow (one subprocess per frame), so only used where thumbnails were
 * not produced alongside the frames.
 */
async function thumbFromFile(imagePath) {
  const out = join(tmpdir(), `motvin-thumb-${process.pid}-${Math.random().toString(36).slice(2)}.bmp`);
  const result = await run(
    'sips',
    ['-z', String(THUMB.height), String(THUMB.width), '-s', 'format', 'bmp', imagePath, '--out', out],
    { timeout: 20_000 },
  );
  if (result.failed) throw new Error(`sips could not read ${imagePath}: ${result.stderr.trim() || `exit ${result.code}`}`);
  try {
    return bmpToRgb(readFileSync(out), THUMB.width, THUMB.height);
  } finally {
    rmSync(out, { force: true });
  }
}

function bmpToRgb(buffer, width, height) {
  const dataOffset = buffer.readUInt32LE(10);
  const rawHeight = buffer.readInt32LE(22);
  const topDown = rawHeight < 0;
  const bitsPerPixel = buffer.readUInt16LE(28);
  const bytesPerPixel = bitsPerPixel / 8;
  const rowSize = Math.ceil((width * bitsPerPixel) / 32) * 4;
  const rgb = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    const sourceRow = topDown ? y : height - 1 - y;
    const rowStart = dataOffset + sourceRow * rowSize;
    for (let x = 0; x < width; x++) {
      const p = rowStart + x * bytesPerPixel;
      const o = (y * width + x) * 3;
      rgb[o] = buffer[p + 2];
      rgb[o + 1] = buffer[p + 1];
      rgb[o + 2] = buffer[p];
    }
  }
  return rgb;
}

/** Converts to PNG when needed; returns a path inside `stagingDir`. */
async function stage(folder, fileName, stagingDir) {
  const source = join(folder, fileName);
  const target = join(stagingDir, `${safeName(basename(fileName, extname(fileName)))}${CANONICAL}`);

  if (extname(fileName).toLowerCase() === CANONICAL) {
    copyFileSync(source, target);
    return target;
  }

  const converted = await run('sips', ['-s', 'format', 'png', source, '--out', target], { timeout: 30_000 });
  if (converted.failed) {
    throw new Error(`could not convert ${fileName}: ${converted.stderr.trim() || `exit ${converted.code}`}`);
  }
  return target;
}

/**
 * Tracks whether the analyzer is worth calling again. One auth failure means
 * every subsequent call fails the same way, and a 40-screen folder should not
 * wait out forty timeouts to learn that.
 */
class Analyzer {
  constructor(backend) {
    this.backend = backend;
    // "none" turns classification off outright, for an ingest that only wants
    // the files in — and so the self-test can exercise this path without
    // depending on a reachable model.
    this.usable = backend !== 'none';
    this.reason = backend === 'none' ? 'disabled' : null;
    this.done = 0;
  }

  async analyse(imagePath, fallbackName, extra = {}) {
    if (!this.usable) return unclassified(fallbackName);
    try {
      const analysis = await analyseScreen(imagePath, [], { backend: this.backend, ...extra });
      this.done++;
      return analysis;
    } catch (error) {
      const message = error.message.split('\n')[0];
      // Losing the analyzer mid-run is not something to work around. Every
      // remaining screen would file as "other" and the flows would collapse
      // into one bucket — output that looks like a broken feature. Stop, and
      // let the caller say why.
      const failure = new Error(
        `The analyzer stopped responding after ${this.done} screen(s): ${message}\n` +
          '  Nothing was published. Fix the analyzer and upload again, or pass --no-classify to file screens without analysis.',
      );
      failure.analyzer = true;
      throw failure;
    }
  }
}

// ─── ingest ──────────────────────────────────────────────────────────────────

/**
 * @param {{folder: string, app: object, dataDir?: string, backend?: string,
 *          classify?: boolean, dryRun?: boolean, fps?: number, minHoldSeconds?: number,
 *          minRun?: number, keepBrief?: boolean, existingApps?: object[],
 *          authorization?: object, onProgress?: Function}} options
 */
/**
 * Every raw sampled frame the recording actually produced — not one per
 * hold, but one per 0.3s sample, the same granularity a plain "extract every
 * N seconds" tool would show. A long hold (someone reading a screen for a
 * few seconds) turns into one real candidate — the hold's own representative
 * frame, kept or offered back the same as before — plus a run of "duplicate"
 * candidates for every other sample in that same span, so a screen the
 * hold-grouping itself got wrong (two different screens folded into one
 * hold, the fate the Swiggy splash bug took) still has every one of its raw
 * moments on offer, not just whichever one the grouping happened to settle
 * on as that hold's single picture.
 *
 * This is what lets "manual" mean more than picking through what the
 * segmenter already decided to publish: any sampled moment, not just a
 * hold's chosen representative, is offered back, pre-selected the same as
 * anything else not worth keeping, so the admin can recover it with one tap
 * instead of it simply being gone.
 *
 * Needs `timeline.holds` — segmentRecording's trace, only computed when
 * asked for. Candidates with `dropped: true` carry the print and colour
 * data a recovered screen needs, since no full-size frame existed for them
 * before review and nothing else will compute it later.
 */

/**
 * How fully drawn a raw sample looks — higher for a screen that finished
 * loading and settled, lower for one still fading in, mid-transition, or a
 * loading skeleton. Used to pick which of a hold's near-identical raw
 * samples is the one actually worth keeping, instead of defaulting to
 * whichever frame the segmenter happened to pick as the hold's own
 * representative (usually right, but not always — a push animation or a
 * slow network fetch can leave the "representative" moment itself
 * half-drawn while a later duplicate sample of the same hold is not).
 */
function frameQuality(print) {
  // Detail, plus contrast: a sheet or dialog still fading in (or a page under a
  // scrim still darkening) has the same layout as the settled frame but washed
  // out, and its contrast is a fraction of the settled one's.
  let mean = 0;
  for (const value of print.gray) mean += value;
  mean /= print.gray.length;
  let spread = 0;
  for (const value of print.gray) spread += (value - mean) ** 2;
  const contrast = Math.sqrt(spread / print.gray.length);
  let score = print.edge + contrast / 4;
  if (print.luminance > 245 || print.luminance < 10) score -= 5;
  if (skeletonLike(print, print.width, print.height)) score -= 5;
  return Math.round(score * 10) / 10;
}

function buildReviewCandidates(timeline, thumbs) {
  if (!timeline.holds) return null;
  const screenById = new Map(timeline.screens.map((screen) => [screen.id, screen]));
  const candidates = [];
  let extraIndex = 0;
  for (const hold of timeline.holds) {
    const screen = hold.screen ? screenById.get(hold.screen) : null;
    for (let frame = hold.start; frame <= hold.end; frame++) {
      const start = Math.round((frame / timeline.fps) * 100) / 100;
      // Every raw sample's own fingerprint, representative or not — cheap on
      // a 32x64 thumbnail, and the only way to score a duplicate against the
      // hold's chosen picture rather than just against the other duplicates.
      const print = fingerprintFromThumb(thumbs[frame]);
      const quality = frameQuality(print);
      if (screen && frame === hold.rep) {
        // The hold's own picture — a settled screen the recording actually
        // held on, published like any other one even when it is a later
        // return to a screen seen earlier: the admin's own request, so a
        // walk of A → B → C → A keeps that final A as its own real step
        // instead of being folded back into the first sighting of A and
        // dropped by default.
        candidates.push({
          id: screen.id,
          frame,
          start,
          holdSeconds: hold.seconds,
          brief: Boolean(hold.brief),
          kind: screen.kind,
          dropped: false,
          reason: null,
          quality,
        });
        continue;
      }
      // Every other raw sample in this hold's span: either a repeat of a
      // screen already represented above, or part of a hold the segmenter
      // never kept at all (a transition, a scrim, a push caught mid-slide).
      // Either way it is offered back, with what it would need to become a
      // real screen of its own if recovered. A duplicate shares its hold's
      // own sign-in check rather than paying for its own — it is, by
      // definition, the same screen the representative already answered for.
      candidates.push({
        id: `d${String(++extraIndex).padStart(4, '0')}`,
        frame,
        start,
        holdSeconds: Math.round((1 / timeline.fps) * 100) / 100,
        brief: false,
        kind: screen ? 'duplicate' : 'dropped',
        dropped: true,
        reason: screen ? 'duplicate' : (hold.why ?? 'transition'),
        duplicateOf: screen ? screen.id : null,
        print: { dhash: print.dhash, ahash: print.ahash, luminance: Math.round(print.luminance), edge: Math.round(print.edge * 10) / 10 },
        colors: dominantColors(thumbs[frame]),
        quality,
      });
    }
  }
  return candidates;
}

export async function ingestFolder(options) {
  const { app } = options;
  const source = options.folder;
  const staging = mkdtempSync(join(tmpdir(), 'motvin-ingest-'));
  const analyzer = new Analyzer(options.backend);
  const graph = new ScreenGraph();
  const duplicates = [];
  const excluded = [];
  let captureInfo = null;
  let timeline = null;
  /** Every screen the recording showed, in order, revisits included. */
  let visits = null;
  // Set when the run stops after capture to let the admin choose what to
  // keep. The staging dir — its extracted frames, its manifest — has to
  // survive that pause, so the usual cleanup below is skipped for it; the
  // resumed run (resumeIngest, below) removes it when it is actually done.
  let pausedForReview = false;

  try {
    // One --from for both sources: a folder of screenshots, or a recording.
    const isVideo = WATCHABLE.includes(extname(source).toLowerCase());

    if (isVideo) {
      if (!existsSync(source)) throw new Error(`video not found: ${source}`);
      const fps = options.fps ?? DEFAULT_FPS;
      log.heading(`Reading ${basename(source)}`);
      log.detail(`extracting frames at ${fps}/second…`);
      report(options, 'extract', `Reading ${basename(source)} at ${Number(Number(fps).toFixed(1))} frames a second`);

      // Pass one reads every frame small; the segmenter picks the few that
      // are screens; pass two reads only those at full size. A long recording
      // costs megabytes of disk, not gigabytes.
      const { thumbs, count, backend } = await thumbsFromVideo(source, staging, fps);
      log.info(`${count} frames scanned (${backend})`);
      report(options, 'extract', `${count} frames scanned`, { frames: count });

      const minHoldSeconds = options.minHoldSeconds ?? (options.minRun !== undefined ? options.minRun / fps : undefined);
      timeline = segmentRecording(thumbs, { fps, minHoldSeconds, keepBrief: options.keepBrief });
      captureInfo = { source: basename(source), fps, frames: count, durationSeconds: Math.round((count / fps) * 10) / 10 };

      // A later return to an earlier screen is published as its own real
      // step, same as any other settled hold — the admin's own request, so
      // a walk of A → B → C → A keeps that final A rather than folding it
      // back into the first sighting and leaving it out. Its frame is
      // extracted here the same as any other kept screen's.
      const wanted = timeline.screens.map((screen) => screen.frame);
      report(options, 'extract', `Reading ${wanted.length} screen frames at full size`, { frames: count });
      const byIndex = await extractFramesAt(source, join(staging, 'frames'), fps, wanted);
      const frames = [];
      for (const [index, path] of byIndex) frames[index] = path;
      if (!byIndex.size) throw new Error('none of the chosen frames could be read from the video');

      const distinct = timeline.screens;
      const { dropped } = timeline;
      log.info(
        `${distinct.length} screen(s), ${dropped.revisits} of them a later return to one seen earlier — ${dropped.transitions} transition frame(s), ` +
          `${dropped.scrims} system prompt(s) iOS did not record, ${dropped.blank} blank frame(s) set aside`,
      );
      report(options, 'segment', `${distinct.length} screens found in the recording`, {
        screens: distinct.length,
        dropped,
      });
      if (!distinct.length) {
        throw new Error('no frame held still long enough to be a screen — try a slower walk through the app');
      }

      if (options.reviewOnly) {
        // Nothing has been classified yet — on purpose. Classification (and
        // the AI calls it can make) is the slow part of a run, and the admin
        // judges "unwanted" by looking at the picture, not by a type label;
        // asking them before spending that time also means a screen they
        // drop is never sent to the analyzer at all.
        //
        // What is reviewed is every hold the segmenter found, not just the
        // ones it kept — a transition, a scrim, a repeat of an earlier
        // screen is offered back, pre-selected the same as anything else not
        // worth publishing, so a screen the segmenter got wrong can be
        // recovered with one tap rather than simply being gone. This needed
        // a second pass of full-size frames beyond the ones distinct alone
        // would have asked for — segmenting twice (fast) rather than
        // re-reading the video (slow) is why `trace: true` is on only here.
        const traced = segmentRecording(thumbs, { fps, minHoldSeconds, keepBrief: options.keepBrief, trace: true });
        const candidates = buildReviewCandidates(traced, thumbs);
        const candidateFrames = [...new Set(candidates.map((candidate) => candidate.frame))];
        report(options, 'extract', `Reading ${candidateFrames.length} screens at full size, kept and dropped alike`, { frames: count });
        const candidateByIndex = await extractFramesAt(source, join(staging, 'frames'), fps, candidateFrames);
        const candidateFramePaths = [];
        for (const [index, path] of candidateByIndex) candidateFramePaths[index] = path;

        // Cheap and on-device, unlike the real classification: catches a
        // Google/Apple/Facebook sign-in page before anything else does, so
        // manual mode can tick it too, the same as a loading screen. A
        // duplicate is read straight off its own hold's representative
        // instead of paying for a second OCR pass over the same content —
        // with every raw sample now its own candidate, that representative
        // can have a few dozen duplicates in a long-held screen.
        const externalById = new Map();
        for (const candidate of candidates) {
          if (candidate.duplicateOf) continue;
          const framePath = candidateFramePaths[candidate.frame];
          candidate.external = false;
          if (framePath) {
            try {
              const lines = await readText(framePath);
              candidate.external = Boolean(isExternalAuthScreen(lines.map((line) => line.text).join('\n')));
            } catch {
              // No hint, no harm — the real classify pass after resume still
              // runs its own check regardless of this one.
            }
          }
          externalById.set(candidate.id, candidate.external);
        }
        for (const candidate of candidates) {
          if (candidate.duplicateOf) candidate.external = externalById.get(candidate.duplicateOf) ?? false;
        }

        // The recording waits with the captured frames: the review picks better
        // pictures from it later (moved when it can be, copied otherwise).
        const recording = join(staging, `recording${extname(source).toLowerCase()}`);
        try {
          renameSync(source, recording);
        } catch {
          copyFileSync(source, recording);
        }
        writeFileSync(
          join(staging, 'review.json'),
          JSON.stringify({ source: basename(source), recording, captureInfo, timeline, candidates }),
        );
        const kept = candidates.filter((candidate) => !candidate.dropped).length;
        const duplicateCount = candidates.filter((candidate) => candidate.kind === 'duplicate').length;
        const setAside = candidates.length - kept - duplicateCount;
        report(
          options,
          'captured',
          `${kept} screen${kept === 1 ? '' : 's'} found, ${setAside} more set aside` +
            (duplicateCount ? `, ${duplicateCount} repeat sample${duplicateCount === 1 ? '' : 's'}` : '') +
            ' — choose how to clean up',
          {
            stagingDir: staging,
            capturedScreens: candidates.map((candidate) => ({
              id: candidate.id,
              frame: candidate.frame,
              start: candidate.start,
              holdSeconds: candidate.holdSeconds,
              brief: candidate.brief,
              kind: candidate.kind,
              external: candidate.external,
              dropped: candidate.dropped,
              reason: candidate.reason ?? null,
              duplicateOf: candidate.duplicateOf ?? null,
              quality: candidate.quality,
            })),
          },
        );
        pausedForReview = true;
        return { pausedForReview: true, stagingDir: staging, screens: kept };
      }

      // The review's frames are read now, alongside the analysis, so its package is ready sooner.
      startPrefetch({ recording: source, times: timeline.screens.map((screen) => screen.start), dataDir: options.dataDir });
      visits = await ingestTimeline({ timeline, frames, analyzer, graph, duplicates, excluded, options, captureInfo });
    } else {
      const files = listImages(source);
      if (!files.length) {
        throw new Error(`no readable images in ${source} (looked for ${READABLE.join(', ')})`);
      }
      log.heading(`Ingesting ${files.length} file(s)`);
      report(options, 'extract', `${files.length} image files`, { frames: files.length });
      const staged = [];
      for (const fileName of files) {
        staged.push(await stage(source, fileName, staging));
      }
      await ingestFiles({ staged, analyzer, graph, duplicates, excluded, options });
    }

    if (!graph.size) throw new Error('every file was a duplicate — nothing to publish');
    return await finishIngest({ app, source, graph, visits, analyzer, duplicates, excluded, options: { ...options, recordingPath: isVideo ? source : null }, captureInfo, timeline });
  } finally {
    // The staged PNGs have been copied into the store by now — except when
    // paused for review, where they are still waiting to be. resumeIngest
    // removes the staging dir once that run actually finishes.
    if (!pausedForReview) rmSync(staging, { recursive: true, force: true });
  }
}

/**
 * Everything after the screens are chosen: naming the app, grouping the
 * walk into journeys, publishing, and the researcher's slower pass over
 * what got published. Shared by a run that goes straight through and one
 * resumed after the admin reviewed what was captured — by the time either
 * reaches here, `graph` holds exactly the screens going in, and nothing
 * about how they got there matters any more.
 */
async function finishIngest({ app, source, graph, visits, analyzer, duplicates, excluded, options, captureInfo, timeline }) {
    if (!graph.size) throw new Error('every file was a duplicate — nothing to publish');
    let identified = null;
    /** What the researcher pass changed, when it ran. */
    let researched = null;
    /** The tree to hand the researcher once the screens are in the store. */
    let pendingResearch = null;

    // Identification runs after the screens are chosen, so the model sees real
    // screens rather than whatever happened to be the first frame.
    let resolvedApp = app;
    if (!resolvedApp) {
      report(options, 'identify', 'Working out which app this is');
      const nodes = [...graph.nodes.values()].filter((node) => !node.skipPublish);
      const identity = await identifyFrom(
        representativeFrames(nodes),
        source,
        analyzer.usable ? options.backend : 'none',
        // Nothing hands the run the library's apps, so read them from the store: an upload
        // of an app that is already there must add to it, not write a fresh record over it.
        options.existingApps ?? readStoredApps(options.dataDir),
        nodes.map((node) => node.analysis.lines ?? []).filter((lines) => lines.length),
      );
      resolvedApp = {
        appId: identity.appId,
        name: identity.name,
        industry: identity.industry,
        industrySource: identity.industrySource,
        website: identity.website,
        tagline: identity.tagline,
        authorization: options.authorization ?? {},
      };
      identified = identity;
      log.info(
        identity.detected
          ? `app: ${identity.name} (${identity.appId})${identity.confident ? '' : dim(` — best guess${identity.evidence ? ` from “${identity.evidence}”` : ''}, rename it in Apps`)}`
          : `app: ${identity.name} (${identity.appId})${dim(' — named after the recording; rename it in Apps')}`,
      );
    }
    // The platform is the admin's call — a recording does not say whether it
    // is an iPhone app, a web app or a website — and it decides where the
    // screens live: screens/<platform>/<app>.
    // An app the admin just made by name carries a stand-in category; its
    // real one is looked up the way an identified app's is (the App Store
    // genre first), so it is not left filed as the stand-in.
    if (options.detectIndustry && app && !options.dryRun) {
      const decision = await resolveIndustry({ name: resolvedApp.name }).catch(() => null);
      if (decision?.industry && decision.source !== 'needs-category' && decision.industry !== 'needs-category') {
        resolvedApp = { ...resolvedApp, industry: decision.industry, industrySource: decision.source };
        log.info(`category: ${decision.industry} — ${decision.detail}`);
      }
    }
    if (options.platform) {
      if (!['ios', 'webapp', 'web'].includes(options.platform)) throw new Error(`platform must be ios, webapp or web, not "${options.platform}"`);
      resolvedApp = { ...resolvedApp, platform: options.platform };
    }
    if (!resolvedApp.platform) resolvedApp = { ...resolvedApp, platform: 'ios' };
    // Screens added to an app already in the library are not identified — it
    // is the app chosen. One without a tagline yet gets one written from these
    // screens; one that has a tagline keeps it as it is.
    if (app && !String(resolvedApp.tagline || '').trim() && analyzer.usable && pickBackend(options.backend) !== 'local') {
      report(options, 'identify', `Writing a tagline for ${resolvedApp.name}`);
      try {
        const nodes = [...graph.nodes.values()].filter((node) => !node.skipPublish);
        const identity = await identifyApp(representativeFrames(nodes), {
          backend: options.backend,
          lineSets: nodes.map((node) => node.analysis.lines ?? []).filter((lines) => lines.length),
        });
        const tagline = String(identity?.tagline || '').trim();
        if (tagline) {
          resolvedApp = { ...resolvedApp, tagline };
          log.info(`tagline: ${tagline} — written for ${resolvedApp.name}, which had none`);
        }
      } catch (error) {
        log.warn(`could not write a tagline — ${String(error.message).split('\n')[0]}`);
      }
    }
    // Which app this is, once settled — found from the screens or chosen up
    // front — so the caller can look up what depends on it (an iOS app's
    // store rank) while the rest of the run goes on.
    report(options, 'identify', identified ? `This is ${resolvedApp.name}` : `Adding to ${resolvedApp.name}`, {
      app: { id: resolvedApp.appId, name: resolvedApp.name, platform: resolvedApp.platform, tagline: String(resolvedApp.tagline || '').trim() || null },
    });

    // Which dated capture this run's screens land in: an explicit --version,
    // else today — so a re-ingest on a later day lands alongside the last
    // one rather than folding into it, and the "Latest" pill on the app page
    // actually shows the new run.
    const versionId = options.dryRun ? null : resolveVersionId(resolveDataDir(options.dataDir), resolvedApp.appId, options.version);

    // Grouping runs on the finished descriptions, so it can see a journey
    // across several screens rather than judging each one alone. Screens that
    // will not be published (a Google sign-in page) are left out of the flow
    // so the journey reads straight through them.
    const ordered = [...graph.nodes.values()].filter((node) => !node.skipPublish);
    let flowGroups = [];
    /** What the last look at the tree found, shown with the finished run. */
    let treeChecks = [];
    if (visits && analyzer.usable && ordered.length >= 1) {
      // A recording says how the person moved, so the tree comes from the
      // walk itself: sections, the journeys opened from them, the journeys
      // opened from those. A model, when there is one, only renames.
      report(options, 'flows', 'Reading the journeys off the walk');
      // A tab bar is the one row that is on nearly every screen. Any bottom
      // row of labels that appears on only one screen — a product carousel, a
      // row of category chips near the bottom — is not one, and a screen that
      // only has such a row is not a section. Cleared here, before the tree
      // is built from sections.
      validateTabBars([...graph.nodes.values()]);
      const journeys = buildJourneys(visits, { actions: graph.actions });
      // With a model, the tree's final shape is settled before anything is
      // published: every journey checked to be one task (split where it is
      // not), named, and same-named siblings merged — the structure the
      // library shows is the structure that stays. Naming the journeys is a
      // short text call; the screens' words, the slow part, still follow
      // after publishing.
      const researchBackend = pickBackend(options.backend);
      let journeysNamed = false;
      if (researchBackend !== 'local' && researchBackend !== 'none') {
        const ask = (request) => complete(researchBackend, request);
        report(options, 'flows', 'AI is checking that every flow is one task');
        // An app with no tab bar (Notion's top pills) never shows the walk
        // where onboarding ends, so all of it lands in Onboarding; a long one
        // is asked, and the rest becomes the section it really is.
        try {
          await splitOnboardingTail(journeys, graph, { complete: ask, extractJson, model: options.journeyModel ?? null, actions: graph.actions, log: (message) => log.detail(message) });
        } catch (error) {
          log.warn(`could not check where onboarding ends — ${error.message.split('\n')[0]}`);
        }
        try {
          const review = await reviewStructure(journeys, graph, { complete: ask, extractJson, model: options.journeyModel ?? null, actions: graph.actions, log: (message) => log.detail(message) });
          log.info(`structure: ${review.reviewed} flow(s) checked, ${review.split} task(s) split off`);
          const lifted = liftAppTasksOutOfOnboarding(journeys, graph.actions);
          if (lifted) log.info(`structure: ${lifted} flow(s) under Onboarding were the app in use — moved to Home`);
        } catch (error) {
          log.warn(`could not check the flows — ${error.message.split('\n')[0]}`);
        }
        report(options, 'flows', 'AI is naming the flows');
        try {
          await researchTree(journeys, graph, { complete: ask, encodeImage: encodeForModel, extractJson, app: resolvedApp, vision: false, only: 'journeys', journeyModel: options.journeyModel ?? null, log: (message) => log.detail(message) });
          journeysNamed = true;
          const merged = mergeSameNamedSiblings(journeys, graph.actions, graph) + foldSmallRepeats(journeys, graph, graph.actions);
          if (merged) log.info(`structure: ${merged} repeat(s) of the same task merged`);
          const grouped = await groupIntoFeatures(journeys, graph, { complete: ask, extractJson, model: options.journeyModel ?? null, actions: graph.actions, appName: resolvedApp?.name ?? null, log: (message) => log.detail(message) }).catch(() => 0);
          if (grouped) log.info(`structure: ${grouped} feature(s) made from the flows inside them`);
          const areas = promoteAreas(journeys);
          if (areas) log.info(`structure: ${areas} app area(s) made sections of their own`);
          const renamedSections = nameBrokenSections(journeys, graph, resolvedApp?.name ?? '');
          if (renamedSections) log.info(`structure: ${renamedSections} misread section name(s) replaced`);
          if (tidyNames(journeys, graph.actions, resolvedApp?.name ?? '')) log.info('structure: names tidied — read errors fixed, same-named sections joined');
          const recategorised = settleCategories(journeys, graph);
          if (recategorised) log.info(`structure: ${recategorised} flow categor${recategorised === 1 ? 'y' : 'ies'} set from the flows' final names`);
          const issues = checkTree(journeys, graph);
          treeChecks = issues;
          log.info(issues.length ? `check: ${issues.join('; ')}` : 'check: tree is clean — no duplicates, oversized flows or unnamed screens');
        } catch (error) {
          log.warn(`could not name the flows yet — ${error.message.split('\n')[0]}; the researcher will try after publishing`);
        }
      }
      // The researcher's screen pass runs after the screens are published
      // (below), so the library shows them at once and the model's words
      // arrive a few minutes later rather than holding everything up.
      pendingResearch = { journeys, backend: researchBackend, journeysNamed };
      const nameOfKey = new Map(journeys.map((journey) => [journey.key, journey.name]));
      flowGroups = journeys.map((journey) => ({
        key: journey.key,
        name: journey.name,
        summary: journey.summary ?? null,
        category: journey.category,
        parent: journey.parent,
        nodeIds: journey.nodeIds,
        steps: journey.steps,
      }));
      log.heading('Flows');
      for (const group of flowGroups) {
        log.ok(`${group.parent ? `${nameOfKey.get(group.parent) ?? group.parent} › ` : ''}${group.name} — ${group.nodeIds.length} screen(s)`);
      }
    } else if (analyzer.usable && ordered.length >= 2) {
      report(options, 'flows', 'Grouping the screens into journeys');
      try {
        const groups = await groupIntoFlows(
          ordered.map((node) => ({
            screenType: node.analysis.screenType,
            name: node.analysis.name,
            description: node.analysis.description,
            // The tab a screen sits under names the section it belongs to.
            section: node.analysis.signals?.tabLabels?.[0] ?? null,
          })),
          { backend: options.backend },
        );
        flowGroups = groups.map((group) => ({
          name: group.name,
          category: group.category,
          parent: group.parent ?? null,
          nodeIds: group.screens.map((index) => ordered[index].id),
        }));
        log.heading('Flows');
        for (const group of flowGroups) {
          log.ok(`${group.parent ? `${group.parent} › ` : ''}${group.name} — ${group.nodeIds.length} screen(s)`);
        }
      } catch (error) {
        log.warn(`could not group into flows — ${error.message.split('\n')[0]}`);
        log.detail('screens will be filed by type instead of by journey');
      }
    }

    log.heading('Publishing');
    report(options, 'publish', 'Writing screens into the library');
    const result = await publishCrawl({
      graph,
      app: resolvedApp,
      flows: flowGroups,
      dataDir: options.dataDir,
      version: versionId,
      dryRun: options.dryRun,
      capture: captureInfo,
    });
    for (const skip of result.skipped) {
      log.blocked(`${skip.name} — not published: ${skip.reason}`);
    }

    // The screens are in. Say so now — with everything a caller needs to show
    // them — then let the model write the content while they are on screen.
    if (pendingResearch && pendingResearch.backend !== 'local' && !options.dryRun) {
      await rebuildManifest(result.dataDir);
      report(options, 'published', 'Screens are in the library; the AI is now writing the flow content', {
        result: {
          app: { id: resolvedApp.appId, name: resolvedApp.name, industry: resolvedApp.industry },
          flows: result.flows.map((flow) => ({ id: flow.id, name: flow.name, category: flow.category, screenIds: flow.screenIds, parentId: flow.parentId ?? null, summary: flow.summary ?? null })),
          screens: result.screens,
          excluded,
          skipped: result.skipped,
          capture: captureInfo,
        },
      });
      const { journeys, backend, journeysNamed } = pendingResearch;
      try {
        const outcome = await researchTree(journeys, graph, {
          only: journeysNamed ? 'screens' : null,
          tagList: readTagList(options.dataDir),
          complete: (request) => complete(backend, request),
          encodeImage: encodeForModel,
          extractJson,
          app: resolvedApp,
          vision: options.vision !== false,
          analyzer: options.analyzerLabel ?? backend,
          journeyModel: options.journeyModel ?? null,
          log: (message) => log.detail(message),
          onBatch: (done, total, batch, phase) =>
            report(
              options,
              'research',
              phase === 'journeys'
                ? 'AI is naming the journeys'
                : phase === 'done'
                  ? 'AI is saving the flow content'
                  : `AI is writing screen content — screens ${done + 1}–${Math.min(done + batch, total)} of ${total}`,
              { done, total },
            ),
        });
        for (const journey of journeys) {
          const group = flowGroups.find((candidate) => candidate.key === journey.key);
          if (group) {
            group.name = journey.name;
            group.summary = journey.summary ?? group.summary ?? null;
          }
        }
        // Corrections kept from earlier reviews go over the model's answers.
        applyRulesToGraph(graph, resolvedApp.appId, options.dataDir);
        const written = updatePublishedContent({ dataDir: options.dataDir, version: result.version, app: resolvedApp, graph, written: result.screens, flows: result.flows, flowGroups });
        log.info(`researcher: ${outcome.journeysRenamed} journey name(s), ${outcome.screensUpdated} screen(s) described in ${outcome.batches} call(s); ${written.screens} screen(s) and ${written.flows} flow(s) rewritten`);
        researched = { ...outcome, ...written };
      } catch (error) {
        log.warn(`the researcher could not run — ${error.message.split('\n')[0]}; keeping the names read off the screens`);
      }
    }
    // The check ran before the screens were named; what the researcher named
    // since is no longer "unnamed".
    treeChecks = treeChecks.flatMap((issue) => {
      if (!/still have no real name/.test(issue)) return [issue];
      const left = [...graph.nodes.values()].filter((node) => /^(other|screen)$/i.test(String(node.analysis?.name ?? '').trim())).length;
      return left ? [`${left} screen(s) still have no real name`] : [];
    });
    // The researcher may have renamed flows after the files were written:
    // the folders are put in step with the tree as it finally stands.
    if (!options.dryRun && result.version && flowGroups.length) {
      await syncFolders({ appId: resolvedApp.appId, platform: options.platform || 'ios', version: result.version, dataDir: options.dataDir }).catch((error) => log.warn(`could not line the folders up with the flows — ${error.message.split('\n')[0]}`));
      // New screens in this version: a review of what was here before no longer
      // counts, so its "reviewed" mark goes (its backups stay, for undo).
      rmSync(join(resolveDataDir(options.dataDir), '..', 'reviews', `${resolvedApp.appId}-${options.platform || 'ios'}-${result.version}`, 'reviewed.json'), { force: true });
      const marksFile = join(resolveDataDir(options.dataDir), 'reviewed.json');
      if (existsSync(marksFile)) {
        const marks = JSON.parse(readFileSync(marksFile, 'utf-8'));
        delete marks[`${resolvedApp.appId}-${options.platform || 'ios'}-${result.version}`];
        writeFileSync(marksFile, `${JSON.stringify(marks, null, 2)}\n`);
      }
      // The recording goes with the review package, so the review can take a
      // better picture of a screen from it; a clean review removes it again.
      if (options.recordingPath && existsSync(options.recordingPath)) {
        const reviewFolder = join(resolveDataDir(options.dataDir), '..', 'reviews', `${resolvedApp.appId}-${options.platform || 'ios'}-${result.version}`);
        mkdirSync(reviewFolder, { recursive: true });
        for (const entry of readdirSync(reviewFolder)) if (/^recording\./.test(entry)) rmSync(join(reviewFolder, entry), { force: true });
        copyFileSync(options.recordingPath, join(reviewFolder, `recording${extname(options.recordingPath).toLowerCase()}`));
      }
      // Ready for Claude's review: contact sheets, the screen list, the doubts.
      // Light: the screens and the check now; the frame strips and the scan wait for the review to start.
      await writeReviewPack({ appId: resolvedApp.appId, platform: options.platform || 'ios', version: result.version, dataDir: options.dataDir, light: true }).catch((error) => log.warn(`could not write the review package — ${error.message.split('\n')[0]}`));
      // The full package (frame strips, the scan, the findings) is built in the
      // background now, so it is ready by the time the review starts instead of being waited for.
      try {
        const args = [fileURLToPath(new URL('../crawl.js', import.meta.url)), 'review-prepare', '--app-id', resolvedApp.appId, '--platform', options.platform || 'ios', '--version', result.version];
        if (options.dataDir) args.push('--data-dir', options.dataDir);
        spawn(process.execPath, args, { detached: true, stdio: 'ignore' }).unref();
      } catch (error) {
        log.warn(`could not start preparing the review — ${String(error.message).split('\n')[0]}`);
      }
    }
    return {
      ...result,
      checks: treeChecks,
      app: { id: resolvedApp.appId, name: resolvedApp.name, industry: resolvedApp.industry },
      identified,
      grouped: flowGroups.length > 0,
      ingested: result.screens.length,
      duplicates,
      excluded,
      capture: captureInfo,
      timeline: timeline
        ? {
            frames: timeline.frames,
            fps: timeline.fps,
            durationSeconds: captureInfo.durationSeconds,
            dropped: timeline.dropped,
            screens: timeline.screens.map((screen) => ({
              id: screen.id,
              frame: screen.frame,
              start: screen.start,
              end: screen.end,
              holdSeconds: screen.holdSeconds,
              kind: screen.kind,
              brief: screen.brief,
              revisitOf: screen.revisitOf,
              variantOf: screen.variantOf ?? null,
              loadingEvidence: screen.loadingEvidence ?? null,
            })),
            edges: timeline.edges,
          }
        : null,
      analyzerUsable: analyzer.usable,
      researched,
      // Which analyzer actually ran, so callers can say what the results are
      // worth: "api" and "ai" carry model-written content, "local" carries
      // types and flow names from rules only.
      backend: analyzer.usable ? pickBackend(options.backend) : 'none',
    };
}


/**
 * Resumes a run that paused after capture to let the admin choose what to
 * keep — the other half of `ingestFolder`'s video path, picked up from the
 * staging dir a review-paused run left behind.
 *
 * Nothing has been classified yet at this point, which is the reason to
 * pause here rather than later: a screen the admin drops in `drop` is never
 * sent to the analyzer at all, and "automatic" (`drop` empty) costs nothing
 * extra over a run that was never paused — it is classified exactly as
 * before, and the already-tested loading/third-party-sign-in rules in
 * `ingestTimeline` are what remove the rest.
 *
 * @param {{stagingDir: string, drop?: string[], app?: object, dataDir?: string,
 *          backend?: string, platform?: string, version?: string, dryRun?: boolean,
 *          keepLoading?: boolean, vision?: boolean, analyzerLabel?: string,
 *          journeyModel?: string, authorization?: object, onProgress?: Function}} options
 */

/**
 * "Manual" review's full word on every candidate, applied to the captured
 * timeline: a kept screen named in `excludedIds` is removed; a dropped one
 * left out of it is recovered.
 *
 * A duplicate recovered in the same breath as its own hold's representative
 * is dropped is not a newly-discovered screen — it is the exact same screen
 * the segmenter already identified, just a clearer raw sample of it (the
 * review grid's own "pick the most complete duplicate" default, in
 * AdminChatbot.tsx). Handled as an ordinary recovery it would come back under
 * its own new id with none of the original's edges, overlay/revisit links,
 * or classification hints: a disconnected node the flow graph has never
 * heard of, even though it sits exactly where the original did in the walk
 * the recording took. So it is not recovered as a new screen at all — the
 * original's own record simply changes which frame it points to, keeping
 * its id and so everything already wired to that id (confirmed against a
 * real capture: a revisited, mid-journey screen kept its incoming edge, its
 * outgoing edge, and its later revisit, after swapping to a clearer
 * duplicate of itself).
 */
/**
 * Reconnects a walk's edges around every screen being dropped, so "A led to
 * B" survives even when everything between them — a whole Google sign-in
 * detour, say — is excluded. A plain filter would just delete any edge
 * touching a dropped screen, leaving its surviving neighbours with no edge
 * between them at all, as if the walk had never passed through there — the
 * same loss the quality-swap fix above exists to avoid, just for a screen
 * that is genuinely being removed rather than re-pictured.
 */
function bridgeEdges(edges, toDrop) {
  let current = edges;
  for (const id of toDrop) {
    const incoming = current.filter((edge) => edge.to === id);
    const outgoing = current.filter((edge) => edge.from === id);
    const bridged = [];
    for (const into of incoming) {
      for (const out of outgoing) {
        if (into.from === out.to) continue; // a round trip through the dropped screen, not a real next step
        bridged.push({ ...out, from: into.from });
      }
    }
    current = [...current.filter((edge) => edge.from !== id && edge.to !== id), ...bridged];
  }
  const seen = new Set();
  return current.filter((edge) => {
    const key = `${edge.from}->${edge.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function applyExclusions(timeline, candidates, excludedIds) {
  const toRecover = candidates.filter((candidate) => candidate.dropped && !excludedIds.has(candidate.id));
  const toDrop = new Set(candidates.filter((candidate) => !candidate.dropped && excludedIds.has(candidate.id)).map((candidate) => candidate.id));

  const replacementFor = new Map(); // original screen id -> the duplicate candidate standing in for it
  for (const candidate of toRecover) {
    if (candidate.kind === 'duplicate' && candidate.duplicateOf && toDrop.has(candidate.duplicateOf)) {
      replacementFor.set(candidate.duplicateOf, candidate);
    }
  }
  for (const originalId of replacementFor.keys()) toDrop.delete(originalId);

  // A screen dropped here is gone for good, not folded into a neighbour —
  // so is any screen that only existed as a later return to it, and any
  // edge either side of it; the admin asked for it removed, not merged.
  // A screen only being re-pictured, not dropped, keeps its revisits too.
  for (const screen of timeline.screens) if (screen.revisitOf && toDrop.has(screen.revisitOf)) toDrop.add(screen.id);

  let recovered = 0;
  let screens = timeline.screens
    .filter((screen) => !toDrop.has(screen.id))
    .map((screen) => {
      const replacement = replacementFor.get(screen.id);
      if (!replacement) return screen;
      recovered++;
      return { ...screen, frame: replacement.frame, print: replacement.print ?? screen.print, colors: replacement.colors ?? screen.colors };
    });
  for (const candidate of toRecover) {
    if (replacementFor.get(candidate.duplicateOf) === candidate) continue; // already re-pictured in place above, not a standalone recovery
    recovered++;
    if (candidate.reason === 'revisit') {
      // Already a fully-analysed screen, just folded into an earlier one —
      // recovering it is only a matter of no longer folding it.
      const screen = screens.find((entry) => entry.id === candidate.id);
      if (screen) screen.revisitOf = null;
      continue;
    }
    // A moment the segmenter never kept, given a screen of its own — the
    // print and colours it needs came with it in the manifest, computed at
    // capture time since no full-size frame existed for it before now to
    // compute them from.
    screens.push({
      id: candidate.id,
      frame: candidate.frame,
      start: candidate.start,
      end: Math.round((candidate.start + candidate.holdSeconds) * 100) / 100,
      holdSeconds: candidate.holdSeconds,
      brief: candidate.brief,
      kind: 'screen',
      overlay: null,
      overlayOf: null,
      loadingOf: null,
      scrolledFrom: null,
      revisitOf: null,
      visits: 1,
      flat: false,
      print: candidate.print ?? { dhash: '', ahash: '', luminance: 128, edge: 10 },
      colors: candidate.colors ?? [],
    });
  }
  // Chronological order matters downstream — flow order comes from it.
  screens = screens.sort((a, b) => a.start - b.start);
  return {
    recovered,
    timeline: { ...timeline, screens, edges: bridgeEdges(timeline.edges, toDrop) },
  };
}

export async function resumeIngest(options) {
  const staging = options.stagingDir;
  const manifestPath = join(staging, 'review.json');
  if (!existsSync(manifestPath)) {
    throw new Error('this run is no longer waiting for a decision — it may already have been resumed, or too much time passed and its captured screens were cleaned up');
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const { captureInfo, timeline: capturedTimeline, candidates } = manifest;
  const source = manifest.source;

  const analyzer = new Analyzer(options.backend);
  const graph = new ScreenGraph();
  const duplicates = [];
  const excluded = [];

  // The full-size frames already sit on disk from the capture phase — read
  // back by the same naming extractFramesAt wrote them under.
  const framesDir = join(staging, 'frames');
  const frames = [];
  if (existsSync(framesDir)) {
    for (const file of readdirSync(framesDir)) {
      const match = file.match(/^frame-(\d+)\.png$/);
      if (match) frames[Number(match[1]) - 1] = join(framesDir, file);
    }
  }

  let timeline = capturedTimeline;
  let recovered = 0;

  // "automatic": options.excluded is not even present, and the segmenter's
  // own distinct/dropped split stands exactly as captured — the same result
  // as a run that was never paused for review at all.
  //
  // "manual": options.excluded is the admin's final, explicit word on every
  // candidate they were shown, kept and dropped alike. Left unselected when
  // the segmenter had dropped it recovers that moment as a real screen —
  // the admin's whole reason for reviewing by hand instead of trusting
  // "automatic". Selected when the segmenter had kept it removes that
  // screen, the same as before this review step existed.
  if (Array.isArray(options.excluded)) {
    const excludedIds = new Set(options.excluded);
    if (!candidates) {
      // A staging dir from before this candidate list existed: fall back to
      // the narrower "remove only what was kept" behaviour it still supports.
      const cascaded = new Set(excludedIds);
      for (const screen of timeline.screens) if (screen.revisitOf && cascaded.has(screen.revisitOf)) cascaded.add(screen.id);
      timeline = {
        ...timeline,
        screens: timeline.screens.filter((screen) => !cascaded.has(screen.id)),
        edges: bridgeEdges(timeline.edges, cascaded),
      };
    } else {
      const applied = applyExclusions(timeline, candidates, excludedIds);
      timeline = applied.timeline;
      recovered = applied.recovered;
    }
  }

  const distinct = timeline.screens;
  if (!distinct.length) throw new Error('every captured screen was removed — nothing left to publish');
  report(
    options,
    'segment',
    `${distinct.length} screen${distinct.length === 1 ? '' : 's'} going forward${recovered ? `, ${recovered} recovered` : ''}`,
    { screens: distinct.length },
  );

  try {
    // The review's frames are read now, alongside the analysis, so its package is ready sooner.
    if (manifest.recording && existsSync(manifest.recording)) startPrefetch({ recording: manifest.recording, times: distinct.map((screen) => screen.start), dataDir: options.dataDir });
    const visits = await ingestTimeline({ timeline, frames, analyzer, graph, duplicates, excluded, options, captureInfo });
    if (!graph.size) throw new Error('every remaining screen was a duplicate — nothing to publish');
    return await finishIngest({ app: options.app, source, graph, visits, analyzer, duplicates, excluded, options: { ...options, recordingPath: manifest.recording ?? null }, captureInfo, timeline });
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/**
 * Three frames that between them say what the app is: the first screen after
 * any splash, something from the middle, and the last. A splash alone is a
 * colour; a home screen plus a settings page is a product.
 */
function representativeFrames(nodes) {
  const candidates = nodes.filter((node) => !['splash', 'loading', 'external_auth'].includes(node.analysis.screenType));
  const pool = candidates.length ? candidates : nodes;
  if (pool.length <= 3) return pool.map((node) => node.screenshot);
  return [pool[0], pool[Math.floor(pool.length / 2)], pool[pool.length - 1]].map((node) => node.screenshot);
}

/**
 * The recording path: every screen the segmenter found, classified with what
 * the segmenter knew about it, deduplicated, and wired into the graph with
 * the edges the recording actually walked.
 */
async function ingestTimeline({ timeline, frames, analyzer, graph, duplicates, excluded, options, captureInfo }) {
  // Every settled hold is classified and published, a later return to an
  // earlier screen included — the admin's own request, so the walk the
  // recording actually took (A → B → C → A) keeps its real final step
  // instead of that return being folded back into the first sighting.
  const distinct = timeline.screens;
  const nodeByScreen = new Map();
  const nameByScreen = new Map();
  let firstTabBarSeen = false;
  const local = pickBackend(options.backend) === 'local' && analyzer.usable;

  for (const [index, screen] of distinct.entries()) {
    const framePath = frames[screen.frame];
    const fileName = `frame ${screen.frame} at ${clock(screen.start)}`;
    if (!framePath) {
      log.warn(`${fileName} — could not be read from the video; skipped`);
      continue;
    }
    report(options, 'classify', `Reading screen ${index + 1} of ${distinct.length}`, { done: index, total: distinct.length });

    // The thumbnail already exists, so its hashes come for free and the text
    // is read once, here, for the classifier, the deduplicator and the
    // external-sign-in check alike.
    const print = { dhash: screen.print.dhash, ahash: screen.print.ahash };
    const lines = analyzer.usable ? await readText(framePath).catch(() => []) : [];
    const words = wordsOf(lines);

    const context = {
      index,
      total: distinct.length,
      isFirst: index === 0,
      brief: screen.brief,
      holdSeconds: screen.holdSeconds,
      kind: screen.kind,
      // A loading state read off a bare frame, or off the loading state that
      // followed it, is the segmenter's weaker call; readable text overrules it.
      loadingWeak: screen.loadingEvidence === 'bare' || screen.loadingEvidence === 'chain',
      loadingEvidence: screen.loadingEvidence ?? null,
      overlay: screen.overlay,
      flat: screen.flat,
      edge: screen.print.edge,
      firstTabBarScreen: false,
      overlayOfName: screen.overlayOf ? nameByScreen.get(screen.overlayOf) ?? null : null,
      scrolledFromName: screen.scrolledFrom ? nameByScreen.get(screen.scrolledFrom) ?? null : null,
      loadingOfName: null,
    };
    // The first screen with a tab bar is the app's home, whatever its content
    // rules say; later tab-bar screens are feeds and sections.
    const hasTabBar = lines.filter((line) => line.y >= 0.88 && /^[A-Za-z][A-Za-z' ]{1,13}$/.test(line.text)).length >= 3;
    if (hasTabBar && !firstTabBarSeen && screen.kind === 'screen') {
      context.firstTabBarScreen = true;
      firstTabBarSeen = true;
    }

    // A scrolled view that reads the same as the screen it scrolled from is
    // the same screen nudged a little, and is folded into it.
    if (screen.scrolledFrom && nodeByScreen.has(screen.scrolledFrom)) {
      const origin = nodeByScreen.get(screen.scrolledFrom);
      if (origin.labels.length && jaccard(words, origin.labels) >= SCROLL_DUPLICATE_TEXT) {
        origin.visits++;
        duplicates.push({ file: fileName, sameAs: origin.id, reason: 'barely scrolled' });
        nodeByScreen.set(screen.id, origin);
        log.detail(`${fileName} — same content as ${origin.id}, scrolled a little`);
        continue;
      }
    }

    const analysis = await analyzer.analyse(framePath, `Screen ${index + 1}`, {
      context,
      lines: local ? lines : undefined,
      luminance: screen.print.luminance,
      colors: screen.colors,
    });
    if (!analysis.lines) analysis.lines = lines;

    const node = graph.add({
      fingerprint: print,
      labels: words,
      screenshot: framePath,
      analysis,
      // Capture order becomes flow order: the order the screens were actually
      // walked through.
      depth: index,
      path: [],
    });
    node.capture = {
      frame: screen.frame,
      start: screen.start,
      end: screen.end,
      holdSeconds: screen.holdSeconds,
      brief: screen.brief,
      kind: screen.kind,
      overlay: screen.overlay,
      overlayOf: screen.overlayOf,
      loadingOf: screen.loadingOf,
      scrolledFrom: screen.scrolledFrom,
      visits: screen.visits,
      colors: screen.colors,
    };
    node.timelineId = screen.id;
    nodeByScreen.set(screen.id, node);
    nameByScreen.set(screen.id, analysis.name);

    // A third-party sign-in page is recognised from its text whichever
    // analyzer ran. Published like any other screen, kept exactly where the
    // recording reached it — at the admin's own request, so the user's
    // actual route through the app, hand-off to Google/Apple/Facebook
    // included, reads straight through instead of jumping a gap.
    const external = analysis.external || isExternalAuthScreen(lines.map((line) => line.text).join('\n'));
    if (external) node.analysis.screenType = 'external_auth';

    // A page still loading is a moment, not a design: it is left out of the
    // library unless --keep-loading asks for it. It stays in the graph either
    // way so the journey and the naming of what came after still read right.
    // "Still loading" here means the text pass agreed — a spinner, a blank, a
    // skeleton with at most its title. A page that had its words and was
    // fetching the rest is a screen, published with a loading state on it;
    // leaving those out is how whole checkouts went missing.
    if (analysis.screenType === 'loading' && options.keepLoading !== true) {
      node.skipPublish = true;
      node.skipReason = 'loading state — not published (pass --keep-loading to include)';
      excluded.push({ file: fileName, name: analysis.name, reason: 'loading state' });
      log.blocked(`${node.id} ${clock(screen.start)} ${analysis.name} — loading state, not published`);
      continue;
    }

    const verdict = isBlockingScreen({
      screenType: analysis.screenType,
      name: analysis.name,
      description: analysis.description,
      blocked: analysis.blocked,
      blockedReason: analysis.blockedReason,
      labels: [],
    });
    if (verdict.blocked) {
      node.blocked = true;
      node.blockedReason = verdict.reason;
    }
    const facts = [
      screen.brief ? 'brief' : null,
      screen.kind === 'overlay' ? `${screen.overlay.kind} over ${context.overlayOfName ?? screen.overlayOf}` : null,
      screen.kind === 'loading' ? 'loading' : null,
      screen.kind === 'scrolled' ? 'scrolled' : null,
      screen.visits > 1 ? `seen ${screen.visits}×` : null,
    ].filter(Boolean);
    log.ok(
      `${node.id} ${clock(screen.start)} ${analysis.name} — ${analysis.screenType}${facts.length ? dim(` (${facts.join(', ')})`) : ''}${analysis.unclassified ? dim(' (unclassified)') : ''}`,
    );
  }

  // Names that depend on a screen seen later: a loading state is named after
  // what it loaded into.
  for (const screen of distinct) {
    const node = nodeByScreen.get(screen.id);
    if (!node || !screen.loadingOf) continue;
    const targetName = nameByScreen.get(screen.loadingOf);
    if (targetName && node.analysis.screenType === 'loading') {
      node.analysis.name = `${targetName} — loading`;
      if (!node.analysis.description || /^Loading state\b/.test(node.analysis.description)) {
        node.analysis.description = node.analysis.description.replace(/^Loading state/, `Loading state of ${targetName}`);
      }
    }
  }

  // The journey: every step the recording took, including returns, and what
  // the person did to take it.
  const actions = new Map();
  for (const edge of timeline.edges) {
    const from = nodeByScreen.get(edge.from);
    const to = nodeByScreen.get(edge.to);
    if (!from || !to || from === to) continue;
    const action = describeAction(from, to, edge);
    const key = `${from.id}->${to.id}`;
    if (!actions.has(key)) actions.set(key, action);
    graph.connect(from.id, `t${edge.atSeconds}`, to.id, actionPhrase(action) || `at ${clock(edge.atSeconds)}`);
  }
  graph.actions = actions;

  if (captureInfo) captureInfo.excluded = excluded.length;

  // The walk, screen by screen, returns included as their own real steps —
  // each one maps to its own node now, not back to the screen it repeats.
  return timeline.screens
    .map((screen) => ({ screen, node: nodeByScreen.get(screen.id) ?? null }))
    .filter((visit) => visit.node);
}

/** The folder path: files in name order, deduplicated on pixels alone. */
async function ingestFiles({ staged, analyzer, graph, duplicates, excluded, options }) {
  for (const [index, stagedPath] of staged.entries()) {
    const fileName = basename(stagedPath);
    report(options, 'classify', `Reading ${fileName} (${index + 1} of ${staged.length})`, { done: index, total: staged.length });
    const print = await fingerprint(stagedPath);

    // Ingestion has no accessibility tree, so deduplication rests on the
    // image alone — which is the right call for hand-taken screenshots, where
    // two captures of one screen are usually pixel-identical anyway.
    const seen = graph.match(print, []);
    if (seen) {
      seen.visits++;
      duplicates.push({ file: fileName, sameAs: seen.id, reason: 'duplicate' });
      log.detail(`${fileName} — duplicate of ${seen.id}`);
      continue;
    }

    const analysis = await analyzer.analyse(stagedPath, titleFrom(fileName), {
      context: { index, total: staged.length, isFirst: index === 0 },
    });
    const node = graph.add({
      fingerprint: print,
      labels: wordsOf(analysis.lines ?? []),
      screenshot: stagedPath,
      analysis,
      depth: index,
      path: [],
    });

    // Published like any other screen — see the matching comment in the
    // recording path above for why.
    const external = analysis.external || isExternalAuthScreen((analysis.lines ?? []).map((line) => line.text).join('\n'));
    if (external) node.analysis.screenType = 'external_auth';

    const verdict = isBlockingScreen({
      screenType: analysis.screenType,
      name: analysis.name,
      description: analysis.description,
      blocked: analysis.blocked,
      blockedReason: analysis.blockedReason,
      labels: [],
    });
    if (verdict.blocked) {
      node.blocked = true;
      node.blockedReason = verdict.reason;
      log.blocked(`${node.id} ${analysis.name} — ${verdict.reason}`);
    } else {
      log.ok(`${node.id} ${analysis.name} — ${analysis.screenType}${analysis.unclassified ? dim(' (unclassified)') : ''}`);
    }
  }
}

/** Takes one screen id out of every flow that lists it, so a flow closes over the gap. */
function dropFromFlows(dataDir, screenId) {
  const flowsFile = join(dataDir, 'flows.json');
  if (!existsSync(flowsFile)) return;
  const doc = JSON.parse(readFileSync(flowsFile, 'utf-8'));
  let changed = false;
  for (const flow of doc.flows || []) {
    const before = flow.screenIds.length;
    flow.screenIds = flow.screenIds.filter((id) => id !== screenId);
    if (flow.screenIds.length !== before) changed = true;
  }
  if (changed) writeFileSync(flowsFile, `${JSON.stringify(doc, null, 2)}\n`);
}

/**
 * Drops tab bars that are not tab bars.
 *
 * The bottom row of recognised text is read as a tab bar, and on a home
 * screen it is one. Scrolled deep into a feed, the bottom row is a product
 * carousel — "Biryani", "MALAI KULFI", "Lay's" — and taking that as a tab
 * bar invents a section per product. A real tab bar is the same three to
 * five short labels on screen after screen, so recurrence is the test:
 *
 *   - a row of three or more distinct labels seen (with two shared) on
 *     another screen is a tab bar;
 *   - a row of two distinct labels is kept only as a degraded reading of a
 *     recurring row that contains both — OCR missed an item;
 *   - when the recording shows no recurring row at all (a short clip), a
 *     single row shaped like a tab bar is trusted;
 *   - everything else is cleared, and a screen typed "home" or "feed" on
 *     the strength of it becomes a category page.
 */
export function validateTabBars(nodes) {
  if (nodes.length < 3) return;
  const lower = (label) => String(label).toLowerCase();
  const rows = nodes.map((node) => ({ node, labels: [...new Set((node.analysis?.signals?.tabLabels ?? []).map(lower))] })).filter((entry) => entry.labels.length >= 1);
  const shared = (a, b) => a.labels.filter((label) => b.labels.includes(label)).length;
  const full = rows.filter((entry) => entry.labels.length >= 3);
  const recurring = new Set(full.filter((entry) => full.some((other) => other !== entry && shared(entry, other) >= 2)));
  const shaped = (entry) =>
    entry.labels.length >= 3 && entry.labels.length <= 5 && entry.labels.every((label) => label.length <= 10 && label.split(' ').length <= 2);

  for (const entry of rows) {
    let keep = false;
    if (recurring.has(entry)) keep = true;
    else if (entry.labels.length === 2) keep = [...recurring].some((other) => shared(entry, other) === 2);
    else if (!recurring.size) keep = shaped(entry);
    if (keep) continue;

    const analysis = entry.node.analysis;
    analysis.signals.tabLabels = [];
    analysis.signals.tabBar = false;
    analysis.elements = (analysis.elements ?? []).filter((e) => e !== 'tab-bar');
    if (['home', 'feed', 'dashboard'].includes(analysis.screenType)) analysis.screenType = 'category';
    if (/ home$/.test(analysis.name)) analysis.name = analysis.name.replace(/ home$/, '');
  }
}

/** Lower-cased words of the recognised text, for overlap comparisons. */
function wordsOf(lines) {
  return [...new Set(lines.flatMap((line) => String(line.text || '').toLowerCase().split(/[^a-z0-9]+/)).filter((w) => w.length >= 3))];
}

function clock(seconds) {
  const whole = Math.floor(Number(seconds) || 0);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** "IMG_4471.PNG" → "Img 4471", a placeholder until something classifies it. */
function titleFrom(fileName) {
  const base = basename(fileName, extname(fileName)).replace(/[-_]+/g, ' ').trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1).toLowerCase() : 'Screen';
}

/** App name → the slug used for its folder, its URL and its id. */
export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

/**
 * Works out which app a set of frames belongs to, so an upload does not have to
 * be preceded by a form.
 *
 * With a model, the frames are shown to it. Without one, the app's own screens
 * are searched for its name — "Acme Terms of Use", "Welcome to Acme" — which
 * is a guess and is labelled as one. Failing both, the source file's own name
 * is used: wrong, but visible and editable afterwards, which beats refusing
 * the upload.
 */
/** The apps already in the store (apps.json), or none when there is no store yet. */
/** The library's shared tag list (tags.json), which screens' tags are chosen from; empty when there is none. */
function readTagList(dataDirOption) {
  try {
    const doc = JSON.parse(readFileSync(join(resolveDataDir(dataDirOption), 'tags.json'), 'utf-8'));
    return (doc.tags || []).map((tag) => (typeof tag === 'string' ? tag : tag?.slug)).filter(Boolean);
  } catch {
    return [];
  }
}

function readStoredApps(dataDirOption) {
  try {
    const file = join(resolveDataDir(dataDirOption), 'apps.json');
    if (!existsSync(file)) return [];
    const doc = JSON.parse(readFileSync(file, 'utf-8'));
    return Array.isArray(doc.apps) ? doc.apps : [];
  } catch {
    return [];
  }
}

async function identifyFrom(frames, sourcePath, backend, existingApps, lineSets = [], lookup = {}) {
  const fallback = async () => {
    const guess = titleFrom(basename(sourcePath));
    const appId = slugify(guess) || 'untitled-app';

    // The recording is named after an app that is already in the library: it is that
    // app. Keep everything recorded for it — publishing writes this record over the
    // stored one, so a bare guess here would wipe its category, tagline and website.
    const existing = existingApps?.find((app) => app.id === appId);
    if (existing?.industry && existing.industry !== 'unsorted') {
      log.info(`category: ${existing.industry} — already recorded for this app`);
      return {
        name: existing.name ?? guess,
        appId,
        industry: existing.industry,
        industrySource: existing.industrySource ?? 'manual',
        tagline: existing.tagline ?? '',
        website: existing.website ?? '',
        confident: false,
        detected: false,
      };
    }

    // The model could not say what the app is, but the file name usually can
    // ("linkedIn.mp4"). The App Store settles it only when a listing clearly carries
    // that name; otherwise the app is left as "Needs category" for a person to set.
    const decision = await resolveIndustry({ name: guess }, lookup);
    log.info(`category: ${decision.industry} — ${decision.detail}${decision.source === 'store' ? ' (looked up from the recording’s file name)' : ''}`);
    return {
      name: guess,
      appId,
      industry: decision.industry,
      industrySource: decision.source,
      tagline: '',
      website: '',
      confident: false,
      detected: false,
    };
  };

  if (backend === 'none') return fallback();

  try {
    const identity = await identifyApp(frames, { backend, lineSets });
    const appId = slugify(identity.name) || 'untitled-app';

    // An app already in the library keeps its recorded name and industry —
    // a second upload should add screens to it, not rename it.
    const existing = existingApps?.find((app) => app.id === appId);
    // A category somebody (or an earlier run) already settled on is kept; an
    // app still marked `unsorted` gets another go at it.
    const keepExisting = existing?.industry && existing.industry !== 'unsorted';
    const decision = keepExisting
      ? { industry: existing.industry, source: existing.industrySource ?? 'manual', detail: 'already recorded for this app' }
      : await resolveIndustry({ name: existing?.name ?? identity.name, ai: { industry: identity.industry, confident: identity.confident } }, lookup);
    log.info(`category: ${decision.industry} — ${decision.detail}`);
    return {
      name: existing?.name ?? identity.name,
      appId,
      industry: decision.industry,
      industrySource: decision.source,
      tagline: existing?.tagline || identity.tagline,
      website: existing?.website || identity.website,
      confident: identity.confident,
      detected: true,
      evidence: identity.evidence ?? null,
    };
  } catch (error) {
    // The local analyzer says outright that it cannot recognise a brand, which
    // is expected rather than a failure — don't cry wolf about it.
    if (!/local analyzer cannot identify/.test(error.message)) {
      log.warn(`could not identify the app — ${error.message.split('\n')[0]}`);
    }
    return fallback();
  }
}

// ─── classify ────────────────────────────────────────────────────────────────

/**
 * Analyses screens already in the store and writes their sidecars and analysis
 * records. Safe to re-run: by default it skips anything already classified.
 *
 * Reads both layouts — loose files and flow folders — so a library captured
 * from recordings can be reclassified when the rules improve.
 *
 * @param {{appId: string, platform?: string, dataDir?: string, backend?: string,
 *          overwrite?: boolean, removeExternal?: boolean, dryRun?: boolean}} options
 */
export async function classifyStored(options) {
  const dataDir = resolveDataDir(options.dataDir);
  const platform = options.platform || 'ios';
  const appDir = join(dataDir, 'screens', platform, options.appId);
  if (!existsSync(appDir)) throw new Error(`no screens stored at ${appDir}`);

  const analysisDir = join(dataDir, 'analysis');
  // Every level, dated captures included (versions/<date>/<flow>/<n>.png).
  const images = [];
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(join(appDir, dir), { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isFile() && READABLE.includes(extname(entry.name).toLowerCase())) images.push(rel);
      else if (entry.isDirectory()) walk(join(dir, entry.name), rel);
    }
  };
  walk('', '');
  images.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!images.length) throw new Error(`no images in ${appDir}`);

  const analyzer = new Analyzer(options.backend);
  const staging = mkdtempSync(join(tmpdir(), 'motvin-classify-'));
  const results = [];

  try {
    if (!options.dryRun) mkdirSync(analysisDir, { recursive: true });

    log.heading(`Classifying ${images.length} screen(s) in ${platform}/${options.appId}`);

    for (const [index, image] of images.entries()) {
      const withoutExt = image.slice(0, image.length - extname(image).length);
      const base = basename(image, extname(image));
      const sidecarPath = join(appDir, `${withoutExt}.json`);
      const screenId = `${options.appId}-${platform}-${withoutExt.split('/').join('-')}`;

      const existing = existsSync(sidecarPath) ? JSON.parse(readFileSync(sidecarPath, 'utf-8')) : null;
      if (existing?.screenType && existing.screenType !== 'other' && !options.overwrite) {
        log.detail(`${withoutExt} — already classified as "${existing.screenType}", skipping`);
        results.push({ screenId, skipped: true, screenType: existing.screenType });
        continue;
      }

      const staged = await stage(join(appDir, image.includes('/') ? image.split('/')[0] : ''), basename(image), staging);
      const analysis = await analyzer.analyse(staged, titleFrom(base), {
        context: { index, total: images.length, isFirst: index === 0 },
      });

      if (analysis.unclassified) {
        results.push({ screenId, failed: true });
        continue;
      }

      // A third-party sign-in page is published like any other screen by
      // default, same as a fresh ingest — --remove-external asks for the
      // old behaviour instead, for whoever still wants these out.
      const external = analysis.external || isExternalAuthScreen((analysis.lines ?? []).map((line) => line.text).join('\n'));
      if (external) {
        if (options.removeExternal === true) {
          const reason = typeof external === 'string' ? external : external.reason;
          if (!options.dryRun) {
            rmSync(join(appDir, image), { force: true });
            rmSync(sidecarPath, { force: true });
            rmSync(join(analysisDir, `${screenId}.json`), { force: true });
            dropFromFlows(dataDir, screenId);
          }
          log.blocked(`${withoutExt} — ${reason}; removed from the store`);
          results.push({ screenId, removed: true, reason });
          continue;
        }
        analysis.screenType = 'external_auth';
      }

      const publishedType = publishedTypeFor(analysis.screenType);
      const states = [...new Set([...(analysis.states ?? []), stateFor(analysis.screenType)].filter(Boolean))];
      const sidecar = {
        ...(existing || {}),
        name: analysis.name,
        screenType: publishedType,
        fineType: analysis.screenType,
        states,
        description: analysis.description || existing?.description || '',
        tags: [...new Set([...(analysis.tags || []), analysis.screenType.replace(/_/g, '-'), ...states, platform])].slice(0, 14),
        elements: analysis.elements,
        style: filterStyles(analysis.style),
        capturedAt: existing?.capturedAt || localDateString(),
      };

      const verdict = isBlockingScreen({
        screenType: analysis.screenType,
        name: analysis.name,
        description: analysis.description,
        blocked: analysis.blocked,
        blockedReason: analysis.blockedReason,
        labels: [],
      });

      const record = {
        screenId,
        screen_id: screenId,
        analyzer: analysis.viaHeuristics ? 'motvin on-device (Vision OCR + rules)' : analysis.analyzer ?? 'claude',
        analyzedAt: new Date().toISOString(),
        screen_type: analysis.screenType,
        published_as: publishedType,
        states,
        category: analysis.category,
        flow: analysis.flow,
        name: analysis.name,
        description: analysis.description,
        tags: sidecar.tags,
        elements: analysis.elements,
        style: sidecar.style,
        sections: (await import('./heuristics.js')).buildSections({ analysis, capture: existing?.capture ?? null, flow: null }),
        palette: [],
        signals: analysis.signals ?? null,
        blocked: verdict.blocked,
        blocked_reason: verdict.reason,
        capturedAt: sidecar.capturedAt,
        capturedBy: 'motvin-ios-crawler/classify',
      };

      if (!options.dryRun) {
        writeFileSync(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`);
        writeFileSync(join(analysisDir, `${screenId}.json`), `${JSON.stringify(record, null, 2)}\n`);
      }

      log.ok(`${withoutExt} → ${analysis.screenType}${publishedType !== analysis.screenType ? dim(` (published as ${publishedType})`) : ''} — ${analysis.name}`);
      results.push({ screenId, screenType: analysis.screenType, publishedType });
    }

    const done = results.filter((result) => result.screenType && !result.skipped).length;
    const failed = results.filter((result) => result.failed).length;
    const removed = results.filter((result) => result.removed).length;
    if (failed) log.warn(`${failed} screen(s) could not be analysed`);
    if (removed) log.info(`${removed} third-party sign-in screen(s) removed from the store`);

    return { dataDir, appDir, classified: done, failed, removed, results, analyzerUsable: analyzer.usable };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

// ─── research ────────────────────────────────────────────────────────────────

/**
 * Re-runs the researcher over an app already in the store.
 *
 * The tree is rebuilt from flows.json (parents, steps, actions) and the
 * screens from their stored files and sidecars — the text read again from
 * the images — so a library captured before a model was available, or with a
 * weaker one, gets its words rewritten without a new recording. Structure is
 * not touched: this cannot fix a wrong section or a missing journey, only
 * what things are called and how they are described.
 *
 * @param {{appId: string, platform?: string, dataDir?: string, backend?: string, vision?: boolean, dryRun?: boolean}} options
 */
export async function researchStored(options) {
  const dataDir = resolveDataDir(options.dataDir);
  const platform = options.platform || 'ios';
  const appDir = join(dataDir, 'screens', platform, options.appId);
  if (!existsSync(appDir)) throw new Error(`no screens stored at ${appDir}`);
  const backend = pickBackend(options.backend);
  if (backend === 'local' || backend === 'none') throw new Error('research needs a model backend — set up Ollama or MOTVIN_AI_URL, or pass --backend');

  const flowsDoc = JSON.parse(readFileSync(join(dataDir, 'flows.json'), 'utf-8'));
  // One version at a time when asked: its flows and its screens, nothing of the others.
  const versionTag = options.version ? `${options.appId}-${platform}-versions-${options.version}-` : null;
  const inScope = (flow) => flow.appId === options.appId && flow.platform === platform && (!versionTag || `${flow.id}-`.startsWith(versionTag) || (flow.screenIds ?? []).some((id) => id.startsWith(versionTag)));
  const flows = (flowsDoc.flows || []).filter(inScope);
  if (!flows.length) throw new Error(`no flows stored for ${options.appId}`);
  const appsDoc = JSON.parse(readFileSync(join(dataDir, 'apps.json'), 'utf-8'));
  const app = (appsDoc.apps || []).find((entry) => entry.id === options.appId) ?? { id: options.appId, name: options.appId };

  // Screens, with their text read again.
  const graph = new ScreenGraph();
  const nodeByScreenId = new Map();
  // Every level: a dated capture keeps its screens under
  // versions/<date>/ and versions/<date>/<flow>/, not just one folder down.
  const files = [];
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(join(appDir, dir), { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isFile() && READABLE.includes(extname(entry.name).toLowerCase())) files.push(rel);
      else if (entry.isDirectory()) walk(join(dir, entry.name), rel);
    }
  };
  walk(options.version ? join('versions', options.version) : '', options.version ? `versions/${options.version}` : '');
  log.heading(`Reading ${files.length} stored screen(s) of ${app.name}${options.version ? `, version ${options.version}` : ''}`);
  for (const file of files) {
    const withoutExt = file.slice(0, file.length - extname(file).length);
    const screenId = `${options.appId}-${platform}-${withoutExt.split('/').join('-')}`;
    const sidecarPath = join(appDir, `${withoutExt}.json`);
    const sidecar = existsSync(sidecarPath) ? JSON.parse(readFileSync(sidecarPath, 'utf-8')) : {};
    const imagePath = join(appDir, file);
    const lines = await readText(imagePath).catch(() => []);
    const analysis = classifyLines(lines, sidecar);
    const node = graph.add({ fingerprint: { dhash: '', ahash: '' }, labels: wordsOf(lines), screenshot: imagePath, analysis });
    node.screenId = screenId;
    node.sidecarPath = sidecarPath;
    node.sidecar = sidecar;
    nodeByScreenId.set(screenId, node);
  }

  // The tree, from the store.
  const journeys = flows.map((flow) => ({
    key: flow.id,
    name: flow.name,
    category: flow.category,
    parent: flow.parentId ?? null,
    section: !flow.parentId,
    nodeIds: flow.screenIds.map((id) => nodeByScreenId.get(id)?.id).filter(Boolean),
    steps: (flow.steps ?? flow.screenIds.map((id) => ({ screenId: id, action: null })))
      .map((step) => ({ nodeId: nodeByScreenId.get(step.screenId)?.id, action: step.action }))
      .filter((step) => step.nodeId),
  }));

  // The moves between screens, as the stored steps recorded them — what the
  // structure pass keeps on a flow it splits or merges.
  const actions = new Map();
  for (const journey of journeys) {
    for (const [at, step] of journey.steps.entries()) {
      if (at > 0 && step.action) actions.set(`${journey.steps[at - 1].nodeId}->${step.nodeId}`, step.action);
    }
  }
  const ask = (request) => complete(backend, request);
  // The structure a recording gets today, for screens stored before it:
  // every flow checked to be one task (split where it is not), named, the
  // same task walked twice merged, and each flow filed by what it does.
  if (options.restructure) {
    log.heading('Checking the flows');
    await splitOnboardingTail(journeys, graph, { complete: ask, extractJson, model: options.journeyModel ?? null, actions, log: (message) => log.detail(message) });
    const review = await reviewStructure(journeys, graph, { complete: ask, extractJson, model: options.journeyModel ?? null, actions, log: (message) => log.detail(message) });
    log.info(`structure: ${review.reviewed} flow(s) checked, ${review.split} task(s) split off`);
    const lifted = liftAppTasksOutOfOnboarding(journeys, actions);
    if (lifted) log.info(`structure: ${lifted} flow(s) under Onboarding were the app in use — moved to Home`);
  }

  log.heading('Researching');
  const outcome = await researchTree(journeys, graph, {
    complete: ask,
    tagList: readTagList(options.dataDir),
    encodeImage: encodeForModel,
    extractJson,
    app,
    vision: options.vision !== false,
    analyzer: options.analyzerLabel ?? backend,
    journeyModel: options.journeyModel ?? null,
    log: (message) => log.detail(message),
    only: options.only ?? null,
  });
  log.info(`researcher: ${outcome.journeysRenamed} journey name(s), ${outcome.screensUpdated} screen(s) described in ${outcome.batches} call(s)`);
  // Corrections kept from earlier reviews go over the model's answers.
  applyRulesToGraph(graph, options.appId, options.dataDir);

  let flowsChanged = 0;
  if (options.restructure) {
    const merged = mergeSameNamedSiblings(journeys, actions, graph) + foldSmallRepeats(journeys, graph, actions);
    if (merged) log.info(`structure: ${merged} repeat(s) of the same task merged`);
    const grouped = await groupIntoFeatures(journeys, graph, { complete: ask, extractJson, model: options.journeyModel ?? null, actions, appName: app.name, log: (message) => log.detail(message) }).catch(() => 0);
    if (grouped) log.info(`structure: ${grouped} feature(s) made from the flows inside them`);
    const areas = promoteAreas(journeys);
    if (areas) log.info(`structure: ${areas} app area(s) made sections of their own`);
    const renamedSections = nameBrokenSections(journeys, graph, app.name);
    if (renamedSections) log.info(`structure: ${renamedSections} misread section name(s) replaced`);
    if (tidyNames(journeys, actions, app.name)) log.info('structure: names tidied — read errors fixed, same-named sections joined');
    const recategorised = settleCategories(journeys, graph);
    if (recategorised) log.info(`structure: ${recategorised} flow categor${recategorised === 1 ? 'y' : 'ies'} set from the flows' final names`);
    // The app's flows on this platform are replaced by the tree as it now
    // stands; every other app's flows stay exactly as they were.
    const screenIdOf = (nodeId) => graph.get(nodeId)?.screenId;
    const rebuilt = journeys
      .map((journey) => {
        const screenIds = journey.nodeIds.map(screenIdOf).filter(Boolean);
        return {
          id: journey.key,
          appId: options.appId,
          name: journey.name,
          ...(journey.summary ? { summary: journey.summary } : {}),
          category: journey.category,
          platform,
          screenIds,
          parentId: journey.parent ?? null,
          steps: (journey.steps ?? []).map((step) => ({ screenId: screenIdOf(step.nodeId), action: step.action ?? null })).filter((step) => step.screenId),
        };
      })
      .filter((flow) => flow.screenIds.length);
    const kept = new Set(rebuilt.map((flow) => flow.id));
    // A parent that went away (merged into another) leaves its children at the top.
    for (const flow of rebuilt) if (flow.parentId && !kept.has(flow.parentId)) flow.parentId = null;
    const issues = checkTree(journeys, graph);
    log.info(issues.length ? `check: ${issues.join('; ')}` : 'check: tree is clean — no duplicates, oversized flows or unnamed screens');
    const printTree = (parentId, depth) => {
      for (const flow of rebuilt.filter((entry) => (entry.parentId ?? null) === parentId)) {
        log.ok(`${'  '.repeat(depth)}${flow.name}${dim(` — ${flow.screenIds.length} screen${flow.screenIds.length === 1 ? '' : 's'}, ${flow.category}`)}`);
        printTree(flow.id, depth + 1);
      }
    };
    printTree(null, 0);
    for (const flow of rebuilt) {
      const before = flows.find((entry) => entry.id === flow.id);
      if (!before || before.name !== flow.name || before.category !== flow.category || before.parentId !== flow.parentId || before.screenIds.join() !== flow.screenIds.join()) flowsChanged++;
    }
    flowsChanged += flows.filter((flow) => !kept.has(flow.id)).length;
    const others = (flowsDoc.flows || []).filter((flow) => !inScope(flow));
    flowsDoc.flows = [...others, ...rebuilt];
  }
  // Write back: flow names and summaries, screen names, descriptions,
  // purposes and primary actions, and the analysis records' text.
  for (const journey of options.restructure ? [] : journeys) {
    const flow = flows.find((entry) => entry.id === journey.key);
    if (!flow) continue;
    if (flow.name !== journey.name || (journey.summary && flow.summary !== journey.summary)) flowsChanged++;
    flow.name = journey.name;
    if (journey.summary) flow.summary = journey.summary;
    log.ok(`${flow.parentId ? '  ' : ''}${flow.name}${flow.summary ? dim(` — ${flow.summary}`) : ''}`);
  }
  let screensChanged = 0;
  const analysisDir = join(dataDir, 'analysis');
  for (const node of graph.nodes.values()) {
    if (node.analysis.viaHeuristics !== false) continue;
    screensChanged++;
    // The model's type from the screenshot, else the name's for an "other".
    const settled = settledType({ classified: node.sidecar.screenType, modelType: node.analysis.modelType, name: node.analysis.name });
    const namedType = settled !== node.sidecar.screenType ? settled : null;
    const sidecar = {
      ...node.sidecar,
      ...(namedType ? { screenType: namedType } : {}),
      ...(node.analysis.modelElements?.length ? { elements: node.analysis.modelElements } : {}),
      ...(Array.isArray(node.analysis.modelExtraTypes) ? { extraTypes: node.analysis.modelExtraTypes.filter((t) => t !== (namedType ?? node.sidecar.screenType)) } : {}),
      ...(Array.isArray(node.analysis.modelTags) ? { tags: node.analysis.modelTags } : {}),
      name: node.analysis.name,
      description: node.analysis.description || node.sidecar.description || '',
      ...(node.analysis.purpose ? { purpose: node.analysis.purpose } : {}),
      ...(node.analysis.primaryAction ? { primaryAction: node.analysis.primaryAction } : {}),
    };
    if (!options.dryRun) {
      writeFileSync(node.sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`);
      const recordPath = join(analysisDir, `${node.screenId}.json`);
      if (existsSync(recordPath)) {
        const record = JSON.parse(readFileSync(recordPath, 'utf-8'));
        record.name = sidecar.name;
        if (namedType) record.published_as = namedType;
        record.description = sidecar.description;
        record.purpose = node.analysis.purpose ?? record.purpose ?? null;
        record.primary_action = node.analysis.primaryAction ?? record.primary_action ?? null;
        record.analyzer = node.analysis.analyzer ?? record.analyzer;
        record.analyzedAt = new Date().toISOString();
        writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
      }
    }
  }
  if (!options.dryRun) writeFileSync(join(dataDir, 'flows.json'), `${JSON.stringify(flowsDoc, null, 2)}\n`);
  return { dataDir, flowsChanged, screensChanged, outcome };
}

// ─── describe ────────────────────────────────────────────────────────────────

/**
 * How a single added screenshot is named: the researcher's naming rules, for
 * one screen with no journey around it. Kept short on purpose — under the
 * researcher's full brief a small model (qwen3-vl:2b) reasons until its
 * reply runs out and answers nothing.
 */
const DESCRIBE_RULES = `You are a UX researcher naming one app screen for a design-reference library.
You are given one screenshot of an app, with the text read off it and a machine guess at its type. Return JSON only — no prose, no markdown fence — in exactly this shape:
{ "name": "...", "purpose": "...", "primaryAction": "..." }

The name is a short plain noun a designer would file the screen under — "Splash screen", "Phone number entry", "Restaurant detail", "Filter sheet", "Order placed" — never the marketing line or a fragment of visible text, a product, dish or brand name. A purpose is one short sentence (under 15 words) on what the screen is for. The primary action is the one thing the person mostly does there, as a short imperative — "Enter mobile number", "Add to cart" — or "" when there is none (a splash, a loading state). Only say what the screenshot supports. Every field is one line.`;

/**
 * Fills in what a screenshot added by hand (the admin's "Add screens") is
 * missing, the way a recording's screens get it: the on-device rules read
 * its text and decide its type, states, UI elements, style and tags, and —
 * when a model is set up — the model names it and writes its purpose and
 * primary action. A type the admin picked when adding it is kept; so are its
 * place in the order and anything else already in its sidecar.
 *
 * `files` are paths under the app's folder, at any depth — a dated version's
 * screens live under `versions/<date>/` (and a flow folder), which the older
 * `classifyStored` walk doesn't reach.
 *
 * @param {{appId: string, platform?: string, files: string[], dataDir?: string, backend?: string, dryRun?: boolean}} options
 */
export async function describeStored(options) {
  const dataDir = resolveDataDir(options.dataDir);
  const platform = options.platform || 'ios';
  const appDir = join(dataDir, 'screens', platform, options.appId);
  if (!existsSync(appDir)) throw new Error(`no screens stored at ${appDir}`);
  const files = (options.files ?? []).map((file) => String(file).replace(/^\/+/, ''));
  for (const file of files) {
    if (file.split('/').includes('..') || !READABLE.includes(extname(file).toLowerCase())) throw new Error(`not a stored screenshot: ${file}`);
    if (!existsSync(join(appDir, file))) throw new Error(`no such screen: ${platform}/${options.appId}/${file}`);
  }
  if (!files.length) throw new Error('no screens given — pass --files');

  // The rules always run; the model writes the words when one answers.
  const backend = await resolveBackend(options.backend);
  const probe = backend === 'local' ? { usable: false } : await probeAnalyzer(backend);
  const modelBackend = probe.usable ? backend : null;
  const analyzer = new Analyzer(modelBackend ?? 'local');
  const appsDoc = existsSync(join(dataDir, 'apps.json')) ? JSON.parse(readFileSync(join(dataDir, 'apps.json'), 'utf-8')) : { apps: [] };
  const app = (appsDoc.apps || []).find((entry) => entry.id === options.appId) ?? { id: options.appId, name: options.appId };
  log.info(modelBackend ? `naming with ${probe.provider ?? modelBackend} / ${probe.model ?? ''}`.trim() : 'naming from the on-device rules (no model answering)');

  const analysisDir = join(dataDir, 'analysis');
  const staging = mkdtempSync(join(tmpdir(), 'motvin-describe-'));
  const results = [];
  try {
    if (!options.dryRun) mkdirSync(analysisDir, { recursive: true });
    log.heading(`Describing ${files.length} added screen(s) of ${app.name}`);
    for (const [index, file] of files.entries()) {
      const withoutExt = file.slice(0, file.length - extname(file).length);
      const sidecarPath = join(appDir, `${withoutExt}.json`);
      const screenId = `${options.appId}-${platform}-${withoutExt.split('/').join('-')}`;
      const existing = existsSync(sidecarPath) ? JSON.parse(readFileSync(sidecarPath, 'utf-8')) : {};
      const folder = join(appDir, file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '');
      const staged = await stage(folder, basename(file), staging);
      const analysis = await analyzer.analyse(staged, titleFrom(basename(file)), { context: { index, total: files.length, isFirst: false } });
      if (analysis.unclassified) {
        results.push({ screenId, failed: true });
        continue;
      }

      // The admin's pick wins over the rules' guess.
      const chosenType = existing.screenType && existing.screenType !== 'other' ? existing.screenType : null;
      const publishedType = chosenType ?? publishedTypeFor(analysis.screenType);
      const fineType = chosenType ? (existing.fineType ?? chosenType) : analysis.screenType;
      const states = [...new Set([...(analysis.states ?? []), stateFor(fineType)].filter(Boolean))];

      // Its name if it has one (given by hand, or a run before this one); else the rules' — for the type they guessed,
      // so under a type the admin chose instead, that type's label is the better stand-in.
      const overruled = Boolean(chosenType) && publishedTypeFor(analysis.screenType) !== chosenType;
      let name = existing.name || (overruled ? labelFor(chosenType) : analysis.name);
      let purpose = existing.purpose ?? null;
      let primaryAction = existing.primaryAction ?? null;
      if (modelBackend) {
        try {
          const lines = (analysis.lines ?? []).map((line) => line.text).filter(Boolean).slice(0, 30).join(' · ');
          // A Qwen3 model reasons first whatever the API says, and can spend the whole reply on it: `/no_think` (its own
          // switch) and room to spare are what get an answer back. The prompt is kept to the facts — even an app's
          // tagline was enough to send qwen3-vl:2b off reasoning.
          const noThink = /qwen3/i.test(probe.model ?? '') ? '\n/no_think' : '';
          const image = await encodeForModel(staged);
          const facts = `App: ${app.name}\nType: ${fineType.replace(/_/g, ' ')}\nGuessed name: "${name}"`;
          const ask = (text, maxTokens, json = true) =>
            complete(modelBackend, { system: DESCRIBE_RULES, blocks: [{ type: 'image', base64: image }, { type: 'text', text: `${text}${noThink}` }], maxTokens, json });
          // How long it reasons varies a lot run to run (qwen3-vl:2b: 4k–11k characters for the same screen), so: room to
          // spare, then once without Ollama's JSON mode (which it reasons longer under), then the most room.
          const reply = await ask(`${facts}\nText on the screen: ${lines.slice(0, 700) || '(none)'}`, 6000)
            .catch(() => ask(facts, 6000, false))
            .catch(() => ask(facts, 8000));
          const proposal = extractJson(reply) ?? {};
          const tidy = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max).trim();
          const proposedName = tidy(proposal.name, 48);
          if (proposedName && !/^(screen|image|screenshot|untitled)$/i.test(proposedName)) name = proposedName;
          purpose = tidy(proposal.purpose, 200) || purpose;
          primaryAction = tidy(proposal.primaryAction, 60) || primaryAction;
        } catch (error) {
          log.warn(`${withoutExt}: the model could not name it (${error.message.split('\n')[0]}) — keeping the rules' name`);
        }
      }

      // Its own style first; a dark/light tag already there (the store tags one on upload) isn't contradicted by the rules'.
      const ownStyle = Array.isArray(existing.style) ? existing.style : [];
      const toned = ownStyle.some((tag) => tag === 'dark' || tag === 'light');
      const style = [...new Set([...ownStyle, ...filterStyles(analysis.style).filter((tag) => !(toned && (tag === 'dark' || tag === 'light')))])];
      const sidecar = {
        ...existing,
        name,
        screenType: publishedType,
        fineType,
        states,
        // The rules describe the type they guessed ("Other screen. Dark theme."): under a chosen type, said as that type.
        description:
          existing.description ||
          (overruled ? (analysis.description || '').replace(/^[^.]*\bscreen\./i, `${labelFor(chosenType)} screen.`) : analysis.description) ||
          '',
        ...(purpose ? { purpose } : {}),
        ...(primaryAction ? { primaryAction } : {}),
        tags: [
          ...new Set([
            ...(analysis.tags || []).filter((tag) => !(overruled && (tag === analysis.screenType.replace(/_/g, '-') || tag === publishedTypeFor(analysis.screenType)))),
            fineType.replace(/_/g, '-'),
            ...states,
            platform,
          ]),
        ].slice(0, 14),
        elements: analysis.elements,
        style,
        capturedAt: existing.capturedAt || localDateString(),
      };
      const verdict = isBlockingScreen({ screenType: fineType, name, description: sidecar.description, blocked: analysis.blocked, blockedReason: analysis.blockedReason, labels: [] });
      const record = {
        screenId,
        screen_id: screenId,
        analyzer: modelBackend ? `${probe.provider ?? modelBackend}/${probe.model ?? ''} + on-device rules` : 'motvin on-device (Vision OCR + rules)',
        analyzedAt: new Date().toISOString(),
        screen_type: fineType,
        published_as: publishedType,
        states,
        category: analysis.category,
        flow: analysis.flow,
        name,
        description: sidecar.description,
        purpose,
        primary_action: primaryAction,
        tags: sidecar.tags,
        elements: analysis.elements,
        style,
        sections: (await import('./heuristics.js')).buildSections({ analysis, capture: existing.capture ?? null, flow: null }),
        palette: [],
        signals: analysis.signals ?? null,
        blocked: verdict.blocked,
        blocked_reason: verdict.reason,
        capturedAt: sidecar.capturedAt,
        capturedBy: 'motvin-ios-crawler/describe',
      };
      if (!options.dryRun) {
        writeFileSync(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`);
        writeFileSync(join(analysisDir, `${screenId}.json`), `${JSON.stringify(record, null, 2)}\n`);
      }
      log.ok(`${withoutExt} → ${publishedType}${chosenType ? dim(' (as chosen)') : ''} — ${name}${purpose ? dim(` · ${purpose}`) : ''}`);
      results.push({ screenId, screenType: publishedType, name });
    }
    const described = results.filter((result) => !result.failed).length;
    return { dataDir, described, failed: results.length - described, results, named: Boolean(modelBackend) };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/** A stored screen's analysis, from its sidecar and freshly read text. */
function classifyLines(lines, sidecar) {
  return {
    screenType: sidecar.fineType || sidecar.screenType || 'other',
    name: sidecar.name || 'Screen',
    description: sidecar.description || '',
    tags: sidecar.tags || [],
    elements: sidecar.elements || [],
    style: sidecar.style || [],
    states: sidecar.states || [],
    lines,
    signals: {
      tabLabels: [],
      chipLabels: [],
      ctas: [],
      title: null,
      headline: null,
      keyboard: false,
      lineCount: lines.length,
    },
    viaHeuristics: true,
  };
}

/** Exported for the self-test. */
export const _internals = { identifyFrom, readStoredApps, listImages, titleFrom, unclassified, PUBLISHED_TYPES, wordsOf, labelFor, isPublishable, fingerprintFromThumb, buildReviewCandidates, frameQuality, applyExclusions, bridgeEdges };

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

import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { run } from './exec.js';
import { log, dim } from './log.js';
import { extractFrames } from './frames.js';
import { fingerprint, fingerprintFromThumb, jaccard, THUMB } from './hash.js';
import { ScreenGraph } from './graph.js';
import { segmentRecording } from './segment.js';
import { analyseScreen, groupIntoFlows, identifyApp, pickBackend } from './analyze.js';
import { isBlockingScreen, isExternalAuthScreen } from './safety.js';
import { publishCrawl, resolveDataDir, safeName } from './publish.js';
import { readText } from './ocr.js';
import { filterStyles, isPublishable, labelFor, publishedTypeFor, PUBLISHED_TYPES, stateFor } from './taxonomy.js';

/** What a phone or a Finder export might hand us. */
const READABLE = ['.png', '.jpg', '.jpeg', '.heic', '.heif', '.webp', '.tiff'];

/** Screen recordings. iOS writes .mov; anything the readers accept works. */
const WATCHABLE = ['.mov', '.mp4', '.m4v', '.avi', '.mkv'];

/** What the pipeline works in. sips converts everything else to this. */
const CANONICAL = '.png';

/**
 * Frames pulled per second of recording. Five is enough to catch a screen
 * shown for a fifth of a second — a toast, a flash of a spinner — while
 * keeping a three-minute walk to under a thousand frames.
 */
const DEFAULT_FPS = 5;

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
async function framesFromVideo(videoPath, stagingDir, fps) {
  const extracted = await extractFrames(videoPath, join(stagingDir, 'frames'), fps);

  if (extracted.paths.length > MAX_FRAMES) {
    throw new Error(
      `${extracted.paths.length} frames from ${basename(videoPath)} — too many to process. ` +
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
export async function ingestFolder(options) {
  const { app } = options;
  const source = options.folder;
  const staging = mkdtempSync(join(tmpdir(), 'motvin-ingest-'));
  const analyzer = new Analyzer(options.backend);
  const graph = new ScreenGraph();
  const duplicates = [];
  const excluded = [];
  let identified = null;
  let captureInfo = null;
  let timeline = null;

  try {
    // One --from for both sources: a folder of screenshots, or a recording.
    const isVideo = WATCHABLE.includes(extname(source).toLowerCase());

    if (isVideo) {
      if (!existsSync(source)) throw new Error(`video not found: ${source}`);
      const fps = options.fps ?? DEFAULT_FPS;
      log.heading(`Reading ${basename(source)}`);
      log.detail(`extracting frames at ${fps}/second…`);
      report(options, 'extract', `Reading ${basename(source)} at ${fps} frames a second`);

      const { paths: frames, thumbs, backend } = await framesFromVideo(source, staging, fps);
      log.info(`${frames.length} frames (${backend})`);
      report(options, 'extract', `${frames.length} frames read`, { frames: frames.length });

      const minHoldSeconds = options.minHoldSeconds ?? (options.minRun !== undefined ? options.minRun / fps : undefined);
      timeline = segmentRecording(thumbs, { fps, minHoldSeconds, keepBrief: options.keepBrief });
      captureInfo = { source: basename(source), fps, frames: frames.length, durationSeconds: Math.round((frames.length / fps) * 10) / 10 };

      const distinct = timeline.screens.filter((screen) => !screen.revisitOf);
      const { dropped } = timeline;
      log.info(
        `${distinct.length} screen(s) — ${dropped.transitions} transition frame(s), ${dropped.revisits} revisit(s), ` +
          `${dropped.scrims} system prompt(s) iOS did not record, ${dropped.blank} blank frame(s) set aside`,
      );
      report(options, 'segment', `${distinct.length} screens found in the recording`, {
        screens: distinct.length,
        dropped,
      });
      if (!distinct.length) {
        throw new Error('no frame held still long enough to be a screen — try a slower walk through the app');
      }

      await ingestTimeline({ timeline, frames, analyzer, graph, duplicates, excluded, options, captureInfo });
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
        options.existingApps,
        nodes.map((node) => node.analysis.lines ?? []).filter((lines) => lines.length),
      );
      resolvedApp = {
        appId: identity.appId,
        name: identity.name,
        industry: identity.industry,
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

    // Grouping runs on the finished descriptions, so it can see a journey
    // across several screens rather than judging each one alone. Screens that
    // will not be published (a Google sign-in page) are left out of the flow
    // so the journey reads straight through them.
    const ordered = [...graph.nodes.values()].filter((node) => !node.skipPublish);
    let flowGroups = [];
    if (analyzer.usable && ordered.length >= 2) {
      report(options, 'flows', 'Grouping the screens into journeys');
      try {
        const groups = await groupIntoFlows(
          ordered.map((node) => ({
            screenType: node.analysis.screenType,
            name: node.analysis.name,
            description: node.analysis.description,
          })),
          { backend: options.backend },
        );
        flowGroups = groups.map((group) => ({
          name: group.name,
          category: group.category,
          nodeIds: group.screens.map((index) => ordered[index].id),
        }));
        log.heading('Flows');
        for (const group of flowGroups) {
          log.ok(`${group.name} — ${group.nodeIds.length} screen(s)`);
        }
      } catch (error) {
        log.warn(`could not group into flows — ${error.message.split('\n')[0]}`);
        log.detail('screens will be filed by type instead of by journey');
      }
    }

    log.heading('Publishing');
    report(options, 'publish', 'Writing screens into the library');
    const result = publishCrawl({
      graph,
      app: resolvedApp,
      flows: flowGroups,
      dataDir: options.dataDir,
      dryRun: options.dryRun,
      capture: captureInfo,
    });
    for (const skip of result.skipped) {
      log.blocked(`${skip.name} — not published: ${skip.reason}`);
    }
    return {
      ...result,
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
            })),
            edges: timeline.edges,
          }
        : null,
      analyzerUsable: analyzer.usable,
      // Which analyzer actually ran, so callers can say what the results are
      // worth: "api" carries descriptions, "local" carries types and flow
      // names only.
      backend: analyzer.usable ? pickBackend(options.backend) : 'none',
    };
  } finally {
    // The staged PNGs have been copied into the store by now.
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
  const distinct = timeline.screens.filter((screen) => !screen.revisitOf);
  const nodeByScreen = new Map();
  const nameByScreen = new Map();
  let firstTabBarSeen = false;
  const local = pickBackend(options.backend) === 'local' && analyzer.usable;

  for (const [index, screen] of distinct.entries()) {
    const framePath = frames[screen.frame];
    const fileName = `frame ${screen.frame} at ${clock(screen.start)}`;
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
    nodeByScreen.set(screen.id, node);
    nameByScreen.set(screen.id, analysis.name);

    // A third-party sign-in page is recognised from its text whichever
    // analyzer ran; it is kept in the graph so the journey through it holds
    // together, and left out of the store.
    const external = analysis.external || isExternalAuthScreen(lines.map((line) => line.text).join('\n'));
    if (external) {
      node.skipPublish = true;
      node.skipReason = typeof external === 'string' ? external : external.reason;
      node.analysis.screenType = 'external_auth';
      excluded.push({ file: fileName, name: analysis.name, reason: node.skipReason });
      log.blocked(`${node.id} ${analysis.name} — ${node.skipReason} (not published)`);
      continue;
    }

    // Loading states publish by default, labelled as such; --skip-loading
    // leaves them out. They stay in the graph either way so the journey and
    // the naming of what came after still read right.
    if ((analysis.screenType === 'loading' || screen.kind === 'loading') && options.skipLoading === true) {
      node.skipPublish = true;
      node.skipReason = 'loading state — not published (--skip-loading)';
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

  // The journey: every step the recording took, including returns.
  for (const edge of timeline.edges) {
    const from = nodeByScreen.get(edge.from);
    const to = nodeByScreen.get(edge.to);
    if (!from || !to || from === to) continue;
    graph.connect(from.id, `t${edge.atSeconds}`, to.id, `at ${clock(edge.atSeconds)}`);
  }

  // Revisits, as the graph understands them.
  for (const screen of timeline.screens) {
    if (!screen.revisitOf) continue;
    const original = nodeByScreen.get(screen.revisitOf);
    if (original) duplicates.push({ file: `frame ${screen.frame} at ${clock(screen.start)}`, sameAs: original.id, reason: 'revisit' });
  }

  if (captureInfo) captureInfo.excluded = excluded.length;
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

    const external = analysis.external || isExternalAuthScreen((analysis.lines ?? []).map((line) => line.text).join('\n'));
    if (external) {
      node.skipPublish = true;
      node.skipReason = typeof external === 'string' ? external : external.reason;
      excluded.push({ file: fileName, name: analysis.name, reason: node.skipReason });
      log.blocked(`${node.id} ${analysis.name} — ${node.skipReason} (not published)`);
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
async function identifyFrom(frames, sourcePath, backend, existingApps, lineSets = []) {
  const fallback = () => {
    const guess = titleFrom(basename(sourcePath));
    return {
      name: guess,
      appId: slugify(guess) || 'untitled-app',
      industry: 'productivity',
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
    return {
      name: existing?.name ?? identity.name,
      appId,
      industry: existing?.industry ?? identity.industry,
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
 *          overwrite?: boolean, dryRun?: boolean}} options
 */
export async function classifyStored(options) {
  const dataDir = resolveDataDir(options.dataDir);
  const platform = options.platform || 'ios';
  const appDir = join(dataDir, 'screens', platform, options.appId);
  if (!existsSync(appDir)) throw new Error(`no screens stored at ${appDir}`);

  const analysisDir = join(dataDir, 'analysis');
  const images = [];
  for (const entry of readdirSync(appDir, { withFileTypes: true })) {
    if (entry.isFile() && READABLE.includes(extname(entry.name).toLowerCase())) images.push(entry.name);
    else if (entry.isDirectory()) {
      for (const inner of readdirSync(join(appDir, entry.name))) {
        if (READABLE.includes(extname(inner).toLowerCase())) images.push(`${entry.name}/${inner}`);
      }
    }
  }
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

      // A third-party sign-in page already in the store — captured before the
      // pipeline learnt to recognise one — is removed rather than relabelled:
      // it is not the app's design and never belonged in the library. Its
      // flow closes over the gap. --keep-external leaves it in place.
      const external = analysis.external || isExternalAuthScreen((analysis.lines ?? []).map((line) => line.text).join('\n'));
      if (external && options.keepExternal !== true) {
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
        capturedAt: existing?.capturedAt || new Date().toISOString().slice(0, 10),
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

/** Exported for the self-test. */
export const _internals = { listImages, titleFrom, unclassified, PUBLISHED_TYPES, wordsOf, labelFor, isPublishable, fingerprintFromThumb };

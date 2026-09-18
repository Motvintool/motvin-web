/**
 * Getting screens in without a Simulator.
 *
 * The crawler's capture stage needs Xcode and idb; everything after it —
 * deduplication, classification, naming, the store writer — needs nothing but
 * macOS. This module exposes that second half directly, so a folder of
 * screenshots taken on a real iPhone goes through exactly the same pipeline a
 * crawl does and lands in exactly the same shape.
 *
 * It is also the only route to apps the Simulator cannot run at all, which is
 * every App Store binary.
 *
 * Two commands:
 *   ingest   — a folder of screenshots → the Inspirations store
 *   classify — (re)analyse screens already stored, filling in their sidecars
 *
 * Classification needs a working Claude backend. Ingestion does not: without
 * one, screens are filed as "other" and `classify` can fill them in later.
 */

import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { run } from './exec.js';
import { log, dim } from './log.js';
import { extractFrames } from './frames.js';
import { fingerprint, hamming } from './hash.js';
import { ScreenGraph } from './graph.js';
import { analyseScreen, groupIntoFlows, identifyApp, pickBackend } from './analyze.js';
import { isBlockingScreen } from './safety.js';
import { publishCrawl, resolveDataDir, safeName } from './publish.js';
import { filterStyles, publishedTypeFor, PUBLISHED_TYPES } from './taxonomy.js';

/** What a phone or a Finder export might hand us. */
const READABLE = ['.png', '.jpg', '.jpeg', '.heic', '.heif', '.webp', '.tiff'];

/** Screen recordings. iOS writes .mov; anything ffmpeg reads works. */
const WATCHABLE = ['.mov', '.mp4', '.m4v', '.avi', '.mkv'];

/** What the pipeline works in. sips converts everything else to this. */
const CANONICAL = '.png';

/** Frames pulled per second of recording. */
const DEFAULT_FPS = 2;

/** Above this many extracted frames, stop and tell the user to trim or slow the rate. */
const MAX_FRAMES = 4000;

/**
 * Bit distance below which two consecutive frames count as "the same moment".
 * Tighter than the screen-matching threshold in graph.js on purpose: here it is
 * only deciding whether the UI is holding still.
 */
const STABLE_BITS = 4;

/**
 * Consecutive matching frames needed before a screen is believed. At 2 fps this
 * is half a second of stillness, which is what separates a screen someone
 * stopped to look at from a frame caught mid-transition.
 */
const MIN_RUN = 2;

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

// ─── Video ───────────────────────────────────────────────────────────────────

/**
 * Pulls frames out of a screen recording.
 *
 * A recording is a much better source than hand-taken screenshots: someone taps
 * through an app for three minutes and the whole session is captured, including
 * the screens they would never have thought to screenshot. The cost is that
 * most frames are worthless — mid-animation, mid-scroll, or the same screen
 * held for four seconds. `selectStableFrames` is what sorts that out.
 */
async function framesFromVideo(videoPath, stagingDir, fps) {
  const { paths, backend } = await extractFrames(videoPath, join(stagingDir, 'frames'), fps);

  if (paths.length > MAX_FRAMES) {
    throw new Error(
      `${paths.length} frames from ${basename(videoPath)} — too many to process. ` +
        `Trim the recording, or lower the rate with --fps ${Math.max(1, Math.floor(fps / 2))}.`,
    );
  }
  return { paths, backend };
}

/**
 * Keeps one frame per moment the UI actually held still.
 *
 * Walks the frames in order, grouping consecutive ones that look the same. A
 * group that survives for at least MIN_RUN frames was a real screen; a group of
 * one was a transition caught mid-flight. The *last* frame of each run is the
 * one kept — by then any animation has finished settling.
 *
 * Exported for the self-test, which is the only way to check this without a
 * real recording.
 */
export async function selectStableFrames(framePaths, options = {}) {
  const minRun = options.minRun ?? MIN_RUN;
  const prints = [];
  for (const path of framePaths) {
    prints.push({ path, print: await fingerprint(path) });
  }

  const runs = [];
  let current = [prints[0]];
  for (let i = 1; i < prints.length; i++) {
    const held = hamming(prints[i].print.dhash, prints[i - 1].print.dhash) <= STABLE_BITS;
    if (held) {
      current.push(prints[i]);
    } else {
      runs.push(current);
      current = [prints[i]];
    }
  }
  runs.push(current);

  const kept = runs.filter((frames) => frames.length >= minRun).map((frames) => frames[frames.length - 1]);
  return {
    kept: kept.map((frame) => frame.path),
    transitions: prints.length - runs.filter((frames) => frames.length >= minRun).reduce((total, frames) => total + frames.length, 0),
    runs: runs.length,
  };
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

  async analyse(imagePath, fallbackName) {
    if (!this.usable) return unclassified(fallbackName);
    try {
      const analysis = await analyseScreen(imagePath, [], { backend: this.backend });
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
 *          classify?: boolean, dryRun?: boolean}} options
 */
export async function ingestFolder(options) {
  const { app } = options;
  const source = options.folder;
  const staging = mkdtempSync(join(tmpdir(), 'motvin-ingest-'));
  const analyzer = new Analyzer(options.backend);
  const graph = new ScreenGraph();
  const duplicates = [];
  let identified = null;

  try {
    // One --from for both sources: a folder of screenshots, or a recording.
    const isVideo = WATCHABLE.includes(extname(source).toLowerCase());
    let staged = [];

    if (isVideo) {
      if (!existsSync(source)) throw new Error(`video not found: ${source}`);
      const fps = options.fps ?? DEFAULT_FPS;
      log.heading(`Reading ${basename(source)}`);
      log.detail(`extracting frames at ${fps}/second…`);

      const { paths: frames, backend } = await framesFromVideo(source, staging, fps);
      log.info(`${frames.length} frames (${backend})`);

      const selection = await selectStableFrames(frames, { minRun: options.minRun });
      log.info(`${selection.kept.length} settled screen(s) — dropped ${selection.transitions} frame(s) caught mid-transition`);
      if (!selection.kept.length) {
        throw new Error('no frame held still long enough to be a screen — try a slower walk through the app, or --fps 4');
      }
      staged = selection.kept;
    } else {
      const files = listImages(source);
      if (!files.length) {
        throw new Error(`no readable images in ${source} (looked for ${READABLE.join(', ')})`);
      }
      log.heading(`Ingesting ${files.length} file(s)`);
      for (const fileName of files) {
        staged.push(await stage(source, fileName, staging));
      }
    }

    for (const [index, stagedPath] of staged.entries()) {
      const fileName = basename(stagedPath);
      const print = await fingerprint(stagedPath);

      // Ingestion has no accessibility tree, so deduplication rests on the
      // image alone — which is the right call for hand-taken screenshots, where
      // two captures of one screen are usually pixel-identical anyway.
      const seen = graph.match(print, []);
      if (seen) {
        seen.visits++;
        duplicates.push({ file: fileName, sameAs: seen.id });
        log.detail(`${fileName} — duplicate of ${seen.id}`);
        continue;
      }

      const analysis = await analyzer.analyse(stagedPath, titleFrom(fileName));
      const node = graph.add({
        fingerprint: print,
        labels: [],
        screenshot: stagedPath,
        analysis,
        // Capture order becomes flow order: file name order for a folder, and
        // for a recording, the order the screens were actually walked through.
        depth: index,
        path: [],
      });

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

    if (!graph.size) throw new Error('every file was a duplicate — nothing to publish');

    // Identification runs after the screens are chosen, so the model sees real
    // screens rather than whatever happened to be the first frame.
    let resolvedApp = app;
    if (!resolvedApp) {
      const identity = await identifyFrom(
        [...graph.nodes.values()].slice(0, 3).map((node) => node.screenshot),
        source,
        analyzer.usable ? options.backend : 'none',
        options.existingApps,
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
          ? `app: ${identity.name} (${identity.appId})${identity.confident ? '' : dim(' — best guess, rename it in Apps')}`
          : `app: ${identity.name} (${identity.appId})${dim(' — named after the recording; rename it in Apps')}`,
      );
    }

    // Grouping runs on the finished descriptions, so it can see a journey
    // across several screens rather than judging each one alone.
    const ordered = [...graph.nodes.values()];
    let flowGroups = [];
    if (analyzer.usable && ordered.length >= 2) {
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
    const result = publishCrawl({
      graph,
      app: resolvedApp,
      flows: flowGroups,
      dataDir: options.dataDir,
      dryRun: options.dryRun,
    });
    return {
      ...result,
      app: { id: resolvedApp.appId, name: resolvedApp.name, industry: resolvedApp.industry },
      identified,
      grouped: flowGroups.length > 0,
      ingested: graph.size,
      duplicates,
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
 * Falls back to the source file's own name when no analyzer is reachable —
 * wrong, but visible and editable afterwards, which beats refusing the upload.
 */
async function identifyFrom(frames, sourcePath, backend, existingApps) {
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
    const identity = await identifyApp(frames, { backend });
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
 * @param {{appId: string, platform?: string, dataDir?: string, backend?: string,
 *          overwrite?: boolean, dryRun?: boolean}} options
 */
export async function classifyStored(options) {
  const dataDir = resolveDataDir(options.dataDir);
  const platform = options.platform || 'ios';
  const appDir = join(dataDir, 'screens', platform, options.appId);
  if (!existsSync(appDir)) throw new Error(`no screens stored at ${appDir}`);

  const analysisDir = join(dataDir, 'analysis');
  const images = readdirSync(appDir).filter((file) => READABLE.includes(extname(file).toLowerCase())).sort();
  if (!images.length) throw new Error(`no images in ${appDir}`);

  const analyzer = new Analyzer(options.backend);
  const staging = mkdtempSync(join(tmpdir(), 'motvin-classify-'));
  const results = [];

  try {
    if (!options.dryRun) mkdirSync(analysisDir, { recursive: true });

    log.heading(`Classifying ${images.length} screen(s) in ${platform}/${options.appId}`);

    for (const image of images) {
      const base = basename(image, extname(image));
      const sidecarPath = join(appDir, `${base}.json`);
      const screenId = `${options.appId}-${platform}-${base}`;

      const existing = existsSync(sidecarPath) ? JSON.parse(readFileSync(sidecarPath, 'utf-8')) : null;
      if (existing?.screenType && !options.overwrite) {
        log.detail(`${base} — already classified as "${existing.screenType}", skipping`);
        results.push({ screenId, skipped: true, screenType: existing.screenType });
        continue;
      }

      const staged = await stage(appDir, image, staging);
      const analysis = await analyzer.analyse(staged, titleFrom(base));

      if (analysis.unclassified) {
        results.push({ screenId, failed: true });
        continue;
      }

      const publishedType = publishedTypeFor(analysis.screenType);
      const sidecar = {
        ...(existing || {}),
        name: analysis.name,
        screenType: publishedType,
        tags: [...new Set([...(analysis.tags || []), analysis.screenType.replace(/_/g, '-'), platform])].slice(0, 12),
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
        screen_id: screenId,
        screen_type: analysis.screenType,
        published_as: publishedType,
        category: analysis.category,
        flow: analysis.flow,
        description: analysis.description,
        tags: sidecar.tags,
        elements: analysis.elements,
        style: sidecar.style,
        blocked: verdict.blocked,
        blocked_reason: verdict.reason,
        capturedAt: sidecar.capturedAt,
        capturedBy: 'motvin-ios-crawler/classify',
      };

      if (!options.dryRun) {
        writeFileSync(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`);
        writeFileSync(join(analysisDir, `${screenId}.json`), `${JSON.stringify(record, null, 2)}\n`);
      }

      log.ok(`${base} → ${analysis.screenType}${publishedType !== analysis.screenType ? dim(` (published as ${publishedType})`) : ''} — ${analysis.name}`);
      results.push({ screenId, screenType: analysis.screenType, publishedType });
    }

    const done = results.filter((result) => result.screenType && !result.skipped).length;
    const failed = results.filter((result) => result.failed).length;
    if (failed) log.warn(`${failed} screen(s) could not be analysed`);

    return { dataDir, appDir, classified: done, failed, results, analyzerUsable: analyzer.usable };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/** Exported for the self-test. */
export const _internals = { listImages, titleFrom, unclassified, PUBLISHED_TYPES };

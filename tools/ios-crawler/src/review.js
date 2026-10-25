/**
 * Claude's review of an upload, and what it leaves behind for the next one.
 *
 *   review-rules.json   (beside the library)   corrections made once and
 *                        kept: a screen name's type, a name fixed, a word in
 *                        names that means a type. Every upload and AI pass
 *                        applies them before anything is saved.
 *   reviews/<app>-<platform>-<version>/        one upload's review package:
 *     screens.json      every screen — number, id, picture, name, type,
 *                       elements, flow path — and the flow tree
 *     sheet-N.png       contact sheets, twelve numbered screenshots each
 *     doubts.json       screens whose type does not fit their name or parts
 *     reviewed.json     written when a review is applied: when, how many fixes
 *     backup-<time>/    what an applied review replaced, for undo
 *
 * A review is applied from one corrections file (see applyReview), never by
 * hand: names, types, elements and flow moves go in together, the folders
 * are lined up with the tree, and the library index is rebuilt.
 */

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { closeSync, copyFileSync, cpSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { syncFolders } from './folders.js';
import { log } from './log.js';
import { rebuildManifest, resolveDataDir, VERSIONS_DIR_NAME } from './publish.js';
import { extractFramesAt, extractThumbs } from './frames.js';
import { fingerprintFromThumb, thumbToGray } from './hash.js';
import { ELEMENTS, INDUSTRIES, PUBLISHED_FLOW_CATEGORIES, PUBLISHED_TYPES, STYLES, typeFromName } from './taxonomy.js';

const IMAGES = new Set(['.webp', '.png', '.jpg', '.jpeg']);
const SHEET_COLUMNS = 6;
const SHEET_ROWS = 2;
const THUMB_WIDTH = 260;

const readJson = (file, fallback) => {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return fallback;
  }
};
const writeJson = (file, value) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};
const norm = (text) => String(text ?? '').trim().toLowerCase();

// ─── Rules ──────────────────────────────────────────────────────────────────

export function rulesFile(dataDir) {
  return join(resolveDataDir(dataDir), 'review-rules.json');
}

/** The kept corrections; an empty set when there are none yet. */
export function readRules(dataDir) {
  const rules = readJson(rulesFile(dataDir), {});
  return {
    version: 1,
    screenTypes: Array.isArray(rules.screenTypes) ? rules.screenTypes : [],
    nameFixes: Array.isArray(rules.nameFixes) ? rules.nameFixes : [],
    wordTypes: Array.isArray(rules.wordTypes) ? rules.wordTypes : [],
  };
}

/** Adds rules, skipping any already kept. */
export function addRules(dataDir, incoming = {}) {
  const rules = readRules(dataDir);
  const key = (rule) => JSON.stringify([norm(rule.app ?? ''), norm(rule.name ?? rule.from ?? rule.pattern), norm(rule.type ?? rule.to)]);
  let added = 0;
  for (const kind of ['screenTypes', 'nameFixes', 'wordTypes']) {
    for (const rule of Array.isArray(incoming[kind]) ? incoming[kind] : []) {
      if (kind !== 'nameFixes' && !PUBLISHED_TYPES.includes(rule.type)) continue;
      if (kind === 'wordTypes') {
        try {
          new RegExp(rule.pattern, 'i');
        } catch {
          continue;
        }
      }
      if (rules[kind].some((existing) => key(existing) === key(rule))) continue;
      rules[kind].push({ ...rule, addedAt: new Date().toISOString().slice(0, 10) });
      added += 1;
    }
  }
  writeJson(rulesFile(dataDir), rules);
  return added;
}

/** A screen's name after the kept name fixes. */
export function ruledName(rules, appId, name) {
  let fixed = String(name ?? '');
  for (const rule of rules.nameFixes) {
    if (rule.app && rule.app !== appId) continue;
    if (norm(fixed) === norm(rule.from)) fixed = rule.to;
  }
  return fixed;
}

/** The type the kept rules give a screen of this name, or null when none speaks to it. */
export function ruledType(rules, appId, name) {
  const exact = rules.screenTypes.find((rule) => (!rule.app || rule.app === appId) && norm(rule.name) === norm(name));
  if (exact) return exact.type;
  for (const rule of rules.wordTypes) {
    if (rule.app && rule.app !== appId) continue;
    try {
      if (new RegExp(rule.pattern, 'i').test(String(name ?? ''))) return rule.type;
    } catch {
      // A broken pattern is skipped.
    }
  }
  return null;
}

/**
 * The kept rules over a run's screens, before anything is written: names
 * first, then the type a rule gives the (fixed) name — over the model's own.
 * @returns {number} screens changed
 */
export function applyRulesToGraph(graph, appId, dataDir) {
  const rules = readRules(dataDir);
  if (!rules.screenTypes.length && !rules.nameFixes.length && !rules.wordTypes.length) return 0;
  let changed = 0;
  for (const node of graph.nodes.values()) {
    const analysis = node.analysis ?? {};
    const name = ruledName(rules, appId, analysis.name);
    const type = ruledType(rules, appId, name);
    if (name !== analysis.name) {
      analysis.name = name;
      analysis.viaHeuristics = false;
      changed += 1;
    }
    if (type && type !== analysis.modelType) {
      analysis.modelType = type;
      analysis.viaHeuristics = false;
      changed += 1;
    }
  }
  if (changed) log.info(`review rules: ${changed} correction(s) kept from earlier reviews applied`);
  return changed;
}

// ─── Package ────────────────────────────────────────────────────────────────

export function reviewDir(dataDir, appId, platform, version) {
  return join(resolveDataDir(dataDir), '..', 'reviews', `${appId}-${platform}-${version}`);
}

function listImages(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...listImages(path, base));
    else if (IMAGES.has(extname(entry).toLowerCase())) out.push(path.slice(base.length + 1));
  }
  return out;
}

/** Why a stored screen's type is in doubt, or null. */
/** Mean grey-level difference (0–255) under which two thumbnails count as the same screen. */
const LOOKALIKE_DIFF = 1;
/** Mean distance from the average grey (0–255) under which a screen counts as nearly blank. */
const BLANK_SPREAD = 4.5;

function doubtOf(screen) {
  const named = typeFromName(screen.name);
  const elements = screen.elements ?? [];
  if (screen.type === 'other') return 'still "other"';
  if (named && named !== screen.type && !['detail', 'form', 'home', 'onboarding'].includes(named)) return `name suggests ${named}`;
  if (screen.type === 'search' && !elements.includes('search-bar') && !/search|filter|sort|result|find/i.test(screen.name)) return 'search with no search bar';
  if (screen.type === 'pricing' && !elements.includes('price') && !/plan|pric|subscri|upgrade|premium|trial|pay|offer/i.test(screen.name)) return 'pricing with no prices';
  return null;
}

/**
 * Writes one version's review package: the screen list, the doubts and the
 * numbered contact sheets.
 * @returns {Promise<{dir: string, screens: number, sheets: number, doubts: number}>}
 */
export async function writeReviewPack(options) {
  const dataDir = resolveDataDir(options.dataDir);
  const { appId, version } = options;
  const platform = options.platform || 'ios';
  const appDir = join(dataDir, 'screens', platform, appId);
  const versionDir = join(appDir, VERSIONS_DIR_NAME, version);
  if (!existsSync(versionDir)) throw new Error(`no ${version} version stored at ${versionDir}`);
  const dir = reviewDir(dataDir, appId, platform, version);
  mkdirSync(dir, { recursive: true });
  for (const entry of readdirSync(dir)) if (/^(sheet|flow)-\d+\.png$/.test(entry)) rmSync(join(dir, entry));
  // A light package (right after an upload) leaves the frame strips and the scan to the review itself.
  if (!options.light) rmSync(join(dir, 'frames'), { recursive: true, force: true });

  const tag = `${appId}-${platform}-${VERSIONS_DIR_NAME}-${version}-`;
  const flows = (readJson(join(dataDir, 'flows.json'), { flows: [] }).flows || []).filter((flow) => flow.appId === appId && flow.platform === platform && (flow.screenIds ?? []).some((id) => id.startsWith(tag)));
  const byId = new Map(flows.map((flow) => [flow.id, flow]));
  const pathOf = (flow) => {
    const parts = [];
    for (let cursor = flow, guard = 0; cursor && guard < 12; cursor = byId.get(cursor.parentId), guard++) parts.unshift(cursor.name);
    return parts.join(' › ');
  };
  const depth = (flow) => pathOf(flow).split(' › ').length;

  const files = listImages(versionDir).map((rel) => `${VERSIONS_DIR_NAME}/${version}/${rel}`);
  const idOf = (rel) => `${appId}-${platform}-${rel.replace(/\.[^.]+$/, '').split('/').join('-')}`;
  // Walk order: the flows' own order, deepest flow per screen, then the rest.
  const order = [];
  const walk = (parentId) => {
    for (const flow of flows) if ((flow.parentId ?? null) === parentId) {
      order.push(flow);
      walk(flow.id);
    }
  };
  walk(null);
  const seen = new Set();
  const screens = [];
  const add = (rel) => {
    const id = idOf(rel);
    if (seen.has(id)) return;
    seen.add(id);
    const sidecar = readJson(join(appDir, rel.replace(/\.[^.]+$/, '.json')), {});
    const holders = flows.filter((flow) => flow.screenIds.includes(id)).sort((a, b) => depth(b) - depth(a));
    screens.push({
      n: screens.length + 1,
      id,
      file: join(appDir, rel),
      name: sidecar.name ?? '',
      type: sidecar.screenType ?? 'other',
      extraTypes: Array.isArray(sidecar.extraTypes) ? sidecar.extraTypes : [],
      elements: sidecar.elements ?? [],
      style: Array.isArray(sidecar.style) ? sidecar.style : [],
      tags: Array.isArray(sidecar.tags) ? sidecar.tags : [],
      flow: holders[0] ? pathOf(holders[0]) : null,
      flowId: holders[0]?.id ?? null,
      atSeconds: typeof sidecar.capture?.atSeconds === 'number' ? sidecar.capture.atSeconds : null,
    });
  };
  const fileOfId = new Map(files.map((rel) => [idOf(rel), rel]));
  for (const flow of order) for (const id of flow.screenIds) if (fileOfId.has(id)) add(fileOfId.get(id));
  for (const rel of files) add(rel);

  // The patterns each screen lands in, from the last library build, and the
  // rules that put it there — so a review can see a rule that is too loose.
  const builtPatterns = readJson(join(dataDir, 'manifest.json'), { patterns: [] }).patterns || [];
  const patternRules = new Map((readJson(join(dataDir, 'patterns.json'), { patterns: [] }).patterns || []).map((pattern) => [pattern.slug, pattern.match ?? {}]));
  for (const screen of screens) screen.patterns = builtPatterns.filter((pattern) => (pattern.screenIds ?? []).includes(screen.id)).map((pattern) => pattern.name);
  const patterns = builtPatterns
    .map((pattern) => ({ slug: pattern.slug, name: pattern.name, match: patternRules.get(pattern.slug) ?? {}, screens: screens.filter((screen) => screen.patterns.includes(pattern.name)).map((screen) => screen.n) }))
    .filter((pattern) => pattern.screens.length);
  // Screens that look the same as another one in this version: likely
  // duplicates of one screen caught twice, for the review to remove.
  const prints = await Promise.all(screens.map((screen) => sharp(screen.file).resize(72, 144, { fit: 'fill' }).greyscale().raw().toBuffer().catch(() => null)));
  for (let i = 0; i < screens.length; i++) {
    if (!prints[i]) continue;
    // Only the few screens just before it: a screen caught twice is caught twice in a row.
    for (let j = Math.max(0, i - 3); j < i; j++) {
      if (!prints[j]) continue;
      let diff = 0;
      for (let k = 0; k < prints[i].length; k++) diff += Math.abs(prints[i][k] - prints[j][k]);
      if (diff / prints[i].length < LOOKALIKE_DIFF) {
        screens[i].looksLike = screens[j].n;
        break;
      }
    }
  }
  for (const screen of screens) screen.hash = pictureHash(screen.file);
  const keptGrays = new Map();
  for (const screen of screens) {
    const gray = await compareGray(screen.file).catch(() => null);
    if (gray) keptGrays.set(screen.id, gray);
  }
  if (!options.light) {
    await writeFrameStrips(dir, screens, flows, keptGrays);
    await writeMissedMoments(dir, screens);
  }
  // A screen with almost nothing drawn on it — a blank loading page, a white flash — is no step.
  screens.forEach((screen, i) => {
    const print = prints[i];
    if (!print) return;
    let mean = 0;
    for (const v of print) mean += v;
    mean /= print.length;
    let spread = 0;
    for (const v of print) spread += Math.abs(v - mean);
    // A loading screen with this little on it is a blank page waiting; any other screen must be emptier still.
    const limit = screen.type === 'loading' || (screen.extraTypes ?? []).includes('loading') ? BLANK_SPREAD : BLANK_SPREAD / 3;
    if (spread / print.length < limit) screen.blank = true;
  });
  // Findings: every doubt the package can prove from the pictures, each to be fixed or
  // confirmed with a reason before the review can pass (see checkVersion).
  const before = readJson(join(dir, 'findings.json'), null);
  const findings = { builtAt: new Date().toISOString(), full: !options.light || Boolean(before?.full), picture: options.light && before ? before.picture ?? [] : [], duplicate: [], blank: [] };
  if (!options.light) {
    for (const screen of screens) {
      const finding = (why, at, fix, kind) => findings.picture.push({ key: `picture:${screen.hash}`, kind, n: screen.n, id: screen.id, at: screen.atSeconds, better: at, message: `#${screen.n} "${screen.name}" (${screen.atSeconds}s): ${why} — ${fix}` });
      if (screen.settlesAt !== undefined) finding('the picture was taken while the page was still moving', screen.settlesAt, `swap to the settled page ("frames": { "id", "at": ${screen.settlesAt} }); see frames/${screen.n}.png`, 'moving');
      else if (screen.clearerAt !== undefined) finding('a sharper or fully loaded picture of it is in the recording', screen.clearerAt, `swap ("frames": { "id", "at": ${screen.clearerAt} }); see frames/${screen.n}.png`, 'clearer');
      else if (screen.staleTime && !(screen.seenAt ?? []).some((at) => Math.abs(at - screen.atSeconds) <= 0.3)) {
        const seen = (screen.seenAt ?? []).sort((a, b) => Math.abs(a - screen.atSeconds) - Math.abs(b - screen.atSeconds))[0];
        finding(`the picture is not what the recording shows at its time, so its place in the flow cannot be checked${seen !== undefined ? ` — it is seen at ${seen}s` : ''}`, seen ?? null, seen !== undefined ? `retake it there ("frames": { "id", "at": ${seen} }) and check its step order; see frames/${screen.n}.png` : `find its moment in the recording and retake it ("frames"); see frames/${screen.n}.png`, 'stale');
      } else if (screen.cleanerAt !== undefined) finding('first step of its flow, and the moment just before may be the clean start', screen.cleanerAt, `swap ("frames": { "id", "at": ${screen.cleanerAt} }); see frames/${screen.n}.png`, 'cleaner');
    }
  }
  reportPack(dir, 'Looking for duplicates and blank pages');
  const grayList = screens.map((screen) => keptGrays.get(screen.id));
  for (let i = 0; i < screens.length; i++) {
    if (!grayList[i]) continue;
    for (let j = 0; j < i; j++) {
      if (!grayList[j] || !within(grayList[i], grayList[j], SAME_PAGE)) continue;
      const pair = [screens[j].hash, screens[i].hash].sort().join('+');
      findings.duplicate.push({ key: `duplicate:${pair}`, hashes: pair.split('+'), message: `#${screens[j].n} "${screens[j].name}" and #${screens[i].n} "${screens[i].name}" are the same picture — remove one ("remove"), or confirm both are steps of their own` });
    }
  }
  for (const screen of screens) if (screen.blank) findings.blank.push({ key: `blank:${screen.hash}`, hash: screen.hash, message: `#${screen.n} "${screen.name}" has almost nothing on it — a blank loading page: remove it, or confirm it is a real step` });
  findings.signature = packSignature(dataDir, appId, platform, version);
  writeJson(join(dir, 'findings.json'), findings);
  const doubts = screens
    .map((screen) => ({
      n: screen.n,
      id: screen.id,
      name: screen.name,
      type: screen.type,
      why: screen.blank
        ? 'almost nothing on it — a blank loading page to remove?'
        : screen.cleanerAt !== undefined
          ? `first step of its flow, and the picture at ${screen.cleanerAt}s (just before) may be the clean start — see frames/${screen.n}.png`
        : screen.changesAt !== undefined && screen.clearerAt === undefined
          ? `something on it changes at ${screen.changesAt}s (an error, a state, a filled field?) — a step of its own to add? see frames/${screen.n}.png`
        : screen.clearerAt !== undefined
          ? `a clearer picture of it at ${screen.clearerAt}s (sharper or fully loaded) — see frames/${screen.n}.png`
        : screen.looksLike
          ? `looks the same as #${screen.looksLike} — a duplicate to remove?`
          : doubtOf(screen),
    }))
    .filter((entry) => entry.why);
  const tree = order.map((flow) => ({ id: flow.id, path: pathOf(flow), category: flow.category, screens: flow.screenIds.length }));
  const tagList = (readJson(join(dataDir, 'tags.json'), { tags: [] }).tags || []).map((tag) => (typeof tag === 'string' ? tag : tag?.slug)).filter(Boolean);
  // The app's own category (industry), what the Categories list files it under.
  const appsDoc = readJson(join(dataDir, 'apps.json'), { apps: [] });
  const appRecord = (Array.isArray(appsDoc) ? appsDoc : appsDoc.apps ?? []).find((entry) => entry.id === appId);
  // The contact sheet each screen is on, for a verdict given sheet by sheet.
  for (const screen of screens) screen.sheet = Math.floor((screen.n - 1) / (SHEET_COLUMNS * SHEET_ROWS)) + 1;
  writeJson(join(dir, 'screens.json'), { app: appId, platform, version, generatedAt: new Date().toISOString(), appName: appRecord?.name ?? null, tagline: appRecord?.tagline ?? null, industry: appRecord?.industry ?? null, cardScreens: appRecord?.cardScreens ?? [], industries: INDUSTRIES, flowCategories: PUBLISHED_FLOW_CATEGORIES, types: PUBLISHED_TYPES, elements: ELEMENTS, tags: tagList, tree, patterns, problems: checkVersion({ appId, platform, version, dataDir }), missed: readJson(join(dir, 'missed.json'), []), screens });
  for (const moment of readJson(join(dir, 'missed.json'), [])) doubts.push({ n: null, id: null, name: null, type: null, why: `a moment at ${moment.at}s that no screen shows (after #${moment.afterN ?? '?'}) — add it or skip it; see ${moment.picture}` });
  writeJson(join(dir, 'doubts.json'), doubts);

  // Contact sheets: twelve numbered screenshots each, number and type under each.
  const perSheet = SHEET_COLUMNS * SHEET_ROWS;
  let sheets = 0;
  for (let at = 0; at < screens.length; at += perSheet) {
    const batch = screens.slice(at, at + perSheet);
    const cells = await Promise.all(
      batch.map(async (screen) => {
        const image = await sharp(screen.file).resize({ width: THUMB_WIDTH }).png().toBuffer().catch(() => null);
        const meta = image ? await sharp(image).metadata() : { height: 400 };
        return { screen, image, height: meta.height ?? 400 };
      }),
    );
    const cellHeight = Math.min(620, Math.max(...cells.map((cell) => cell.height))) + 44;
    const width = SHEET_COLUMNS * (THUMB_WIDTH + 16) + 16;
    const height = Math.ceil(batch.length / SHEET_COLUMNS) * (cellHeight + 16) + 16;
    const layers = [];
    cells.forEach((cell, index) => {
      const x = 16 + (index % SHEET_COLUMNS) * (THUMB_WIDTH + 16);
      const y = 16 + Math.floor(index / SHEET_COLUMNS) * (cellHeight + 16);
      if (cell.image) layers.push({ input: cell.image, left: x, top: y });
      const label = `#${cell.screen.n} ${cell.screen.type}${cell.screen.extraTypes?.length ? ` +${cell.screen.extraTypes.join(' +')}` : ''}`.replace(/[<&>]/g, '').slice(0, 30);
      const svg = `<svg width="${THUMB_WIDTH}" height="40" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#111"/><text x="8" y="27" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="700" fill="#fff">${label}</text></svg>`;
      layers.push({ input: Buffer.from(svg), left: x, top: y + cellHeight - 42 });
    });
    sheets += 1;
    await sharp({ create: { width, height, channels: 3, background: '#e9e9e9' } }).composite(layers).png().toFile(join(dir, `sheet-${sheets}.png`));
  }
  reportPack(dir, 'Drawing contact and flow sheets');
  const flowSheets = await writeFlowSheets(dir, order, screens, pathOf);
  log.ok(`review package: ${screens.length} screen(s), ${sheets} sheet(s), ${flowSheets} flow sheet(s), ${doubts.length} doubt(s) in ${dir}`);
  return { dir, screens: screens.length, sheets, doubts: doubts.length };
}

// ─── Prepare: the package and the fixes the pictures prove ──────────────────

/** What a package was built from: every picture and the flow tree. A change means a new build. */
export function packSignature(dataDir, appId, platform, version) {
  const store = resolveDataDir(dataDir);
  const versionDir = join(store, 'screens', platform, appId, VERSIONS_DIR_NAME, version);
  if (!existsSync(versionDir)) return null;
  const hashes = listImages(versionDir).sort().map((rel) => `${rel}=${pictureHash(join(versionDir, rel))}`);
  const tag = `${appId}-${platform}-${VERSIONS_DIR_NAME}-${version}-`;
  const flows = (readJson(join(store, 'flows.json'), { flows: [] }).flows || []).filter((flow) => flow.appId === appId && (flow.screenIds ?? []).some((sid) => sid.startsWith(tag))).map((flow) => `${flow.id}|${flow.name}|${flow.parentId ?? ''}|${flow.category}|${flow.screenIds.join(',')}`);
  return createHash('sha1').update([...hashes, ...flows].join('\n')).digest('hex').slice(0, 16);
}

/** True when the package on disk is a full one built from the version exactly as it is now. */
export function packIsFresh(options) {
  const dataDir = resolveDataDir(options.dataDir);
  const platform = options.platform || 'ios';
  const dir = reviewDir(dataDir, options.appId, platform, options.version);
  const findings = readJson(join(dir, 'findings.json'), null);
  if (!findings?.full || !findings.signature || !existsSync(join(dir, 'screens.json'))) return false;
  return findings.signature === packSignature(dataDir, options.appId, platform, options.version);
}

/**
 * The full package — frame strips, the scan, the findings — built ahead of the review (in the
 * background after an upload). Nothing is changed: every finding is the review's decision, as
 * a near-identical picture is often a real state (a spinner in a button, an error line).
 */
export async function prepareReview(options) {
  const dataDir = resolveDataDir(options.dataDir);
  return writeReviewPack({ ...options, dataDir, platform: options.platform || 'ios', light: false });
}

// ─── Frames read early, during the upload ───────────────────────────────────

/** A recording's identity: its size and first bytes, so a copy of it finds the same cache. */
export function recordingKey(path) {
  const head = Buffer.alloc(Math.min(8 * 1024 * 1024, statSync(path).size));
  const fd = openSync(path, 'r');
  try {
    readSync(fd, head, 0, head.length, 0);
  } finally {
    closeSync(fd);
  }
  return createHash('sha1').update(`${statSync(path).size}:`).update(head).digest('hex').slice(0, 16);
}

const cacheRoot = (dataDir) => join(resolveDataDir(dataDir), '..', 'reviews', '.frame-cache');
const cacheOf = (dataDir, recording) => join(cacheRoot(dataDir), recordingKey(recording));
const cachedFrame = (cache, index) => join(cache, 'strip', `frame-${String(index + 1).padStart(5, '0')}.png`);
const stripIndexes = (times) => [...new Set(times.flatMap((seconds) => STRIP_OFFSETS.map((offset) => Math.max(1, Math.round((seconds + offset) * STRIP_FPS)))))];

/**
 * Starts reading the review's frames while the upload is still analysing its screens: the
 * frame strips at each screen's moment and the scan of the whole recording, into a cache the
 * review package then takes them from. Runs on its own, so the upload does not wait for it.
 */
export function startPrefetch({ recording, times, dataDir }) {
  try {
    const root = cacheRoot(dataDir);
    mkdirSync(root, { recursive: true });
    // Caches older than two days belong to uploads long reviewed.
    for (const entry of readdirSync(root)) {
      const path = join(root, entry);
      if (Date.now() - statSync(path).mtimeMs > 2 * 86_400_000) rmSync(path, { recursive: true, force: true });
    }
    const cache = cacheOf(dataDir, recording);
    mkdirSync(cache, { recursive: true });
    writeJson(join(cache, 'times.json'), times.filter((seconds) => typeof seconds === 'number'));
    const args = [fileURLToPath(new URL('../crawl.js', import.meta.url)), 'review-prefetch', '--recording', recording];
    if (dataDir) args.push('--data-dir', dataDir);
    spawn(process.execPath, args, { detached: true, stdio: 'ignore' }).unref();
  } catch (error) {
    log.warn(`could not start reading the review's frames early — ${String(error.message).split('\n')[0]}`);
  }
}

/** The work startPrefetch starts: run as `crawl.js review-prefetch`. */
export async function prefetchFrames({ recording, dataDir }) {
  const cache = cacheOf(dataDir, recording);
  mkdirSync(cache, { recursive: true });
  const meta = join(cache, 'meta.json');
  writeJson(meta, { pid: process.pid, startedAt: new Date().toISOString() });
  // Its own copy: the upload's staging folder, where the recording sits now, is cleared when it ends.
  const local = join(cache, `recording${extname(recording).toLowerCase()}`);
  try {
    copyFileSync(recording, local);
    await extractFramesAt(local, join(cache, 'strip'), STRIP_FPS, stripIndexes(readJson(join(cache, 'times.json'), [])));
    const { thumbs } = await extractThumbs(local, join(cache, 'scan-raw'), SCAN_FPS, SCAN_GRID);
    writeFileSync(join(cache, 'scan.bin'), Buffer.concat(thumbs));
    rmSync(join(cache, 'scan-raw'), { recursive: true, force: true });
    writeJson(meta, { done: true, scanFrames: thumbs.length, finishedAt: new Date().toISOString() });
  } catch (error) {
    writeJson(meta, { failed: String(error.message).split('\n')[0] });
  } finally {
    rmSync(local, { force: true });
  }
}

/** The cache for this recording once its early reading is done (waited for while it runs), or null. */
async function readyCache(dir, recording) {
  let cache;
  try {
    cache = cacheOf(join(dir, '..', '..', 'inspirations'), recording);
  } catch {
    return null;
  }
  const meta = join(cache, 'meta.json');
  for (;;) {
    const state = readJson(meta, null);
    if (!state) return null;
    if (state.done) return cache;
    if (state.failed || !Number.isInteger(state.pid) || !alive(state.pid)) return null;
    reportPack(dir, 'Finishing the frames read during the upload');
    await new Promise((done) => setTimeout(done, 3000));
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Drops the early frames of a recording once its review is done. */
function dropCache(dir) {
  const recording = recordingIn(dir);
  if (!recording) return;
  try {
    rmSync(cacheOf(join(dir, '..', '..', 'inspirations'), recording), { recursive: true, force: true });
  } catch {
    // Old caches are cleared after two days anyway.
  }
}

// ─── Apply and undo ─────────────────────────────────────────────────────────

/**
 * Applies a review's corrections file:
 *
 *   { "screens": [ { "id", "name"?, "type"?, "extraTypes"? (up to 4), "elements"?, "tags"? (from tags.json) } ],
 *     "flows":   [ { "id", "name"?, "parent"? (flow id, or null for the top), "category"? } ]
 *                (a new id in this version, with a name, makes a new flow; listed flows are shown in list order),
 *     "moves":   [ { "screen": id, "from"?: flow id (none for a screen no flow lists), "to": flow id } ],
 *     "merges":  [ { "from": flow id, "into": flow id } ],
 *     "remove":  [ screen id, … ]  (duplicates and bad frames; undo puts them back),
 *     "frames":  [ { "id": screen id, "at": seconds } ]  (a better picture from the kept recording),
 *     "add":     [ { "after": screen id, "at": seconds, "name", "type", … } ]  (a step the upload missed, from the recording),
 *     "confirm": [ { "key": finding key, "why": text } ]  (a finding looked at and kept as it is),
 *     "checked": [ { "id": screen id, "see": text } ]  (the verdict on a screen: what it shows, looked at),
 *     "sheets":  [ { "sheet": n, "see": text } ]  (the verdict on a whole contact sheet's screens),
 *     "audit":   [ { "flow": flow id, "ok": true } ]  (the second check approved the flow as it stands),
 *     "skip":    [ { "at": seconds, "why": "typing"|"pressed"|"bars"|"same"|"picture", "same"?: screen id } ]
 *                (a missed moment not worth a screen — with a reason, checked: "same" must match that kept
 *                screen, "picture" needs a "frames" swap at that moment; a bare number is refused),
 *     "rules":   { "screenTypes"?: [...], "nameFixes"?: [...], "wordTypes"?: [...] } }
 *
 * Everything it touches is backed up first; then the folders are lined up
 * with the tree, the library index rebuilt, the rules kept and the review
 * marked done.
 */
export async function applyReview(options) {
  const dataDir = resolveDataDir(options.dataDir);
  const { appId, version } = options;
  const platform = options.platform || 'ios';
  const corrections = readJson(options.file, null);
  if (!corrections) throw new Error(`${options.file} could not be read`);
  const appDir = join(dataDir, 'screens', platform, appId);
  const versionDir = join(appDir, VERSIONS_DIR_NAME, version);
  const dir = reviewDir(dataDir, appId, platform, version);
  const backup = join(dir, `backup-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const skipsRefused = [];
  const sequencesBefore = flowSequences(dataDir, appId, platform, version);
  // Applying: the agent's card shows step 6 under way.
  if (existsSync(join(dir, 'reviewing.json'))) writeJson(join(dir, 'reviewing.json'), { ...readJson(join(dir, 'reviewing.json'), {}), step: 6 });
  mkdirSync(backup, { recursive: true });
  cpSync(versionDir, join(backup, 'version'), { recursive: true });
  cpSync(join(dataDir, 'flows.json'), join(backup, 'flows.json'));
  if (existsSync(join(dataDir, 'apps.json'))) cpSync(join(dataDir, 'apps.json'), join(backup, 'apps.json'));
  // The rules as they were — none yet is a set too, so undo takes away what this review added.
  writeJson(join(backup, 'review-rules.json'), readRules(dataDir));
  // The screens' records too: lining the folders up renames them.
  const tag = `${appId}-${platform}-${VERSIONS_DIR_NAME}-${version}-`;
  for (const kind of ['analysis', 'words']) {
    const from = join(dataDir, kind);
    if (!existsSync(from)) continue;
    mkdirSync(join(backup, kind), { recursive: true });
    for (const entry of readdirSync(from)) if (entry.startsWith(tag)) cpSync(join(from, entry), join(backup, kind, entry));
  }

  const fileOfId = new Map(listImages(versionDir).map((rel) => [`${appId}-${platform}-${`${VERSIONS_DIR_NAME}/${version}/${rel}`.replace(/\.[^.]+$/, '').split('/').join('-')}`, join(versionDir, rel)]));
  let fixes = 0;
  for (const fix of Array.isArray(corrections.screens) ? corrections.screens : []) {
    const image = fileOfId.get(fix.id);
    if (!image) {
      log.warn(`review: no screen ${fix.id} in this version — skipped`);
      continue;
    }
    const sidecarPath = image.replace(/\.[^.]+$/, '.json');
    const sidecar = readJson(sidecarPath, {});
    if (typeof fix.name === 'string' && fix.name.trim()) sidecar.name = fix.name.trim();
    if (fix.type && PUBLISHED_TYPES.includes(fix.type)) {
      sidecar.screenType = fix.type;
      // The finer label search ranks by follows the corrected type.
      sidecar.fineType = fix.type;
    }
    if (Array.isArray(fix.style)) sidecar.style = [...new Set(fix.style.filter((style) => STYLES.includes(style)))];
    if (Array.isArray(fix.elements)) sidecar.elements = fix.elements.filter((element) => ELEMENTS.includes(element));
    if (Array.isArray(fix.extraTypes)) sidecar.extraTypes = [...new Set(fix.extraTypes.filter((t) => PUBLISHED_TYPES.includes(t) && t !== 'other' && t !== sidecar.screenType))].slice(0, 4);
    else if (Array.isArray(sidecar.extraTypes)) sidecar.extraTypes = sidecar.extraTypes.filter((t) => t !== sidecar.screenType);
    if (Array.isArray(fix.tags)) {
      const allowed = new Set((readJson(join(dataDir, 'tags.json'), { tags: [] }).tags || []).map((tag) => (typeof tag === 'string' ? tag : tag?.slug)));
      sidecar.tags = [...new Set(fix.tags.filter((tag) => allowed.has(tag)))].slice(0, 5);
    }
    writeJson(sidecarPath, sidecar);
    fixes += 1;
  }

  // A better picture of a screen, taken from the kept recording.
  const recording = recordingIn(dir);
  // Pictures the review chose itself — retaken or added — count as looked at.
  const chosen = [];
  for (const pick of Array.isArray(corrections.frames) ? corrections.frames : []) {
    const image = fileOfId.get(pick.id);
    if (!image || typeof pick.at !== 'number') continue;
    if (!recording) {
      log.warn(`review: no recording kept for this upload — the picture of ${pick.id} stays`);
      continue;
    }
    try {
      await takeFrame(recording, image, pick.at, join(dir, 'frames', 'take'));
      chosen.push(image);
      const sidecarPath = image.replace(/\.[^.]+$/, '.json');
      const sidecar = readJson(sidecarPath, {});
      sidecar.capture = { ...(sidecar.capture ?? {}), atSeconds: pick.at };
      writeJson(sidecarPath, sidecar);
      fixes += 1;
    } catch (error) {
      log.warn(`review: could not take the frame at ${pick.at}s for ${pick.id} — ${String(error.message).split('\n')[0]}`);
    }
  }
  const flowsFile = join(dataDir, 'flows.json');
  const flowsDoc = readJson(flowsFile, { version: 1, flows: [] });
  // Decisions on missed moments: added (below) or skipped.
  const decided = readJson(join(dir, 'decided.json'), []);
  // A skip must say why, and the why is checked against the pictures: a real state
  // (an empty field, an error line, a settled page) is never waved through.
  const moments = readJson(join(dir, 'missed.json'), []);
  for (const skip of Array.isArray(corrections.skip) ? corrections.skip : []) {
    const refused = await skipRefused(skip, { dir, moments, fileOfId, frames: corrections.frames });
    if (refused) {
      log.warn(`review: skip at ${skip?.at ?? skip}s refused — ${refused}; add it instead`);
      skipsRefused.push(`the moment at ${skip?.at ?? skip}s was not skipped — ${refused}. Add it ("add"), or swap a kept screen's picture to it ("frames") and skip it with "why": "picture"`);
      continue;
    }
    decided.push(skip.at);
  }
  for (const add of Array.isArray(corrections.add) ? corrections.add : []) if (typeof add.at === 'number') decided.push(add.at);
  // Findings looked at and kept on purpose, each with its reason.
  const confirmed = readJson(join(dir, 'confirmed.json'), []);
  for (const entry of Array.isArray(corrections.confirm) ? corrections.confirm : []) {
    if (typeof entry?.key === 'string' && typeof entry.why === 'string' && entry.why.trim().length >= 8) confirmed.push({ key: entry.key, why: entry.why.trim() });
    else skipsRefused.push(`a "confirm" needs the finding's "key" and a real "why" (${JSON.stringify(entry).slice(0, 80)})`);
  }
  writeJson(join(dir, 'confirmed.json'), confirmed);
  writeJson(join(dir, 'decided.json'), decided);
  // A step the upload missed (an error, a state held on one page), taken from the
  // kept recording and put in its flow right after the screen it follows.
  for (const add of Array.isArray(corrections.add) ? corrections.add : []) {
    const after = fileOfId.get(add.after);
    const flow = (flowsDoc.flows || []).find((entry) => entry.appId === appId && entry.platform === platform && entry.screenIds.includes(add.after));
    if (!after || !flow || typeof add.at !== 'number') {
      log.warn(`review: cannot add a screen after ${add.after} — it is not in this version's flows`);
      continue;
    }
    if (!recording) {
      log.warn('review: no recording kept for this upload — a missed step cannot be added');
      continue;
    }
    const folder = dirname(after);
    const ext = extname(after);
    let n = 1;
    while (existsSync(join(folder, `added-${n}${ext}`))) n += 1;
    const image = join(folder, `added-${n}${ext}`);
    cpSync(after, image);
    try {
      await takeFrame(recording, image, add.at, join(dir, 'frames', 'take'));
    } catch (error) {
      rmSync(image, { force: true });
      log.warn(`review: could not take the frame at ${add.at}s — ${String(error.message).split('\n')[0]}`);
      continue;
    }
    const sidecar = { ...readJson(after.replace(/\.[^.]+$/, '.json'), {}) };
    if (typeof add.name === 'string' && add.name.trim()) sidecar.name = add.name.trim();
    if (add.type && PUBLISHED_TYPES.includes(add.type)) sidecar.screenType = sidecar.fineType = add.type;
    if (Array.isArray(add.extraTypes)) sidecar.extraTypes = add.extraTypes.filter((t) => PUBLISHED_TYPES.includes(t) && t !== 'other' && t !== sidecar.screenType).slice(0, 4);
    if (Array.isArray(add.elements)) sidecar.elements = add.elements.filter((e) => ELEMENTS.includes(e)).slice(0, 6);
    if (Array.isArray(add.tags)) sidecar.tags = add.tags.slice(0, 5);
    if (Array.isArray(add.style)) sidecar.style = add.style.filter((style) => STYLES.includes(style));
    sidecar.capture = { ...(sidecar.capture ?? {}), atSeconds: add.at };
    writeJson(image.replace(/\.[^.]+$/, '.json'), sidecar);
    const rel = `${VERSIONS_DIR_NAME}/${version}/${image.slice(versionDir.length + 1)}`;
    const id = `${appId}-${platform}-${rel.replace(/\.[^.]+$/, '').split('/').join('-')}`;
    fileOfId.set(id, image);
    chosen.push(image);
    const at = flow.screenIds.indexOf(add.after) + 1;
    flow.screenIds.splice(at, 0, id);
    flow.steps = flow.screenIds.map((sid) => ({ screenId: sid, action: (flow.steps ?? []).find((step) => step.screenId === sid)?.action ?? null }));
    fixes += 1;
  }
  // Verdicts: each screen the review looked at, by its picture — a picture changed later needs one again.
  const checked = new Set(readJson(join(dir, 'checked.json'), []));
  for (const entry of Array.isArray(corrections.checked) ? corrections.checked : []) {
    const image = fileOfId.get(entry?.id);
    if (!image) skipsRefused.push(`"checked" names no screen of this version: ${String(entry?.id).slice(0, 80)}`);
    else if (typeof entry.see !== 'string' || entry.see.trim().length < 4) skipsRefused.push(`"checked" for ${entry.id} needs "see": what the screen shows`);
    else checked.add(pictureHash(image));
  }
  for (const image of chosen) checked.add(pictureHash(image));
  // A verdict for a whole contact sheet: every screen on it, as the package showed it.
  const sheetOf = readJson(join(dir, 'screens.json'), { screens: [] }).screens;
  for (const entry of Array.isArray(corrections.sheets) ? corrections.sheets : []) {
    const on = sheetOf.filter((screen) => screen.sheet === entry?.sheet && screen.hash);
    if (!on.length) skipsRefused.push(`"sheets" names no contact sheet: ${JSON.stringify(entry).slice(0, 60)}`);
    else if (typeof entry.see !== 'string' || entry.see.trim().length < 12) skipsRefused.push(`the verdict for sheet ${entry.sheet} needs "see": what is on it, looked at`);
    else for (const screen of on) checked.add(screen.hash);
  }
  writeJson(join(dir, 'checked.json'), [...checked].filter(Boolean));
  // Screens the review takes out — a duplicate of the one before it, a frame
  // caught mid-transition, a blank or broken capture. The backup above holds
  // the files and records, so undo puts them back.
  const removed = new Set();
  for (const id of Array.isArray(corrections.remove) ? corrections.remove : []) {
    const image = fileOfId.get(id);
    if (!image) {
      log.warn(`review: no screen ${id} to remove — skipped`);
      continue;
    }
    rmSync(image, { force: true });
    rmSync(image.replace(/\.[^.]+$/, '.json'), { force: true });
    for (const kind of ['analysis', 'words']) rmSync(join(dataDir, kind, `${id}.json`), { force: true });
    fileOfId.delete(id);
    removed.add(id);
    fixes += 1;
  }
  if (removed.size) {
    for (const flow of flowsDoc.flows || []) {
      if (flow.appId !== appId || flow.platform !== platform) continue;
      flow.screenIds = (flow.screenIds ?? []).filter((id) => !removed.has(id));
      flow.steps = (flow.steps ?? []).filter((step) => !removed.has(step.screenId));
    }
  }
  const flowById = new Map((flowsDoc.flows || []).map((flow) => [flow.id, flow]));
  const owned = (flow) => flow && flow.appId === appId && flow.platform === platform;
  // A flow id the store does not have yet, named and in this version, is a
  // new flow — the tree a review settles on may need more flows than the
  // upload made. It is filled by the moves below.
  const versionTag = `${appId}-${platform}-${VERSIONS_DIR_NAME}-${version}-`;
  for (const fix of Array.isArray(corrections.flows) ? corrections.flows : []) {
    if (flowById.has(fix.id) || !String(fix.id ?? '').startsWith(versionTag) || !(typeof fix.name === 'string' && fix.name.trim())) continue;
    const flow = { id: fix.id, appId, name: fix.name.trim(), category: fix.category || 'discovery', platform, screenIds: [], parentId: null, steps: [] };
    flowsDoc.flows.push(flow);
    flowById.set(flow.id, flow);
  }
  for (const fix of Array.isArray(corrections.flows) ? corrections.flows : []) {
    const flow = flowById.get(fix.id);
    if (!owned(flow)) continue;
    if (typeof fix.name === 'string' && fix.name.trim()) flow.name = fix.name.trim();
    if (fix.category && PUBLISHED_FLOW_CATEGORIES.includes(fix.category)) flow.category = fix.category;
    if (fix.parent === null || (fix.parent && owned(flowById.get(fix.parent)) && fix.parent !== flow.id)) flow.parentId = fix.parent;
    fixes += 1;
  }
  for (const move of Array.isArray(corrections.moves) ? corrections.moves : []) {
    // No "from": a screen no flow lists yet, added to one.
    const from = move.from ? flowById.get(move.from) : null;
    const to = flowById.get(move.to);
    if ((move.from && !owned(from)) || !owned(to) || !fileOfId.has(move.screen)) continue;
    if (from) {
      from.screenIds = from.screenIds.filter((id) => id !== move.screen);
      from.steps = (from.steps ?? []).filter((step) => step.screenId !== move.screen);
    }
    if (!to.screenIds.includes(move.screen)) {
      to.screenIds.push(move.screen);
      to.steps = [...(to.steps ?? []), { screenId: move.screen, action: null }];
    }
    fixes += 1;
  }
  for (const merge of Array.isArray(corrections.merges) ? corrections.merges : []) {
    const from = flowById.get(merge.from);
    const into = flowById.get(merge.into);
    if (!owned(from) || !owned(into) || from === into) continue;
    for (const id of from.screenIds) if (!into.screenIds.includes(id)) into.screenIds.push(id);
    into.steps = into.screenIds.map((id) => ({ screenId: id, action: (into.steps ?? []).find((step) => step.screenId === id)?.action ?? null }));
    for (const flow of flowsDoc.flows) if (flow.parentId === from.id) flow.parentId = into.id;
    flowsDoc.flows = flowsDoc.flows.filter((flow) => flow !== from);
    fixes += 1;
  }
  // A flow left with no screens goes; its children move up to its parent.
  for (const flow of [...flowsDoc.flows]) {
    if (!owned(flow) || flow.screenIds.length) continue;
    for (const child of flowsDoc.flows) if (child.parentId === flow.id) child.parentId = flow.parentId ?? null;
    flowsDoc.flows = flowsDoc.flows.filter((entry) => entry !== flow);
  }
  // A flow's step order, when the review gives it: the flow's own screens, in order.
  for (const fix of Array.isArray(corrections.flows) ? corrections.flows : []) {
    const flow = flowById.get(fix.id);
    if (!owned(flow) || !Array.isArray(fix.order)) continue;
    const order = fix.order.filter((id) => flow.screenIds.includes(id));
    const rest = flow.screenIds.filter((id) => !order.includes(id));
    flow.screenIds = [...new Set([...order, ...rest])];
    flow.steps = flow.screenIds.map((id) => ({ screenId: id, action: (flow.steps ?? []).find((step) => step.screenId === id)?.action ?? null }));
  }
  // The flows the corrections list are shown in the order they are listed;
  // every other flow keeps its place.
  const listed = (Array.isArray(corrections.flows) ? corrections.flows : []).map((fix) => flowById.get(fix.id)).filter((flow) => owned(flow) && flowsDoc.flows.includes(flow));
  const slots = flowsDoc.flows.map((flow, at) => (listed.includes(flow) ? at : -1)).filter((at) => at >= 0);
  slots.forEach((at, n) => { flowsDoc.flows[at] = listed[n]; });
  writeJson(flowsFile, flowsDoc);

  // The app's category and its card pictures, when the review corrects them.
  // Card pictures name screens by their ids as the package lists them; the
  // folder sync below renames them along with the screens.
  if (corrections.app) {
    const appsFile = join(dataDir, 'apps.json');
    const appsDoc = readJson(appsFile, { apps: [] });
    const record = (Array.isArray(appsDoc) ? appsDoc : appsDoc.apps ?? []).find((entry) => entry.id === appId);
    let changed = false;
    if (record && INDUSTRIES.includes(corrections.app.industry) && record.industry !== corrections.app.industry) {
      record.industry = corrections.app.industry;
      changed = true;
    }
    for (const key of ['name', 'tagline']) {
      const value = typeof corrections.app[key] === 'string' ? corrections.app[key].trim() : '';
      if (record && value && record[key] !== value) {
        record[key] = value;
        changed = true;
      }
    }
    if (record && Array.isArray(corrections.app.cardScreens)) {
      const cards = corrections.app.cardScreens.filter((id) => fileOfId.has(id)).slice(0, 4);
      if (cards.length) {
        record.cardScreens = cards;
        changed = true;
      }
    }
    if (changed) {
      writeJson(appsFile, appsDoc);
      fixes += 1;
    }
  }
  const kept = corrections.rules ? addRules(dataDir, corrections.rules) : 0;
  await syncFolders({ appId, platform, version, dataDir });
  await rebuildManifest(dataDir);
  // The second check's approvals: a flow counts as approved only when this apply left it as it was looked at.
  const sequencesAfter = flowSequences(dataDir, appId, platform, version);
  const audited = new Set(readJson(join(dir, 'audited.json'), []));
  for (const entry of Array.isArray(corrections.audit) ? corrections.audit : []) {
    if (entry?.ok !== true) continue;
    const now = sequencesAfter.get(entry.flow);
    if (!now) skipsRefused.push(`"audit" names no flow of this version: ${String(entry.flow).slice(0, 80)}`);
    else if (sequencesBefore.get(entry.flow)?.sequence !== now.sequence) skipsRefused.push(`flow "${now.flow.name}" changed in this apply — look at its new flow sheet and approve it again`);
    else audited.add(`${entry.flow}:${now.sequence}`);
  }
  writeJson(join(dir, 'audited.json'), [...audited]);
  // A refused skip says why, above the moment the check lists as still open.
  const problems = [...skipsRefused, ...checkVersion({ appId, platform, version, dataDir })];
  // A clean pass ends the "reviewing" state; with problems left the review is back on its last step, fixing them.
  if (problems.length) {
    const started = readJson(join(dir, 'reviewing.json'), { startedAt: new Date().toISOString() });
    writeJson(join(dir, 'reviewing.json'), { ...started, step: 7 });
  } else rmSync(join(dir, 'reviewing.json'), { force: true });
  // Done: the screens are right, so the review's working files are no longer
  // needed — the recording, frame strips, contact sheets, screen list and
  // corrections go. Kept: reviewed.json (the "Reviewed by Claude" mark) and
  // this review's backup, so it can still be undone. Another review rebuilds
  // the package with review-pack.
  if (!problems.length) {
    dropCache(dir);
    for (const entry of readdirSync(dir)) {
      const working = /^recording\./.test(entry) || entry === 'frames' || /^sheet-\d+\.png$/.test(entry) || entry === 'screens.json' || entry === 'doubts.json' || entry === 'missed.json' || /^(flow-\d+\.png|flow-sheets\.json|findings\.json|confirmed\.json|checked\.json|audited\.json|preparing\.json)$/.test(entry) || /^corrections.*\.json$/.test(entry) || /^reviewed-before.*\.json$/.test(entry);
      const olderBackup = entry.startsWith('backup-') && join(dir, entry) !== backup;
      if (working || olderBackup) rmSync(join(dir, entry), { recursive: true, force: true });
    }
    log.info('review: finished — working files removed, the backup kept for undo');
  }
  writeJson(join(dir, 'reviewed.json'), { reviewedAt: new Date().toISOString(), by: 'Claude', fixes, rulesAdded: kept, backup, problems });
  // The mark also goes in the library's own list, so the review's folder can be
  // deleted once the admin is happy without losing "Reviewed by Claude".
  const marks = readJson(join(dataDir, 'reviewed.json'), {});
  if (problems.length) delete marks[`${appId}-${platform}-${version}`];
  else marks[`${appId}-${platform}-${version}`] = { reviewedAt: new Date().toISOString(), by: 'Claude', fixes };
  writeJson(join(dataDir, 'reviewed.json'), marks);
  // Problems left: a fresh package for the next pass. None: nothing to review again.
  if (problems.length) await writeReviewPack({ appId, platform, version, dataDir, light: true }).catch(() => null);
  log.ok(`review applied: ${fixes} fix(es), ${kept} new rule(s) kept; backup in ${backup}`);
  if (problems.length) {
    log.warn(`review check: ${problems.length} problem(s) left — fix them and apply again:`);
    for (const problem of problems) log.warn(`  - ${problem}`);
  } else {
    log.ok('review check: no problems left');
  }
  return { fixes, rulesAdded: kept, backup, problems };
}

/** Puts back what the last applied review replaced. */
export async function undoReview(options) {
  const dataDir = resolveDataDir(options.dataDir);
  const { appId, version } = options;
  const platform = options.platform || 'ios';
  const dir = reviewDir(dataDir, appId, platform, version);
  const backups = existsSync(dir) ? readdirSync(dir).filter((entry) => entry.startsWith('backup-')).sort() : [];
  if (!backups.length) throw new Error('no applied review to undo');
  const backup = join(dir, backups[backups.length - 1]);
  const versionDir = join(dataDir, 'screens', platform, appId, VERSIONS_DIR_NAME, version);
  rmSync(versionDir, { recursive: true, force: true });
  cpSync(join(backup, 'version'), versionDir, { recursive: true });
  cpSync(join(backup, 'flows.json'), join(dataDir, 'flows.json'));
  if (existsSync(join(backup, 'apps.json'))) cpSync(join(backup, 'apps.json'), join(dataDir, 'apps.json'));
  if (existsSync(join(backup, 'review-rules.json'))) cpSync(join(backup, 'review-rules.json'), rulesFile(dataDir));
  const tag = `${appId}-${platform}-${VERSIONS_DIR_NAME}-${version}-`;
  for (const kind of ['analysis', 'words']) {
    const into = join(dataDir, kind);
    if (!existsSync(join(backup, kind)) || !existsSync(into)) continue;
    for (const entry of readdirSync(into)) if (entry.startsWith(tag)) rmSync(join(into, entry));
    for (const entry of readdirSync(join(backup, kind))) cpSync(join(backup, kind, entry), join(into, entry));
  }
  rmSync(join(dir, 'reviewed.json'), { force: true });
  const marks = readJson(join(dataDir, 'reviewed.json'), {});
  delete marks[`${appId}-${platform}-${version}`];
  writeJson(join(dataDir, 'reviewed.json'), marks);
  rmSync(backup, { recursive: true, force: true });
  await rebuildManifest(dataDir);
  log.ok(`review undone from ${backup}`);
  return { restored: backup };
}

/**
 * Everything a finished review must leave right, checked on the stored data:
 * the version's screens, its flow tree and the app record. Returns plain
 * sentences, one per problem; an empty list means the upload is clean. The
 * review package carries the list, and apply-review prints it afterwards.
 */
export function checkVersion(options) {
  const dataDir = resolveDataDir(options.dataDir);
  const { appId, version } = options;
  const platform = options.platform || 'ios';
  const appDir = join(dataDir, 'screens', platform, appId);
  const versionDir = join(appDir, VERSIONS_DIR_NAME, version);
  if (!existsSync(versionDir)) return [`no ${version} version stored`];
  const problems = [];
  const tag = `${appId}-${platform}-${VERSIONS_DIR_NAME}-${version}-`;
  const files = listImages(versionDir).map((rel) => `${VERSIONS_DIR_NAME}/${version}/${rel}`);
  const idOf = (rel) => `${appId}-${platform}-${rel.replace(/\.[^.]+$/, '').split('/').join('-')}`;
  const tagList = new Set((readJson(join(dataDir, 'tags.json'), { tags: [] }).tags || []).map((entry) => (typeof entry === 'string' ? entry : entry?.slug)));
  const screens = files.map((rel) => ({ id: idOf(rel), sidecar: readJson(join(appDir, rel.replace(/\.[^.]+$/, '.json')), {}) }));

  for (const { id, sidecar } of screens) {
    const short = id.slice(tag.length);
    const name = String(sidecar.name ?? '').trim();
    if (!name) problems.push(`screen ${short} has no name`);
    else if (/\(\d+\)$|\s\d+$/.test(name)) problems.push(`screen ${short} "${name}" has a number at the end of its name`);
    else if (/[·|]| - |\bscreen$/i.test(name)) problems.push(`screen ${short} "${name}" is not a plain name (no "·", " - " or trailing "screen")`);
    if (!sidecar.screenType || sidecar.screenType === 'other') problems.push(`screen ${short} "${name}" has no type (other)`);
    else if (!PUBLISHED_TYPES.includes(sidecar.screenType)) problems.push(`screen ${short} "${name}" has an unknown type "${sidecar.screenType}"`);
    const extras = Array.isArray(sidecar.extraTypes) ? sidecar.extraTypes : [];
    if (extras.includes(sidecar.screenType) || extras.includes('other') || extras.length > 4) problems.push(`screen ${short} "${name}" has bad extra types`);
    const elements = Array.isArray(sidecar.elements) ? sidecar.elements : [];
    if (elements.some((element) => !ELEMENTS.includes(element)) || elements.length > 6) problems.push(`screen ${short} "${name}" has unknown or too many elements`);
    const tags = Array.isArray(sidecar.tags) ? sidecar.tags : [];
    if ((tagList.size && tags.some((t) => !tagList.has(t))) || tags.length > 5) problems.push(`screen ${short} "${name}" has unknown or too many tags`);
  }

  const flows = (readJson(join(dataDir, 'flows.json'), { flows: [] }).flows || []).filter((flow) => flow.appId === appId && flow.platform === platform && (flow.screenIds ?? []).some((sid) => sid.startsWith(tag)));
  const ids = new Set(screens.map((screen) => screen.id));
  const listed = new Set(flows.flatMap((flow) => flow.screenIds));
  for (const { id } of screens) if (!listed.has(id)) problems.push(`screen ${id.slice(tag.length)} is in no flow`);
  // One screen, one flow: a screen listed in an area and again in a flow inside it shows twice.
  for (const { id } of screens) {
    const holders = flows.filter((flow) => flow.screenIds.includes(id));
    if (holders.length > 1) problems.push(`screen ${id.slice(tag.length)} is in ${holders.length} flows (${holders.map((flow) => `"${flow.name}"`).join(', ')}) — keep it only in the one it belongs to`);
  }
  const byId = new Map(flows.map((flow) => [flow.id, flow]));
  const typeOf = new Map(screens.map(({ id, sidecar }) => [id, sidecar.screenType]));
  const seen = new Map();
  for (const flow of flows) {
    const own = flow.screenIds.filter((sid) => ids.has(sid));
    if (flow.screenIds.some((sid) => sid.startsWith(tag) && !ids.has(sid))) problems.push(`flow "${flow.name}" lists screens that are not stored`);
    if (!PUBLISHED_FLOW_CATEGORIES.includes(flow.category)) problems.push(`flow "${flow.name}" has an unknown category "${flow.category}"`);
    if (flow.parentId && !byId.has(flow.parentId)) problems.push(`flow "${flow.name}" has a parent that is gone`);
    const key = `${flow.parentId ?? ''}|${String(flow.name).trim().toLowerCase()}`;
    if (seen.has(key)) problems.push(`two flows named "${flow.name}" in one place`);
    seen.set(key, flow);
    const hasChildren = flows.some((other) => other.parentId === flow.id);
    if (own.length && !hasChildren && own.every((sid) => ['permission', 'loading', 'splash'].includes(typeOf.get(sid)))) problems.push(`flow "${flow.name}" holds only a prompt or loading screen — it belongs to the flow before it`);
    if (/ - |\(|\)|\bflow\b/i.test(flow.name)) problems.push(`flow "${flow.name}" is not a plain task name`);
  }

  problems.push(...reviewLayerProblems({ dataDir, appId, platform, version, appDir, screens, flows, tag }));
  for (const moment of undecidedMoments(reviewDir(dataDir, appId, platform, version))) {
    problems.push(`a moment at ${moment.at}s in the recording is in no screen — add it ("add"), or skip it with a reason ("skip": { "at", "why" })`);
  }
  const appsDoc = readJson(join(dataDir, 'apps.json'), { apps: [] });
  const record = (Array.isArray(appsDoc) ? appsDoc : appsDoc.apps ?? []).find((entry) => entry.id === appId);
  if (!record) problems.push(`app ${appId} has no record in apps.json`);
  else {
    if (!INDUSTRIES.includes(record.industry) || record.industry === 'other') problems.push(`app ${appId} has no proper category (industry "${record.industry}")`);
    if (!String(record.name ?? '').trim()) problems.push(`app ${appId} has no name`);
    if (!String(record.tagline ?? '').trim()) problems.push(`app ${appId} has no tagline`);
    // The logo is a file named for the app in logos/ — none means the app shows its initials.
    const logos = existsSync(join(dataDir, 'logos')) ? readdirSync(join(dataDir, 'logos')) : [];
    if (!logos.some((entry) => entry.replace(/\.[^.]+$/, '') === appId)) problems.push(`app ${appId} has no logo — add one with the Logo button in the admin, or ask the agent`);
    const appIds = new Set(readdirSync(join(appDir, VERSIONS_DIR_NAME)).filter((v) => statSync(join(appDir, VERSIONS_DIR_NAME, v)).isDirectory()).flatMap((v) => listImages(join(appDir, VERSIONS_DIR_NAME, v)).map((rel) => idOf(`${VERSIONS_DIR_NAME}/${v}/${rel}`))));
    const cards = Array.isArray(record.cardScreens) ? record.cardScreens : [];
    if (cards.some((sid) => !appIds.has(sid))) problems.push(`app ${appId} card pictures point at screens that are gone`);
    else if (cards.length < 4) problems.push(`app ${appId} has fewer than four card pictures`);
    const weak = cards.filter((sid) => ['splash', 'loading', 'permission', 'error'].includes(typeOf.get(sid)));
    if (weak.length) problems.push(`app ${appId} card pictures include a splash, loading, permission or error screen`);
  }
  return problems;
}

/**
 * The review layer, active once a package was built (findings.json): every finding fixed or
 * confirmed, every kept screen given a verdict, every flow approved by the second check as it
 * now stands. A changed picture or flow needs its verdict or approval again.
 */
function reviewLayerProblems({ dataDir, appId, platform, version, appDir, screens, flows, tag }) {
  const dir = reviewDir(dataDir, appId, platform, version);
  const findings = readJson(join(dir, 'findings.json'), null);
  if (!findings) return [];
  const problems = [];
  const confirmed = new Set(readJson(join(dir, 'confirmed.json'), []).map((entry) => entry.key));
  // Ids flatten the folder path, so each hash is read from the file its id came from.
  const hashOf = new Map();
  const files = listImages(join(appDir, VERSIONS_DIR_NAME, version));
  for (const rel of files) hashOf.set(`${tag}${rel.replace(/\.[^.]+$/, '').split('/').join('-')}`, pictureHash(join(appDir, VERSIONS_DIR_NAME, version, rel)));
  const present = new Set(hashOf.values());
  for (const entry of findings.picture ?? []) if (present.has(entry.key.split(':')[1]) && !confirmed.has(entry.key)) problems.push(`${entry.message} — or confirm it ("confirm": [{ "key": "${entry.key}", "why" }])`);
  for (const entry of findings.duplicate ?? []) if (entry.hashes.every((h) => present.has(h)) && !confirmed.has(entry.key)) problems.push(`${entry.message} ("confirm": [{ "key": "${entry.key}", "why" }])`);
  for (const entry of findings.blank ?? []) if (present.has(entry.hash) && !confirmed.has(entry.key)) problems.push(`${entry.message} ("confirm": [{ "key": "${entry.key}", "why" }])`);
  // Steps out of the recording's order: a flow read wrong, or a picture whose time is stale.
  const timeOf = new Map(screens.map(({ id, sidecar }) => [id, sidecar.capture?.atSeconds]));
  for (const flow of flows) {
    let previous = null;
    for (const sid of flow.screenIds) {
      const at = timeOf.get(sid);
      if (typeof at !== 'number') continue;
      if (previous && at < previous.at - 1) {
        const key = `order:${hashOf.get(sid)}`;
        if (!confirmed.has(key)) problems.push(`in "${flow.name}", ${sid.slice(tag.length)} (${at}s) comes after ${previous.sid.slice(tag.length)} (${previous.at}s) but is earlier in the recording — fix the order ("order"), retake its picture at its true moment ("frames"), or confirm the order ("confirm": [{ "key": "${key}", "why" }])`);
      }
      previous = { sid, at };
    }
  }
  const checked = new Set(readJson(join(dir, 'checked.json'), []));
  const unchecked = screens.filter(({ id }) => !checked.has(hashOf.get(id))).map(({ id }) => id.slice(tag.length));
  if (unchecked.length) problems.push(`${unchecked.length} screen(s) have no verdict yet — look at each and give it a verdict ("sheets" for a whole contact sheet, "checked" for one screen): ${unchecked.slice(0, 25).join(', ')}${unchecked.length > 25 ? ', …' : ''}`);
  const audited = new Set(readJson(join(dir, 'audited.json'), []));
  const open = [...flowSequences(dataDir, appId, platform, version)].filter(([id, { sequence }]) => !audited.has(`${id}:${sequence}`)).map(([, { flow }]) => `"${flow.name}"`);
  if (open.length) problems.push(`${open.length} flow(s) not yet approved by the second check as they stand now (audit-motvin.md, flow sheets): ${open.slice(0, 25).join(', ')}${open.length > 25 ? ', …' : ''}`);
  return problems;
}

/** Seconds around a screen's moment shown in its frame strip. */
const STRIP_OFFSETS = [-0.9, -0.6, -0.3, 0, 0.3, 0.6, 1, 1.5, 2.2, 3];
/** Frames a second the strip is read at. */
const STRIP_FPS = 10;

/** Path of the recording kept in a review package, or null. */
export function recordingIn(dir) {
  if (!existsSync(dir)) return null;
  const name = readdirSync(dir).find((entry) => /^recording\.[a-z0-9]+$/i.test(entry));
  return name ? join(dir, name) : null;
}

function stripScore(gray) {
  let mean = 0;
  for (const v of gray) mean += v;
  mean /= gray.length;
  let spread = 0;
  for (const v of gray) spread += (v - mean) ** 2;
  let edge = 0;
  for (let i = 1; i < gray.length; i++) edge += Math.abs(gray[i] - gray[i - 1]);
  return edge / gray.length + Math.sqrt(spread / gray.length) / 4;
}

function grayDiff(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d / a.length;
}

/**
 * With the recording kept, every screen gets a strip of the frames around its
 * moment (frames/<n>.png, each labelled with its second) so the review can
 * pick the best picture: a sharper one than a frame caught mid-fade, a fully
 * loaded one, or — for the first step of a flow — the clean start before
 * anything was typed. Likely better pictures are marked on the screen
 * (`clearerAt`, `cleanerAt`) and land in the doubts.
 */
/** Screens whose strips are drawn at once. */
const STRIP_WORKERS = 6;

/** What the package build is doing now, for the Motvin agent's card ("Picture strips 120 of 501"). */
function reportPack(dir, detail) {
  for (const name of ['reviewing.json', 'preparing.json']) {
    const file = join(dir, name);
    if (!existsSync(file)) continue;
    try {
      writeJson(file, { ...readJson(file, {}), detail });
    } catch {
      // Progress is a nicety; the build goes on without it.
    }
  }
}

async function writeFrameStrips(dir, screens, flows, keptGrays) {
  const recording = recordingIn(dir);
  if (!recording) return;
  const timed = screens.filter((screen) => typeof screen.atSeconds === 'number');
  if (!timed.length) return;
  const framesDir = join(dir, 'frames');
  mkdirSync(framesDir, { recursive: true });
  const raw = join(framesDir, 'raw');
  // Frame 0 is not read back by the frame reader; the first readable one stands in for it.
  const at = (screen, offset) => Math.max(1, Math.round((screen.atSeconds + offset) * STRIP_FPS));
  const indexes = [...new Set(timed.flatMap((screen) => STRIP_OFFSETS.map((offset) => at(screen, offset))))];
  let paths;
  // Frames read during the upload are taken from its cache; only the rest is read now.
  const cache = await readyCache(dir, recording);
  const cached = new Map(cache ? indexes.map((index) => [index, cachedFrame(cache, index)]).filter(([, path]) => existsSync(path)) : []);
  const missing = indexes.filter((index) => !cached.has(index));
  // The frame reader runs on its own: its progress is the frames it has written so far.
  const reading = setInterval(() => {
    const count = existsSync(raw) ? readdirSync(raw).length : 0;
    reportPack(dir, `Reading frames ${count} of ${missing.length}`);
  }, 3000);
  try {
    paths = missing.length ? await extractFramesAt(recording, raw, STRIP_FPS, missing) : new Map();
    for (const [index, path] of cached) paths.set(index, path);
  } catch (error) {
    log.warn(`review: could not read frames from the recording — ${String(error.message).split('\n')[0]}`);
    return;
  } finally {
    clearInterval(reading);
  }
  const firstOfFlow = new Set(flows.map((flow) => flow.screenIds[0]).filter(Boolean));
  const W = 320;
  let done = 0;
  const one = async (screen) => {
    const cells = [];
    for (const offset of STRIP_OFFSETS) {
      const path = paths.get(at(screen, offset));
      if (!path) continue;
      const seconds = Math.round((screen.atSeconds + offset) * 10) / 10;
      const gray = await sharp(path).resize(32, 64, { fit: 'fill' }).greyscale().raw().toBuffer().catch(() => null);
      const fine = await compareGray(path).catch(() => null);
      const norm = fine ? normalised(fine) : null;
      const image = await sharp(path).resize({ width: W }).png().toBuffer().catch(() => null);
      if (gray && fine && image) cells.push({ offset, seconds, gray, fine, norm, image, score: stripScore(gray) });
    }
    const own = cells.find((cell) => cell.offset === 0);
    if (!own || cells.length < 2) return;
    // Same screen only: a frame from the next screen is not a better picture of this one.
    const same = cells.filter((cell) => grayDiff(cell.gray, own.gray) < 30);
    // A clearer picture must be this very page — brightness aside, so a dim fade still matches it.
    const samePage = cells.filter((cell) => pageChange(cell.norm, own.norm) <= SAME_PAGE_NORMALISED);
    const best = samePage.reduce((a, b) => (b.score > a.score ? b : a), own);
    if (best !== own && best.score >= own.score * 1.15) screen.clearerAt = best.seconds;
    // The same page, but something on it changes and stays — an error line, a filled field, a toggle:
    // likely a step of its own the upload folded into this one.
    const changed = same.find((cell) => cell.offset > 0 && grayDiff(cell.gray, own.gray) >= 2 && grayDiff(cell.gray, own.gray) < 30);
    if (changed) {
      screen.changesAt = changed.seconds;
      screen.changesGray = changed.fine;
      screen.changesPicture = `frames/change-${screen.n}.png`;
      writeFileSync(join(framesDir, `change-${screen.n}.png`), changed.image);
    }
    // Still moving: play on to the first moment the page holds still. When that page clearly
    // differs from the kept picture and is no other kept screen, the settled page is the real one.
    const keptGray = keptGrays.get(screen.id);
    const later = cells.filter((cell) => cell.offset > 0);
    const still = later.findIndex((cell, i) => later[i + 1] && pageChange(cell.fine, later[i + 1].fine) <= SAME_PAGE);
    // Only a picture taken while the page moves: a brief still of its own (a screen seen for a moment) is a step.
    const prev = cells.find((cell) => cell.offset === -0.3);
    const next = cells.find((cell) => cell.offset === 0.3);
    const moving = prev && next && pageChange(own.fine, prev.fine) > SAME_PAGE && pageChange(own.fine, next.fine) > SAME_PAGE;
    if (still >= 0) screen.settledGray = later[still].fine;
    // The picture is not what the recording shows at its time: the time is stale, so the
    // flow's order cannot be checked from it (a picture retaken from elsewhere, an old record).
    if (keptGray && pageChange(normalised(keptGray), own.norm) > SAME_PAGE_NORMALISED && !cells.some((cell) => pageChange(normalised(keptGray), cell.norm) <= SAME_PAGE_NORMALISED)) screen.staleTime = true;
    if (keptGray && still >= 0 && moving) {
      const settled = later[still];
      const change = pageChange(keptGray, settled.fine);
      const elsewhere = [...keptGrays].some(([id, gray]) => id !== screen.id && within(gray, settled.fine, SETTLED_SAME));
      if (change > SETTLED_SAME && !elsewhere) screen.settlesAt = settled.seconds;
    }
    if (firstOfFlow.has(screen.id)) {
      const before = samePage.filter((cell) => cell.offset < 0 && grayDiff(cell.gray, own.gray) > 1 && cell.score >= own.score * 0.9);
      if (before.length) screen.cleanerAt = before[0].seconds;
    }
    const meta = await sharp(cells[0].image).metadata();
    const h = meta.height ?? 200;
    const label = (text) => Buffer.from(`<svg width="${W}" height="28"><rect width="100%" height="100%" fill="#111"/><text x="8" y="20" font-size="16" fill="#fff" font-family="Arial">${text}</text></svg>`);
    const composite = cells.flatMap((cell, i) => [
      { input: cell.image, left: i * (W + 6), top: 0 },
      { input: label(`${cell.seconds}s${cell.offset === 0 ? ' (now)' : ''}`), left: i * (W + 6), top: h },
    ]);
    await sharp({ create: { width: cells.length * (W + 6), height: h + 28, channels: 3, background: '#e8e8e8' } })
      .composite(composite)
      .png()
      .toFile(join(framesDir, `${screen.n}.png`));
    done += 1;
    if (done % 10 === 0 || done === timed.length) reportPack(dir, `Picture strips ${done} of ${timed.length}`);
  };
  // A few screens at a time: the picture work runs in parallel threads.
  let next = 0;
  await Promise.all(Array.from({ length: STRIP_WORKERS }, async () => {
    while (next < timed.length) await one(timed[next++]);
  }));
  rmSync(raw, { recursive: true, force: true });
}

/** Two frames of one page, once each is stretched to full contrast (a fade in or out no longer counts). */
const SAME_PAGE_NORMALISED = 0.05;

/** A grey grid stretched to full contrast, so a dimmed frame lines up with its bright one. */
function normalised(gray) {
  const sorted = Uint8Array.from(gray).sort();
  const lo = sorted[Math.floor(sorted.length * 0.02)];
  const hi = sorted[Math.floor(sorted.length * 0.98)];
  const span = Math.max(1, hi - lo);
  return gray.map((v) => Math.max(0, Math.min(255, Math.round(((v - lo) * 255) / span))));
}

/** A kept picture this close to its settled page is settled (a cursor blink, a shadow). */
const SETTLED_SAME = 0.02;

/** Replaces a screen's picture with the recording's frame at `seconds`, at the picture's own size. */
async function takeFrame(recording, image, seconds, scratch) {
  const index = Math.max(0, Math.round(seconds * STRIP_FPS));
  const paths = await extractFramesAt(recording, scratch, STRIP_FPS, [index]);
  const frame = paths.get(index);
  if (!frame) throw new Error(`no frame at ${seconds}s`);
  const meta = await sharp(image).metadata();
  const ext = extname(image).toLowerCase();
  let out = sharp(frame).resize(meta.width, meta.height, { fit: 'fill' });
  out = ext === '.webp' ? out.webp({ quality: 90 }) : ext === '.jpg' || ext === '.jpeg' ? out.jpeg({ quality: 90 }) : out.png();
  const temp = `${image}.new`;
  await out.toFile(temp);
  cpSync(temp, image);
  rmSync(temp, { force: true });
}

/** The scan's frame grid: fine enough that a one-line error under a field splits a still. */
const SCAN_GRID = { width: 72, height: 156 };
/** Share of the page that must change between two scanned frames to start a new still. */
const SCAN_SPLIT = 0.0015;
/** A moment this close to a kept screen is that screen. */
const MATCHES_KEPT = 0.006;

/** Frames a second the recording is scanned at for missed moments. */
const SCAN_FPS = 8;
/** A still moment lasts at least this many scanned frames (about 0.4s — a quick toast or banner counts). */
const STILL_FRAMES = 3;

function changedShare(a, b, level) {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > level) n += 1;
  return n / a.length;
}

/**
 * Share of the page that changed, the status bar and the home indicator left
 * out — a clock, a battery or the bar shown on one frame and hidden on the
 * next is not a new step.
 */
function pageChange(a, b, width = COMPARE.width, level = 30) {
  const rows = a.length / width;
  const from = Math.ceil(rows * 0.07) * width;
  const to = Math.floor(rows * 0.95) * width;
  let n = 0;
  for (let i = from; i < to; i++) if (Math.abs(a[i] - b[i]) > level) n += 1;
  return n / (to - from);
}

// Fine enough to tell a one-line change apart ("Incorrect code" under the code boxes, the boxes still empty).
const COMPARE = { width: 96, height: 208 };

// Block sums of a compare grid's page band (bars left out), kept per grid: a cheap
// first look that can only rule pairs out, never in — so results stay the same.
const BLOCK = 8;
const blockSums = new WeakMap();
function blocksOf(gray) {
  let sums = blockSums.get(gray);
  if (sums) return sums;
  const width = COMPARE.width;
  const rows = gray.length / width;
  const from = Math.ceil(rows * 0.07);
  const to = Math.floor(rows * 0.95);
  const across = Math.ceil(width / BLOCK);
  sums = new Float64Array(across * Math.ceil((to - from) / BLOCK));
  for (let y = from; y < to; y++) for (let x = 0; x < width; x++) sums[Math.floor((y - from) / BLOCK) * across + Math.floor(x / BLOCK)] += gray[y * width + x];
  sums.pixels = (to - from) * width;
  blockSums.set(gray, sums);
  return sums;
}

/**
 * pageChange(a, b) <= share, exactly — sped up by the block sums: when no more than
 * `share` of the pixels differ by over 30, the mean difference is at most 30 + 225·share,
 * and the blocks' mean difference can never exceed the pixels'.
 */
function within(a, b, share) {
  if (a.length === COMPARE.width * COMPARE.height && b.length === a.length) {
    const x = blocksOf(a);
    const y = blocksOf(b);
    let total = 0;
    for (let i = 0; i < x.length; i++) total += Math.abs(x[i] - y[i]);
    if (total / x.pixels > 30 + 225 * share) return false;
  }
  return pageChange(a, b) <= share;
}
const compareGray = (path) => sharp(path).resize(COMPARE.width, COMPARE.height, { fit: 'fill' }).greyscale().raw().toBuffer();

/**
 * Every moment of the recording that holds still for a second yet matches no
 * kept screen — an error line that appeared, an empty state, a picker the
 * upload folded away — written to missed.json (with frames/missed-<k>.png) so
 * the review has to add or skip each one; the final check lists any left.
 */
async function writeMissedMoments(dir, screens) {
  rmSync(join(dir, 'missed.json'), { force: true });
  const recording = recordingIn(dir);
  if (!recording || !screens.length) return;
  const scratch = join(dir, 'frames', 'scan');
  let thumbs;
  const cache = await readyCache(dir, recording);
  const early = cache ? join(cache, 'scan.bin') : null;
  try {
    if (early && existsSync(early)) {
      const all = readFileSync(early);
      const size = SCAN_GRID.width * SCAN_GRID.height * 3;
      thumbs = Array.from({ length: Math.floor(all.length / size) }, (_, i) => all.subarray(i * size, (i + 1) * size));
    } else {
      reportPack(dir, 'Scanning the whole recording for missed steps');
      ({ thumbs } = await extractThumbs(recording, scratch, SCAN_FPS, SCAN_GRID));
    }
  } catch (error) {
    log.warn(`review: could not scan the recording — ${String(error.message).split('\n')[0]}`);
    return;
  }
  const prints = thumbs.map((thumb) => thumbToGray(thumb, SCAN_GRID.width, SCAN_GRID.height));
  const stills = [];
  let start = 0;
  for (let i = 1; i <= prints.length; i++) {
    if (i === prints.length || pageChange(prints[i], prints[i - 1], SCAN_GRID.width, 25) > SCAN_SPLIT) {
      if (i - start >= STILL_FRAMES) stills.push(Math.floor((start + i - 1) / 2));
      start = i;
    }
  }
  reportPack(dir, `Checking ${stills.length} still moments against the kept screens`);
  const paths = await extractFramesAt(recording, scratch, SCAN_FPS, stills.map((i) => Math.max(1, i)));
  const kept = await Promise.all(screens.map(async (screen) => ({ screen, gray: await compareGray(screen.file).catch(() => null) })));
  // A kept screen's settled page counts as shown: its finding swaps the picture to it.
  const shown = [...kept.map((entry) => entry.gray), ...screens.map((screen) => screen.settledGray)].filter(Boolean);
  const missed = [];
  const taken = [];
  for (const index of stills) {
    const path = paths.get(Math.max(1, index));
    if (!path) continue;
    const gray = await compareGray(path);
    const at = Math.round((index / SCAN_FPS) * 100) / 100;
    // Where each kept picture really is in the recording, for one whose own time is stale.
    for (const entry of kept) if (entry.gray && within(entry.gray, gray, MATCHES_KEPT)) (entry.screen.seenAt ??= []).push(at);
    if (shown.some((other) => within(other, gray, MATCHES_KEPT))) continue;
    // The same moment again (a page left and come back to) is decided once.
    if (taken.some((other) => within(other, gray, MATCHES_KEPT))) continue;
    taken.push(gray);
    const before = screens.filter((screen) => typeof screen.atSeconds === 'number' && screen.atSeconds <= at).sort((a, b) => b.atSeconds - a.atSeconds)[0] ?? null;
    const k = missed.length + 1;
    await sharp(path).resize({ width: 360 }).png().toFile(join(dir, 'frames', `missed-${k}.png`));
    missed.push({ k, at, after: before?.id ?? null, afterN: before?.n ?? null, picture: `frames/missed-${k}.png` });
  }
  rmSync(scratch, { recursive: true, force: true });
  // The strips' "something on it changes" moments are missed steps too, decided the same way.
  for (const screen of screens) {
    if (screen.changesAt === undefined || !screen.changesPicture) continue;
    if (missed.some((moment) => Math.abs(moment.at - screen.changesAt) <= 1.5)) continue;
    if (screens.some((other) => typeof other.atSeconds === 'number' && Math.abs(other.atSeconds - screen.changesAt) <= 0.3)) continue;
    if (screen.changesGray && [...shown, ...taken].some((other) => within(other, screen.changesGray, MATCHES_KEPT))) continue;
    missed.push({ k: missed.length + 1, at: screen.changesAt, after: screen.id, afterN: screen.n, picture: screen.changesPicture, from: 'strip' });
  }
  writeJson(join(dir, 'missed.json'), missed);
}

// Same page when no more than this share of it differs (96×208, bars left out): one
// frame of a still screen against another is ~0.002; an added "Incorrect code" line
// or code boxes still empty are ≥ 0.008.
const SAME_PAGE = 0.005;
const SKIP_REASONS = ['typing', 'pressed', 'bars', 'animation', 'same', 'picture'];

/** Why a skip of a missed moment is refused, or null when it stands. */
async function skipRefused(skip, { dir, moments, fileOfId, frames }) {
  if (!skip || typeof skip !== 'object' || typeof skip.at !== 'number') return 'a skip needs "at" and a "why"';
  if (!SKIP_REASONS.includes(skip.why)) return `"why" must be one of ${SKIP_REASONS.join(', ')}`;
  const moment = moments.find((entry) => Math.abs(entry.at - skip.at) <= 1.5);
  if (skip.why === 'picture') {
    const swapped = (Array.isArray(frames) ? frames : []).some((pick) => typeof pick.at === 'number' && Math.abs(pick.at - skip.at) <= 1.5);
    return swapped ? null : 'it says the moment is a better picture, but no "frames" swap uses it';
  }
  if (skip.why === 'same') {
    const kept = fileOfId.get(skip.same);
    if (!kept) return '"same" must name the kept screen it matches';
    if (!moment || !existsSync(join(dir, moment.picture))) return null;
    const change = pageChange(await compareGray(kept), await compareGray(join(dir, moment.picture)));
    if (change > SAME_PAGE) return `it is not the same page as ${skip.same} (${(change * 100).toFixed(1)}% differs — a new state, like an empty field or an error line)`;
  }
  return null;
}

/** A picture's identity: its bytes. A swapped picture is a new one; a moved file is the same. */
function pictureHash(file) {
  try {
    return createHash('sha1').update(readFileSync(file)).digest('hex').slice(0, 16);
  } catch {
    return null;
  }
}

/** Each flow's steps as a list of picture identities, in step order — what an audit approves. */
function flowSequences(dataDir, appId, platform, version) {
  const appDir = join(dataDir, 'screens', platform, appId);
  const versionDir = join(appDir, VERSIONS_DIR_NAME, version);
  const tag = `${appId}-${platform}-${VERSIONS_DIR_NAME}-${version}-`;
  const fileOf = new Map(listImages(versionDir).map((rel) => [`${appId}-${platform}-${`${VERSIONS_DIR_NAME}/${version}/${rel}`.replace(/\.[^.]+$/, '').split('/').join('-')}`, join(versionDir, rel)]));
  const flows = (readJson(join(dataDir, 'flows.json'), { flows: [] }).flows || []).filter((flow) => flow.appId === appId && flow.platform === platform && (flow.screenIds ?? []).some((sid) => sid.startsWith(tag)));
  const out = new Map();
  for (const flow of flows) {
    const own = flow.screenIds.filter((sid) => fileOf.has(sid));
    if (!own.length) continue;
    const sequence = createHash('sha1').update(`${flow.name}|${own.map((sid) => pictureHash(fileOf.get(sid))).join(',')}`).digest('hex').slice(0, 16);
    out.set(flow.id, { flow, sequence });
  }
  return out;
}

/** One sheet per flow, its steps left to right in order — how a person checks a flow reads. */
async function writeFlowSheets(dir, order, screens, pathOf) {
  const byId = new Map(screens.map((screen) => [screen.id, screen]));
  const W = 200;
  const PER_ROW = 8;
  let k = 0;
  const index = [];
  for (const flow of order) {
    const steps = flow.screenIds.map((sid) => byId.get(sid)).filter(Boolean);
    if (!steps.length) continue;
    k += 1;
    const cells = await Promise.all(steps.map(async (screen) => ({ screen, image: await sharp(screen.file).resize({ width: W }).png().toBuffer().catch(() => null) })));
    const h = Math.max(...(await Promise.all(cells.map(async (cell) => (cell.image ? (await sharp(cell.image).metadata()).height ?? 400 : 400)))));
    const rows = Math.ceil(cells.length / PER_ROW);
    const head = 44;
    const cellH = h + 56;
    const width = Math.min(cells.length, PER_ROW) * (W + 12) + 12;
    const esc = (text) => String(text).replace(/[<&>"]/g, '');
    const layers = [{ input: Buffer.from(`<svg width="${width}" height="${head}"><rect width="100%" height="100%" fill="#111"/><text x="12" y="29" font-size="20" font-weight="700" fill="#fff" font-family="Arial">${esc(`${k}. ${pathOf(flow)} (${flow.category ?? '?'})`).slice(0, 90)}</text></svg>`), left: 0, top: 0 }];
    cells.forEach((cell, i) => {
      const x = 12 + (i % PER_ROW) * (W + 12);
      const y = head + 12 + Math.floor(i / PER_ROW) * (cellH + 12);
      if (cell.image) layers.push({ input: cell.image, left: x, top: y });
      const label = esc(`${i + 1}. #${cell.screen.n} ${cell.screen.name}`).slice(0, 26);
      const sub = esc(`${cell.screen.type}${cell.screen.atSeconds !== null ? ` · ${cell.screen.atSeconds}s` : ''}`).slice(0, 30);
      layers.push({ input: Buffer.from(`<svg width="${W}" height="52"><rect width="100%" height="100%" fill="#222"/><text x="6" y="21" font-size="15" font-weight="700" fill="#fff" font-family="Arial">${label}</text><text x="6" y="43" font-size="13" fill="#bbb" font-family="Arial">${sub}</text></svg>`), left: x, top: y + h + 2 });
    });
    await sharp({ create: { width, height: head + 12 + rows * (cellH + 12), channels: 3, background: '#e9e9e9' } }).composite(layers).png().toFile(join(dir, `flow-${k}.png`));
    index.push({ k, id: flow.id, path: pathOf(flow), picture: `flow-${k}.png`, steps: steps.map((screen) => screen.n) });
  }
  writeJson(join(dir, 'flow-sheets.json'), index);
  return k;
}

/** The missed moments the review has not yet added or skipped. */
function undecidedMoments(dir) {
  const missed = readJson(join(dir, 'missed.json'), []);
  const decided = readJson(join(dir, 'decided.json'), []);
  return missed.filter((moment) => !decided.some((at) => Math.abs(at - moment.at) <= 1.5));
}

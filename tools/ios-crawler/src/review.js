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

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import sharp from 'sharp';
import { syncFolders } from './folders.js';
import { log } from './log.js';
import { rebuildManifest, resolveDataDir, VERSIONS_DIR_NAME } from './publish.js';
import { ELEMENTS, PUBLISHED_TYPES, typeFromName } from './taxonomy.js';

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
  for (const entry of readdirSync(dir)) if (/^sheet-\d+\.png$/.test(entry)) rmSync(join(dir, entry));

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
      elements: sidecar.elements ?? [],
      flow: holders[0] ? pathOf(holders[0]) : null,
      flowId: holders[0]?.id ?? null,
    });
  };
  const fileOfId = new Map(files.map((rel) => [idOf(rel), rel]));
  for (const flow of order) for (const id of flow.screenIds) if (fileOfId.has(id)) add(fileOfId.get(id));
  for (const rel of files) add(rel);

  const doubts = screens.map((screen) => ({ n: screen.n, id: screen.id, name: screen.name, type: screen.type, why: doubtOf(screen) })).filter((entry) => entry.why);
  const tree = order.map((flow) => ({ id: flow.id, path: pathOf(flow), category: flow.category, screens: flow.screenIds.length }));
  writeJson(join(dir, 'screens.json'), { app: appId, platform, version, generatedAt: new Date().toISOString(), types: PUBLISHED_TYPES, elements: ELEMENTS, tree, screens });
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
      const label = `#${cell.screen.n} ${cell.screen.type}`.replace(/[<&>]/g, '');
      const svg = `<svg width="${THUMB_WIDTH}" height="40" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#111"/><text x="8" y="27" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="700" fill="#fff">${label}</text></svg>`;
      layers.push({ input: Buffer.from(svg), left: x, top: y + cellHeight - 42 });
    });
    sheets += 1;
    await sharp({ create: { width, height, channels: 3, background: '#e9e9e9' } }).composite(layers).png().toFile(join(dir, `sheet-${sheets}.png`));
  }
  log.ok(`review package: ${screens.length} screen(s), ${sheets} sheet(s), ${doubts.length} doubt(s) in ${dir}`);
  return { dir, screens: screens.length, sheets, doubts: doubts.length };
}

// ─── Apply and undo ─────────────────────────────────────────────────────────

/**
 * Applies a review's corrections file:
 *
 *   { "screens": [ { "id", "name"?, "type"?, "elements"? } ],
 *     "flows":   [ { "id", "name"?, "parent"? (flow id, or null for the top), "category"? } ],
 *     "moves":   [ { "screen": id, "from": flow id, "to": flow id } ],
 *     "merges":  [ { "from": flow id, "into": flow id } ],
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
  mkdirSync(backup, { recursive: true });
  cpSync(versionDir, join(backup, 'version'), { recursive: true });
  cpSync(join(dataDir, 'flows.json'), join(backup, 'flows.json'));
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
    if (fix.type && PUBLISHED_TYPES.includes(fix.type)) sidecar.screenType = fix.type;
    if (Array.isArray(fix.elements)) sidecar.elements = fix.elements.filter((element) => ELEMENTS.includes(element));
    writeJson(sidecarPath, sidecar);
    fixes += 1;
  }

  const flowsFile = join(dataDir, 'flows.json');
  const flowsDoc = readJson(flowsFile, { version: 1, flows: [] });
  const flowById = new Map((flowsDoc.flows || []).map((flow) => [flow.id, flow]));
  const owned = (flow) => flow && flow.appId === appId && flow.platform === platform;
  for (const fix of Array.isArray(corrections.flows) ? corrections.flows : []) {
    const flow = flowById.get(fix.id);
    if (!owned(flow)) continue;
    if (typeof fix.name === 'string' && fix.name.trim()) flow.name = fix.name.trim();
    if (fix.category) flow.category = fix.category;
    if (fix.parent === null || (fix.parent && owned(flowById.get(fix.parent)) && fix.parent !== flow.id)) flow.parentId = fix.parent;
    fixes += 1;
  }
  for (const move of Array.isArray(corrections.moves) ? corrections.moves : []) {
    const from = flowById.get(move.from);
    const to = flowById.get(move.to);
    if (!owned(from) || !owned(to)) continue;
    from.screenIds = from.screenIds.filter((id) => id !== move.screen);
    from.steps = (from.steps ?? []).filter((step) => step.screenId !== move.screen);
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
  writeJson(flowsFile, flowsDoc);

  const kept = corrections.rules ? addRules(dataDir, corrections.rules) : 0;
  await syncFolders({ appId, platform, version, dataDir });
  await rebuildManifest(dataDir);
  writeJson(join(dir, 'reviewed.json'), { reviewedAt: new Date().toISOString(), by: 'Claude', fixes, rulesAdded: kept, backup });
  await writeReviewPack({ appId, platform, version, dataDir }).catch(() => null);
  log.ok(`review applied: ${fixes} fix(es), ${kept} new rule(s) kept; backup in ${backup}`);
  return { fixes, rulesAdded: kept, backup };
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
  if (existsSync(join(backup, 'review-rules.json'))) cpSync(join(backup, 'review-rules.json'), rulesFile(dataDir));
  const tag = `${appId}-${platform}-${VERSIONS_DIR_NAME}-${version}-`;
  for (const kind of ['analysis', 'words']) {
    const into = join(dataDir, kind);
    if (!existsSync(join(backup, kind)) || !existsSync(into)) continue;
    for (const entry of readdirSync(into)) if (entry.startsWith(tag)) rmSync(join(into, entry));
    for (const entry of readdirSync(join(backup, kind))) cpSync(join(backup, kind, entry), join(into, entry));
  }
  rmSync(join(dir, 'reviewed.json'), { force: true });
  rmSync(backup, { recursive: true, force: true });
  await rebuildManifest(dataDir);
  log.ok(`review undone from ${backup}`);
  return { restored: backup };
}

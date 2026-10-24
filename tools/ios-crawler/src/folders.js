/**
 * Keeps a version's folders on disk in step with its flow tree.
 *
 * A screen is stored once, in the folder of the most specific flow it is a
 * step of — the task, not the area around it — and numbered in that flow's
 * step order: `versions/<date>/connecting-a-calendar/3.webp`. A recording is
 * published that way; when the tree changes afterwards (a flow renamed or
 * moved by the admin, a fix-flows run), this puts the files where the tree
 * now says.
 *
 * A screen's id is built from its path, so moving a file renames its id: the
 * analysis and words records follow it, and so does every flow step in
 * flows.json. Nothing is deleted — the version folder as it was, and the old
 * records, are moved into a dated backup folder outside the store.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative } from 'node:path';
import { log } from './log.js';
import { rebuildManifest, resolveDataDir, safeName, VERSIONS_DIR_NAME } from './publish.js';

const IMAGES = new Set(['.webp', '.png', '.jpg', '.jpeg']);

/** Mirrors the builder's screen id: the app, the platform and every path segment, hyphenated. */
function screenIdOf(appId, platform, relPath) {
  return `${appId}-${platform}-${relPath.replace(/\.[^.]+$/, '').split('/').join('-')}`;
}

function listImages(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...listImages(path, base));
    else if (IMAGES.has(extname(entry).toLowerCase())) out.push(relative(base, path));
  }
  return out;
}

/**
 * @param {{appId: string, platform?: string, version: string, dataDir?: string, dryRun?: boolean}} options
 * @returns {Promise<{moved: number, folders: number, backup: string|null}>}
 */
export async function syncFolders(options) {
  const dataDir = resolveDataDir(options.dataDir);
  const { appId, version } = options;
  const platform = options.platform || 'ios';
  const appDir = join(dataDir, 'screens', platform, appId);
  const versionDir = join(appDir, VERSIONS_DIR_NAME, version);
  if (!existsSync(versionDir)) throw new Error(`no ${version} version stored at ${versionDir}`);

  const flowsFile = join(dataDir, 'flows.json');
  const flowsDoc = JSON.parse(readFileSync(flowsFile, 'utf-8'));
  const tag = `${appId}-${platform}-${VERSIONS_DIR_NAME}-${version}-`;
  const mine = (flowsDoc.flows || []).filter((flow) => flow.appId === appId && flow.platform === platform && (flow.screenIds ?? []).some((id) => id.startsWith(tag)));
  const byId = new Map(mine.map((flow) => [flow.id, flow]));
  const depth = (flow) => {
    let d = 0;
    for (let cursor = flow; cursor.parentId && byId.has(cursor.parentId) && d < 12; cursor = byId.get(cursor.parentId)) d++;
    return d;
  };
  // Tree order, parents before children, as the app page shows it.
  const order = [];
  const walk = (parentId) => {
    for (const flow of mine) if ((flow.parentId ?? null) === parentId && !order.includes(flow)) {
      order.push(flow);
      walk(flow.id);
    }
  };
  walk(null);
  for (const flow of mine) if (!order.includes(flow)) order.push(flow);
  const rank = new Map(order.map((flow, at) => [flow.id, at]));

  // No flows, nothing to line up with.
  if (!mine.length) return { moved: 0, folders: 0, backup: null };
  const files = listImages(versionDir).map((rel) => `${VERSIONS_DIR_NAME}/${version}/${rel.split('\\').join('/')}`);
  const fileOf = new Map(files.map((rel) => [screenIdOf(appId, platform, rel), rel]));

  // Each screen's home: the deepest flow that lists it, the earliest on a tie.
  const home = new Map();
  for (const id of fileOf.keys()) {
    const holders = mine.filter((flow) => flow.screenIds.includes(id)).sort((a, b) => depth(b) - depth(a) || rank.get(a.id) - rank.get(b.id));
    home.set(id, holders[0] ?? null);
  }
  const plan = new Map(); // old id -> new relative path
  const folderOf = new Map();
  const used = new Set();
  for (const flow of order) {
    let folder = safeName(flow.name) || 'flow';
    for (let n = 2; used.has(folder); n++) folder = `${safeName(flow.name) || 'flow'}-${n}`;
    let position = 0;
    for (const id of flow.screenIds) {
      if (!fileOf.has(id) || home.get(id) !== flow || plan.has(id)) continue;
      if (!folderOf.has(flow.id)) {
        used.add(folder);
        folderOf.set(flow.id, folder);
      }
      position += 1;
      plan.set(id, `${VERSIONS_DIR_NAME}/${version}/${folder}/${position}${extname(fileOf.get(id))}`);
    }
  }
  // A screen no flow lists stays exactly where it is — a manual upload's
  // loose files keep their layout.
  for (const [id, rel] of fileOf) if (!plan.has(id)) plan.set(id, rel);
  const newId = new Map([...plan].map(([id, rel]) => [id, screenIdOf(appId, platform, rel)]));
  if (new Set(newId.values()).size !== newId.size) throw new Error('two screens would land on one name — nothing moved');
  const moved = [...plan].filter(([id, rel]) => fileOf.get(id) !== rel).length;
  log.info(`folders: ${plan.size} screen(s) of ${appId} ${version} into ${new Set([...plan.values()].map((rel) => rel.split('/')[2])).size} folder(s), ${moved} moving`);
  if (!moved || options.dryRun) return { moved: options.dryRun ? moved : 0, folders: used.size, backup: null };

  // Built beside the store, then swapped in; the old folder goes to the backup.
  const backup = join(tmpdir(), `motvin-folder-sync-${appId}-${version}-${Date.now()}`);
  const staged = join(backup, 'new');
  for (const [id, rel] of plan) {
    const from = join(appDir, fileOf.get(id));
    const to = join(staged, rel);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to);
    const sidecar = from.replace(/\.[^.]+$/, '.json');
    if (existsSync(sidecar)) cpSync(sidecar, to.replace(/\.[^.]+$/, '.json'));
  }
  mkdirSync(join(backup, 'old'), { recursive: true });
  renameSync(versionDir, join(backup, 'old', version));
  cpSync(join(staged, VERSIONS_DIR_NAME, version), versionDir, { recursive: true });

  const flowName = new Map([...home].map(([id, flow]) => [id, flow?.name ?? null]));
  for (const kind of ['analysis', 'words']) {
    mkdirSync(join(backup, kind), { recursive: true });
    for (const [oldId, id] of newId) {
      const from = join(dataDir, kind, `${oldId}.json`);
      if (oldId === id || !existsSync(from)) continue;
      const record = JSON.parse(readFileSync(from, 'utf-8'));
      for (const key of ['screenId', 'screen_id', 'id']) if (record[key] === oldId) record[key] = id;
      if (kind === 'analysis' && flowName.get(oldId)) record.flow_name = flowName.get(oldId);
      renameSync(from, join(backup, kind, `${oldId}.json`));
      writeFileSync(join(dataDir, kind, `${id}.json`), `${JSON.stringify(record, null, 2)}\n`);
    }
  }
  writeFileSync(join(backup, 'flows.json'), readFileSync(flowsFile));
  for (const flow of flowsDoc.flows || []) {
    if (flow.appId !== appId) continue;
    flow.screenIds = (flow.screenIds ?? []).map((id) => newId.get(id) ?? id);
    for (const step of flow.steps ?? []) if (newId.has(step.screenId)) step.screenId = newId.get(step.screenId);
  }
  writeFileSync(flowsFile, `${JSON.stringify(flowsDoc, null, 2)}\n`);
  // The app's card pictures name screens by id too.
  const appsFile = join(dataDir, 'apps.json');
  if (existsSync(appsFile)) {
    const appsDoc = JSON.parse(readFileSync(appsFile, 'utf-8'));
    const record = (Array.isArray(appsDoc) ? appsDoc : appsDoc.apps ?? []).find((entry) => entry.id === appId);
    if (Array.isArray(record?.cardScreens) && record.cardScreens.some((id) => newId.has(id) && newId.get(id) !== id)) {
      writeFileSync(join(backup, 'apps.json'), readFileSync(appsFile));
      record.cardScreens = record.cardScreens.map((id) => newId.get(id) ?? id);
      writeFileSync(appsFile, `${JSON.stringify(appsDoc, null, 2)}\n`);
    }
  }
  writeFileSync(join(backup, 'id-map.json'), `${JSON.stringify(Object.fromEntries(newId), null, 2)}\n`);
  log.ok(`folders: ${moved} screen(s) moved; the old folder and records are kept in ${backup}`);
  await rebuildManifest(dataDir);
  return { moved, folders: used.size, backup };
}

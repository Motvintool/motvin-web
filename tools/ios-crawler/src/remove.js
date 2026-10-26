/**
 * Takes an upload back out of the library: one dated version of an app, or the
 * whole app when the upload made it. Used by the batch queue — to replace a
 * version of the same day before uploading it again, and when the admin stops
 * a batch now, so nothing half-made is left in the library.
 *
 * Like the admin's own delete, minus its "not the only version" guard: the
 * queue removes a version only to put the new upload in its place.
 */

import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withLibraryLock } from './lock.js';
import { log } from './log.js';
import { rebuildManifest, resolveDataDir, VERSIONS_DIR_NAME } from './publish.js';

const PLATFORMS = ['ios', 'web', 'webapp'];
const LOGO_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];

const readJson = (file, fallback) => {
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return fallback;
  }
};
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

/** Removes the version (or, with `wholeApp`, the app) and rebuilds the library. Returns what went. */
export async function removeUpload(options) {
  const dataDir = resolveDataDir(options.dataDir);
  const { appId, version, wholeApp } = options;
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(appId ?? '')) throw new Error('--app-id is required');
  if (!wholeApp && !/^\d{4}-\d{2}-\d{2}$/.test(version ?? '')) throw new Error('--version (YYYY-MM-DD) is required, or --whole-app');
  const removed = await withLibraryLock(dataDir, () => {
    // Screen and flow ids start like this: the version's, or every one of the app's.
    const prefixes = PLATFORMS.map((platform) => (wholeApp ? `${appId}-${platform}-` : `${appId}-${platform}-${VERSIONS_DIR_NAME}-${version}-`));
    const ours = (id) => typeof id === 'string' && prefixes.some((prefix) => id.startsWith(prefix));
    let screens = 0;
    for (const platform of PLATFORMS) {
      const dir = wholeApp ? join(dataDir, 'screens', platform, appId) : join(dataDir, 'screens', platform, appId, VERSIONS_DIR_NAME, version);
      if (!existsSync(dir)) continue;
      const count = (path) => readdirSync(path, { withFileTypes: true }).reduce((n, entry) => n + (entry.isDirectory() ? count(join(path, entry.name)) : /\.(webp|png|jpe?g)$/i.test(entry.name) ? 1 : 0), 0);
      screens += count(dir);
      rmSync(dir, { recursive: true, force: true });
    }
    for (const kind of ['analysis', 'words']) {
      const dir = join(dataDir, kind);
      if (!existsSync(dir)) continue;
      for (const entry of readdirSync(dir)) if (ours(entry)) rmSync(join(dir, entry), { force: true });
    }
    const flowsFile = join(dataDir, 'flows.json');
    const flowsDoc = readJson(flowsFile, { version: 1, flows: [] });
    const kept = (flowsDoc.flows ?? []).filter((flow) => !(flow.appId === appId && (wholeApp || ours(flow.id))));
    const flows = (flowsDoc.flows ?? []).length - kept.length;
    if (flows) writeJson(flowsFile, { ...flowsDoc, flows: kept });
    // Its "reviewed" marks and any review folder.
    const marksFile = join(dataDir, 'reviewed.json');
    const marks = readJson(marksFile, null);
    const markOf = (key) => PLATFORMS.some((platform) => (wholeApp ? key.startsWith(`${appId}-${platform}-`) : key === `${appId}-${platform}-${version}`));
    if (marks) {
      for (const key of Object.keys(marks)) if (markOf(key)) delete marks[key];
      writeJson(marksFile, marks);
    }
    const reviewsDir = join(dataDir, '..', 'reviews');
    if (existsSync(reviewsDir)) for (const entry of readdirSync(reviewsDir)) if (markOf(entry)) rmSync(join(reviewsDir, entry), { recursive: true, force: true });
    if (wholeApp) {
      for (const ext of LOGO_EXT) rmSync(join(dataDir, 'logos', `${appId}${ext}`), { force: true });
      const appsFile = join(dataDir, 'apps.json');
      const appsDoc = readJson(appsFile, { version: 1, apps: [] });
      writeJson(appsFile, { ...appsDoc, apps: (appsDoc.apps ?? []).filter((app) => app.id !== appId) });
      const sourcesFile = join(dataDir, 'sources.json');
      const sourcesDoc = readJson(sourcesFile, null);
      if (sourcesDoc?.sources?.[appId]) {
        delete sourcesDoc.sources[appId];
        writeJson(sourcesFile, sourcesDoc);
      }
    }
    return { screens, flows };
  });
  await rebuildManifest(dataDir);
  log.ok(`removed ${wholeApp ? `app ${appId}` : `${appId} ${version}`}: ${removed.screens} screen(s), ${removed.flows} flow(s)`);
  return removed;
}

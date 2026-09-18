/**
 * Landing a finished crawl in the Inspirations store.
 *
 * Nothing here invents a new storage format. The contract is the one in
 * motvin-backend/data/inspirations/README.md and enforced by
 * manifest.builder.ts, so this module's whole job is translation:
 *
 *   screens/ios/<app>/<type>[-n].png   the frame
 *   screens/ios/<app>/<type>[-n].json  the sidecar the builder reads
 *   analysis/<screen-id>.json          the crawler's full record — the rich
 *                                      29-value screen type, the description,
 *                                      the navigation edges, the blocked flag
 *   apps.json / flows.json             upserted
 *   sources.json                       upserted as status "approved"
 *
 * sources.json still records where each capture came from — its permission,
 * licence and attribution all surface in the manifest and on the screen page.
 * It no longer holds anything back: captures publish as soon as they are
 * written, and removing one is done from /inspirations/admin afterwards.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './exec.js';
import { log } from './log.js';
import { flowCategoryFor, publishedTypeFor, filterStyles, INDUSTRIES } from './taxonomy.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Where the store lives. Env var wins; otherwise the sibling backend checkout,
 * which is how these two repos sit on disk.
 */
export function resolveDataDir(explicit) {
  const candidate = explicit || process.env.INSPIRATIONS_DATA_DIR;
  if (candidate) return resolve(candidate);
  return resolve(HERE, '../../../../motvin-backend/data/inspirations');
}

function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch (error) {
    throw new Error(`${file} is not valid JSON: ${error.message}`);
  }
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** Matches the backend's path rules: lowercase, hyphenated, no surprises. */
export function safeName(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Publishes a crawl.
 * @param {{graph: ScreenGraph, app: object, dataDir?: string, dryRun?: boolean}} options
 */
export function publishCrawl(options) {
  const { graph, app } = options;
  const dataDir = resolveDataDir(options.dataDir);
  const platform = 'ios';

  if (!existsSync(dataDir)) {
    throw new Error(
      `Inspirations data directory not found: ${dataDir}\n` +
        'Set INSPIRATIONS_DATA_DIR, or pass --data-dir, to point at motvin-backend/data/inspirations.',
    );
  }
  if (!INDUSTRIES.includes(app.industry)) {
    throw new Error(`app.industry "${app.industry}" is not one the builder accepts: ${INDUSTRIES.join(', ')}`);
  }

  const appDir = join(dataDir, 'screens', platform, app.appId);
  const analysisDir = join(dataDir, 'analysis');

  const written = [];
  const typeCounts = new Map();
  const nodes = [...graph.nodes.values()];

  if (!options.dryRun) {
    mkdirSync(appDir, { recursive: true });
    mkdirSync(analysisDir, { recursive: true });
  }

  /**
   * Where each screen goes.
   *
   * With a flow grouping, a screen lives at `<flow>/<position>.png` — the
   * folder names the journey and the number is the order it was walked. That
   * ordering is the thing a gallery wants and a flat filename cannot carry.
   *
   * Without one, screens stay loose in the app folder named after their type,
   * which is the layout a manual upload produces.
   */
  const placement = new Map();
  const flowGroups = options.flows ?? [];

  for (const group of flowGroups) {
    const folder = safeName(group.name) || 'flow';
    group.folder = folder;
    if (!options.dryRun) mkdirSync(join(appDir, folder), { recursive: true });
    group.nodeIds.forEach((nodeId, position) => {
      placement.set(nodeId, { folder, position: position + 1 });
    });
  }

  // ─── Screens ────────────────────────────────────────────────────────────
  for (const node of nodes) {
    const analysis = node.analysis;
    const publishedType = publishedTypeFor(analysis.screenType);
    const placed = placement.get(node.id);

    let relativePath;
    let screenId;
    if (placed) {
      relativePath = `${placed.folder}/${placed.position}`;
      screenId = `${app.appId}-${platform}-${placed.folder}-${placed.position}`;
    } else {
      const index = (typeCounts.get(publishedType) ?? 0) + 1;
      typeCounts.set(publishedType, index);
      // The builder reads a screen's type from the filename prefix when no
      // sidecar overrides it, so the prefix has to be a published type.
      const base = safeName(index === 1 ? publishedType : `${publishedType}-${index}`);
      relativePath = base;
      screenId = `${app.appId}-${platform}-${base}`;
    }

    const fileName = `${relativePath}.png`;

    const sidecar = {
      name: analysis.name,
      screenType: publishedType,
      tags: [...new Set([...analysis.tags, analysis.screenType.replace(/_/g, '-'), 'ios'])].slice(0, 12),
      elements: analysis.elements,
      style: filterStyles(analysis.style),
      capturedAt: new Date().toISOString().slice(0, 10),
    };

    // The full record, including everything the 13-value published vocabulary
    // cannot express.
    const analysisRecord = {
      screen_id: screenId,
      screen_type: analysis.screenType,
      published_as: publishedType,
      category: analysis.category ?? app.industry,
      flow: analysis.flow ?? flowCategoryFor(analysis.screenType),
      // The journey this screen was filed under, and where in it — the pair a
      // gallery needs to show a flow as a sequence.
      flow_name: flowGroups.find((group) => group.folder === placed?.folder)?.name ?? null,
      flow_position: placed?.position ?? null,
      description: analysis.description,
      tags: sidecar.tags,
      elements: analysis.elements,
      style: sidecar.style,
      crawler: {
        nodeId: node.id,
        depth: node.depth,
        path: node.path,
        visits: node.visits,
        blocked: node.blocked,
        blockedReason: node.blockedReason,
        actions: [...node.actions.values()].map((action) => ({
          label: action.label,
          kind: action.kind,
          explored: action.explored,
          skipped: action.skipped,
          skipReason: action.skipReason,
          leadsTo: action.resultNodeId,
        })),
        reachedFrom: graph.edges.filter((edge) => edge.to === node.id).map((edge) => ({ from: edge.from, via: edge.label })),
        leadsTo: graph.edges.filter((edge) => edge.from === node.id).map((edge) => ({ to: edge.to, via: edge.label })),
      },
      capturedAt: sidecar.capturedAt,
      capturedBy: 'motvin-ios-crawler',
    };

    if (!options.dryRun) {
      copyFileSync(node.screenshot, join(appDir, fileName));
      writeJson(join(appDir, `${relativePath}.json`), sidecar);
      writeJson(join(analysisDir, `${screenId}.json`), analysisRecord);
    }

    written.push({
      nodeId: node.id,
      screenId,
      file: fileName,
      flow: placed?.folder ?? null,
      position: placed?.position ?? null,
      screenType: analysis.screenType,
      publishedType,
    });
  }

  // ─── apps.json ──────────────────────────────────────────────────────────
  const appsFile = join(dataDir, 'apps.json');
  const appsDoc = readJson(appsFile, { version: 1, apps: [] });
  appsDoc.apps = appsDoc.apps || [];
  const existingApp = appsDoc.apps.find((entry) => entry.id === app.appId);
  const appRecord = {
    id: app.appId,
    name: app.name,
    industry: app.industry,
    website: app.website ?? '',
    tagline: app.tagline ?? '',
  };
  if (existingApp) {
    Object.assign(existingApp, appRecord);
  } else {
    appsDoc.apps.push(appRecord);
  }

  // ─── sources.json — the gate, always left for a human ───────────────────
  const sourcesFile = join(dataDir, 'sources.json');
  const sourcesDoc = readJson(sourcesFile, { version: 1, sources: {} });
  sourcesDoc.sources = sourcesDoc.sources || {};
  const previous = sourcesDoc.sources[app.appId] || {};
  const auth = app.authorization || {};
  sourcesDoc.sources[app.appId] = {
    ...previous,
    sourceUrl: app.website ?? previous.sourceUrl ?? '',
    capturedAt: new Date().toISOString().slice(0, 10),
    capturedBy: 'motvin-ios-crawler',
    permission: auth.permission ?? previous.permission ?? '',
    license: auth.license ?? previous.license ?? '',
    licenseUrl: auth.licenseUrl ?? previous.licenseUrl ?? '',
    attribution: auth.attribution ?? previous.attribution ?? app.name,
    redistribution: previous.redistribution ?? 'allowed',
    // sources.json still records where a capture came from and under what
    // permission — the manifest shows all of it. It just no longer gates:
    // captures publish as soon as they are written.
    status: 'approved',
    notes: [previous.notes, `Crawled ${new Date().toISOString().slice(0, 10)} — authorized by ${auth.authorizedBy ?? 'unrecorded'} (${auth.grantedAt ?? 'no date'}).`]
      .filter(Boolean)
      .join(' ')
      .slice(0, 500),
  };

  // ─── flows.json ─────────────────────────────────────────────────────────
  const flowsFile = join(dataDir, 'flows.json');
  const flowsDoc = readJson(flowsFile, { version: 1, flows: [] });
  flowsDoc.flows = flowsDoc.flows || [];

  const screenIdByNode = new Map(written.map((entry) => [entry.nodeId, entry.screenId]));
  const flows = [];

  if (flowGroups.length) {
    // The named journeys: each folder is one flow, its screens already in the
    // order they were walked.
    for (const group of flowGroups) {
      const screenIds = group.nodeIds.map((nodeId) => screenIdByNode.get(nodeId)).filter(Boolean);
      if (screenIds.length < 2) continue; // The builder drops one-screen flows.
      flows.push({
        id: `${app.appId}-${platform}-${group.folder}`,
        appId: app.appId,
        name: group.name,
        category: group.category,
        platform,
        screenIds,
      });
    }
  } else {
    // No grouping available — fall back to one flow per category, ordered by
    // how deep into the app each screen was found.
    const buckets = new Map();
    for (const [index, node] of nodes.entries()) {
      const category = flowCategoryFor(node.analysis.screenType);
      if (!buckets.has(category)) buckets.set(category, []);
      buckets.get(category).push({ node, index, screenId: written[index].screenId });
    }
    for (const [category, members] of buckets) {
      if (members.length < 2) continue;
      members.sort((a, b) => a.node.depth - b.node.depth || a.index - b.index);
      flows.push({
        id: `${app.appId}-${platform}-${category}`,
        appId: app.appId,
        name: category.charAt(0).toUpperCase() + category.slice(1),
        category,
        platform,
        screenIds: members.map((member) => member.screenId),
      });
    }
  }

  for (const flow of flows) {
    const existingFlow = flowsDoc.flows.findIndex((entry) => entry.id === flow.id);
    if (existingFlow >= 0) flowsDoc.flows[existingFlow] = flow;
    else flowsDoc.flows.push(flow);
  }

  if (!options.dryRun) {
    writeJson(appsFile, appsDoc);
    writeJson(sourcesFile, sourcesDoc);
    writeJson(flowsFile, flowsDoc);
  }

  return {
    dataDir,
    appDir,
    screens: written,
    flows,
    status: sourcesDoc.sources[app.appId].status,
  };
}

/**
 * Finds the backend checkout that owns the builder.
 *
 * Deliberately not derived from the data directory: with --data-dir pointing at
 * a staging copy, the store and the code that builds it are in different
 * places. Order is explicit override, then the store's own parent (the normal
 * layout), then the sibling checkout next to this tool.
 */
export function resolveBackendDir(dataDir) {
  const candidates = [
    process.env.MOTVIN_BACKEND_DIR,
    resolve(dataDir, '../..'),
    resolve(HERE, '../../../../motvin-backend'),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const path = resolve(candidate);
    if (existsSync(join(path, 'package.json')) && existsSync(join(path, 'src/modules/inspirations'))) {
      return path;
    }
  }
  return null;
}

/**
 * Regenerates manifest.json by running the backend's own builder, so there is
 * exactly one implementation of the rules.
 */
export async function rebuildManifest(dataDir) {
  const backendDir = resolveBackendDir(dataDir);
  if (!backendDir) {
    log.warn('cannot locate the motvin-backend checkout — run "npm run build:inspirations" there yourself');
    log.detail('set MOTVIN_BACKEND_DIR to point at it');
    return null;
  }
  log.detail('rebuilding manifest…');
  const result = await run('npm', ['run', '--silent', 'build:inspirations'], {
    cwd: backendDir,
    // The builder CLI reads DATA_ROOT and appends "inspirations", so a custom
    // --data-dir rebuilds the store it actually wrote to rather than the
    // backend's default one.
    env: { DATA_ROOT: resolve(dataDir, '..') },
    timeout: 180_000,
  });
  if (result.failed) {
    log.warn(`manifest rebuild failed: ${result.stderr.trim().split('\n').slice(-3).join(' ') || `exit ${result.code}`}`);
    log.detail(`run it by hand: cd ${backendDir} && npm run build:inspirations`);
    return null;
  }
  return result.stdout.trim();
}

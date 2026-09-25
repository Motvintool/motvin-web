/**
 * Landing a finished crawl in the Inspirations store.
 *
 * Nothing here invents a new storage format. The contract is the one in
 * motvin-backend/data/inspirations/README.md and enforced by
 * manifest.builder.ts, so this module's whole job is translation:
 *
 *   screens/ios/<app>/<flow>/<n>.png    the frame, inside its journey
 *   screens/ios/<app>/<flow>/<n>.json   the sidecar the builder reads — name,
 *                                       type, state, description, tags,
 *                                       elements, style, capture facts
 *   screens/ios/<app>/<type>[-n].png    the fallback layout, when screens
 *                                       could not be grouped
 *   analysis/<screen-id>.json           the full record — the fine-grained
 *                                       screen type, the description, the
 *                                       findings the screen page shows, the
 *                                       palette, where it sat in the
 *                                       recording, what led to it and what it
 *                                       led to
 *   apps.json / flows.json              upserted
 *   sources.json                        upserted as status "approved"
 *
 * sources.json still records where each capture came from — its permission,
 * licence and attribution all surface in the manifest and on the screen page.
 * It no longer holds anything back: captures publish as soon as they are
 * written, and removing one is done from /inspirations/admin afterwards.
 *
 * A node marked `skipPublish` — a third-party sign-in page — is left out of
 * the store entirely, and reported, so the journey around it still reads as
 * one.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './exec.js';
import { log } from './log.js';
import { buildSections } from './heuristics.js';
import {
  filterStates,
  filterStyles,
  flowCategoryFor,
  INDUSTRIES,
  isPublishable,
  publishedTypeFor,
  stateFor,
} from './taxonomy.js';

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
 * Gives every node a name no other node in the same publish shares.
 *
 * Tab-based apps title every section with the same widget — "Address
 * unavailable" on Food, Grocery and Dining alike — so colliding names are
 * first told apart by what the screen itself says: the leading tab label
 * (which names the section), then the body headline. Only when neither
 * separates them does a running number.
 */
function uniqueNames(nodes) {
  const groups = new Map();
  for (const node of nodes) {
    const base = String(node.analysis?.name || 'Screen').trim() || 'Screen';
    const key = base.toLowerCase();
    if (!groups.has(key)) groups.set(key, { base, nodes: [] });
    groups.get(key).nodes.push(node);
  }

  const names = new Map();
  for (const { base, nodes: members } of groups.values()) {
    if (members.length === 1) {
      names.set(members[0].id, base);
      continue;
    }
    // The leading tab label names the section a tab-bar screen is on — "Food",
    // "Grocery", "Dining" — and is the one honest thing that tells siblings
    // with the same navigation title apart. A screen without a usable label
    // gets a running number instead; body text would read as a caption, not
    // a name.
    const labels = members.map((node) => {
      const label = node.analysis?.signals?.tabLabels?.[0];
      return label && label.toLowerCase() !== base.toLowerCase() && /^[A-Za-z][A-Za-z' ]{1,13}$/.test(label) ? label : null;
    });
    const counts = new Map();
    for (const label of labels) if (label) counts.set(label.toLowerCase(), (counts.get(label.toLowerCase()) ?? 0) + 1);
    let n = 0;
    members.forEach((node, index) => {
      const label = labels[index];
      if (label && counts.get(label.toLowerCase()) === 1) {
        names.set(node.id, `${base} · ${label}`);
      } else {
        n++;
        names.set(node.id, n === 1 ? base : `${base} (${n})`);
      }
    });
  }
  return names;
}

/**
 * Publishes a crawl.
 * @param {{graph: ScreenGraph, app: object, flows?: object[], dataDir?: string, dryRun?: boolean,
 *          capture?: {source?: string, fps?: number, frames?: number, durationSeconds?: number}}} options
 */
export function publishCrawl(options) {
  const { graph, app } = options;
  const dataDir = resolveDataDir(options.dataDir);
  const platform = app.platform || 'ios';

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
  const skipped = [];
  const typeCounts = new Map();
  const allNodes = [...graph.nodes.values()];

  // What is left out, and why. A third-party sign-in page is recognised so
  // that it can be excluded; the screens either side of it still publish.
  const nodes = allNodes.filter((node) => {
    const reason =
      node.skipReason ?? (node.skipPublish ? 'excluded' : !isPublishable(node.analysis?.screenType) ? `${node.analysis.screenType} screens are not published` : null);
    if (reason) {
      skipped.push({ nodeId: node.id, name: node.analysis?.name ?? node.id, screenType: node.analysis?.screenType ?? 'other', reason });
      return false;
    }
    return true;
  });

  const names = uniqueNames(nodes);
  const nameOf = (nodeId) => names.get(nodeId) ?? graph.get(nodeId)?.analysis?.name ?? null;

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
  const flowGroups = (options.flows ?? [])
    .map((group) => ({ ...group, nodeIds: group.nodeIds.filter((id) => nodes.some((node) => node.id === id)) }))
    .filter((group) => group.nodeIds.length >= 1);

  // A screen can sit in a flow and in one of that flow's child flows — an
  // onboarding and the sign-in inside it. It is stored once, in the deepest
  // flow that holds it, so the folder names the most specific journey; every
  // flow that lists it still refers to it by id.
  const depthOf = (group, seen = new Set()) => {
    if (!group.parent || seen.has(group.name)) return 0;
    seen.add(group.name);
    const parent = flowGroups.find((candidate) => candidate.name === group.parent);
    return parent ? depthOf(parent, seen) + 1 : 0;
  };
  const usedFolders = new Set();
  for (const group of flowGroups) {
    let folder = safeName(group.name) || 'flow';
    let n = 2;
    while (usedFolders.has(folder)) folder = `${safeName(group.name) || 'flow'}-${n++}`;
    usedFolders.add(folder);
    group.folder = folder;
    group.depth = depthOf(group);
  }
  for (const group of flowGroups) {
    const owned = group.nodeIds.filter((nodeId) => {
      const deeper = flowGroups.find((other) => other !== group && other.depth > group.depth && other.nodeIds.includes(nodeId));
      return !deeper;
    });
    if (!owned.length) continue;
    if (!options.dryRun) mkdirSync(join(appDir, group.folder), { recursive: true });
    owned.forEach((nodeId, position) => {
      placement.set(nodeId, { folder: group.folder, position: position + 1, total: owned.length, name: group.name });
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const capture = options.capture ?? {};

  // ─── Screens ────────────────────────────────────────────────────────────
  for (const node of nodes) {
    const analysis = node.analysis;
    const publishedType = publishedTypeFor(analysis.screenType);
    const placed = placement.get(node.id);
    const name = names.get(node.id);

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
    const states = filterStates([...(analysis.states ?? []), stateFor(analysis.screenType)].filter(Boolean));
    const nodeCapture = node.capture ?? null;

    const captureFacts = nodeCapture
      ? {
          atSeconds: nodeCapture.start,
          holdSeconds: nodeCapture.holdSeconds,
          brief: Boolean(nodeCapture.brief),
          visits: nodeCapture.visits ?? 1,
          ...(nodeCapture.overlayOf ? { overlayOf: nameOf(nodeCapture.overlayOf) } : {}),
          ...(nodeCapture.loadingOf ? { loadingOf: nameOf(nodeCapture.loadingOf) } : {}),
          ...(nodeCapture.scrolledFrom ? { scrolledFrom: nameOf(nodeCapture.scrolledFrom) } : {}),
        }
      : null;

    const sidecar = {
      name,
      screenType: publishedType,
      fineType: analysis.screenType,
      states,
      description: analysis.description || '',
      tags: [...new Set([...(analysis.tags ?? []), analysis.screenType.replace(/_/g, '-'), ...states, platform])].slice(0, 14),
      elements: analysis.elements ?? [],
      style: filterStyles(analysis.style),
      capturedAt: today,
      ...(captureFacts ? { capture: captureFacts } : {}),
    };

    const reachedFrom = graph.edges.filter((edge) => edge.to === node.id).map((edge) => ({ from: edge.from, via: edge.label, name: nameOf(edge.from) }));
    const leadsTo = graph.edges.filter((edge) => edge.from === node.id).map((edge) => ({ to: edge.to, via: edge.label, name: nameOf(edge.to) }));

    const palette = (nodeCapture?.colors ?? []).map((color) => ({ hex: color.hex, role: color.role, share: color.share }));

    const sections = buildSections({
      analysis: { ...analysis, name },
      capture: nodeCapture
        ? {
            ...nodeCapture,
            frames: capture.frames,
            fps: capture.fps,
            overlayOfName: captureFacts?.overlayOf ?? null,
            loadingOfName: captureFacts?.loadingOf ?? null,
            scrolledFromName: captureFacts?.scrolledFrom ?? null,
          }
        : null,
      flow: placed ? { name: placed.name, position: placed.position, total: placed.total } : null,
      from: [...new Set(reachedFrom.map((edge) => edge.name).filter(Boolean))],
      to: [...new Set(leadsTo.map((edge) => edge.name).filter(Boolean))],
    });

    // The full record, including everything the published vocabulary cannot
    // express, in the shape the screen page's "Analyze UI" panel reads.
    const analysisRecord = {
      screenId,
      screen_id: screenId,
      analyzer: analysis.viaHeuristics ? 'motvin on-device (Vision OCR + rules)' : analysis.analyzer ?? 'claude',
      analyzedAt: new Date().toISOString(),
      screen_type: analysis.screenType,
      published_as: publishedType,
      states,
      category: analysis.category ?? app.industry,
      flow: analysis.flow ?? flowCategoryFor(analysis.screenType),
      // The journey this screen was filed under, and where in it — the pair a
      // gallery needs to show a flow as a sequence.
      flow_name: placed?.name ?? null,
      flow_position: placed?.position ?? null,
      name,
      description: analysis.description,
      tags: sidecar.tags,
      elements: analysis.elements,
      style: sidecar.style,
      sections,
      palette,
      capture: nodeCapture
        ? {
            source: capture.source ?? null,
            fps: capture.fps ?? null,
            frames: capture.frames ?? null,
            frame: nodeCapture.frame,
            atSeconds: nodeCapture.start,
            endSeconds: nodeCapture.end,
            holdSeconds: nodeCapture.holdSeconds,
            brief: Boolean(nodeCapture.brief),
            kind: nodeCapture.kind,
            overlay: nodeCapture.overlay ?? null,
            overlayOf: captureFacts?.overlayOf ?? null,
            loadingOf: captureFacts?.loadingOf ?? null,
            scrolledFrom: captureFacts?.scrolledFrom ?? null,
            visits: nodeCapture.visits ?? 1,
          }
        : null,
      signals: analysis.signals ?? null,
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
        reachedFrom,
        leadsTo,
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
      name,
      file: fileName,
      flow: placed?.folder ?? null,
      flowName: placed?.name ?? null,
      position: placed?.position ?? null,
      screenType: analysis.screenType,
      publishedType,
      states,
      brief: Boolean(nodeCapture?.brief),
      atSeconds: nodeCapture?.start ?? null,
      holdSeconds: nodeCapture?.holdSeconds ?? null,
      // Versioned the way the manifest builder versions it, so the admin
      // page shows the frame just written rather than a cached earlier one.
      url: `/api/inspirations/screens/${platform}/${app.appId}/${fileName}?v=${Math.floor(Date.now() / 1000).toString(36)}`,
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

  // ─── sources.json — provenance, recorded and published ──────────────────
  const sourcesFile = join(dataDir, 'sources.json');
  const sourcesDoc = readJson(sourcesFile, { version: 1, sources: {} });
  sourcesDoc.sources = sourcesDoc.sources || {};
  const previous = sourcesDoc.sources[app.appId] || {};
  const auth = app.authorization || {};
  sourcesDoc.sources[app.appId] = {
    ...previous,
    sourceUrl: app.website ?? previous.sourceUrl ?? '',
    capturedAt: today,
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
    notes: [previous.notes, `Captured ${today} — authorized by ${auth.authorizedBy ?? 'unrecorded'} (${auth.grantedAt ?? 'no date'}).`]
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
    const idOfGroup = new Map(flowGroups.map((group) => [group.name, `${app.appId}-${platform}-${group.folder}`]));
    // Children before their parent would read backwards in the store; parents
    // first, then children in walk order.
    flowGroups.sort((a, b) => a.depth - b.depth || flowGroups.indexOf(a) - flowGroups.indexOf(b));
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
        // The flow this one branches from and returns to, when the recording
        // showed one; the gallery nests it beneath that flow.
        parentId: group.parent && idOfGroup.has(group.parent) ? idOfGroup.get(group.parent) : null,
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
    skipped,
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

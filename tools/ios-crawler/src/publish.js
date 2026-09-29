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
 * Versioning matches motvin-backend's manifest.builder.ts exactly: a dated
 * capture lives at `screens/<platform>/<app>/versions/<YYYY-MM-DD>/…`, same
 * shape (loose files or `<flow>/<n>.png`) as an unversioned publish, just
 * rooted one level deeper. Passing no `version` keeps today's flat layout —
 * this stays a plain, versioning-optional primitive; `ingestFolder` (the real
 * entry point behind both the CLI and the admin page's video upload) is what
 * decides whether and which version to use, by calling `resolveVersionId`.
 */
export const VERSIONS_DIR_NAME = 'versions';
const VERSION_ID_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Which version a fresh capture should land in: an explicit `--version`, or
 * today's date. There is no pin any more — renaming a version's date, from
 * the admin's version picker, is the only way to change which one is
 * "Latest" — so a run with no explicit version always starts (or adds to)
 * today's dated folder, never silently folds into an older existing one.
 */
export function resolveVersionId(dataDir, appId, explicit) {
  if (explicit) {
    if (!VERSION_ID_RE.test(explicit)) {
      throw new Error(`--version must be in YYYY-MM-DD form (got "${explicit}")`);
    }
    return explicit;
  }
  return localDateString();
}

/**
 * Today's date where this machine actually is, as `YYYY-MM-DD`.
 * `toISOString()` reports UTC, which is a different calendar day from local
 * "today" for several hours around local midnight (IST, five and a half
 * hours ahead, still sees UTC on yesterday's date until 5:30am) — an ingest
 * run in that window must not land a day early.
 */
export function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Mirrors manifest.builder.ts's `screenIdFor`: every path segment, hyphenated. */
function idFor(appId, platform, relativePath) {
  return `${appId}-${platform}-${relativePath.split('/').filter(Boolean).join('-')}`;
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
      const tab = node.analysis?.signals?.tabLabels?.[0];
      if (tab && tab.toLowerCase() !== base.toLowerCase() && /^[A-Za-z][A-Za-z' ]{1,13}$/.test(tab) && !base.toLowerCase().startsWith(tab.toLowerCase())) return tab;
      // Failing a section, the state the screen was in tells siblings apart:
      // "Cart · empty", "Food home · scrolled".
      const state = (node.analysis?.states ?? []).find((v) => v !== 'keyboard');
      return state ? state.replace(/-/g, ' ') : null;
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
  if (options.version && !VERSION_ID_RE.test(options.version)) {
    throw new Error(`version must be in YYYY-MM-DD form (got "${options.version}")`);
  }
  const versionId = options.version || null;
  // The path this run's screens are addressed under, relative to the app
  // folder — `versions/<id>` when versioned, nothing when not, so an
  // unversioned publish (selftest, a caller with no opinion) writes exactly
  // where it always has.
  const versionPrefix = versionId ? `${VERSIONS_DIR_NAME}/${versionId}/` : '';
  const appDir = versionId ? join(dataDir, 'screens', platform, app.appId, VERSIONS_DIR_NAME, versionId) : join(dataDir, 'screens', platform, app.appId);
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

  // A screen can sit in a flow and in one of that flow's child flows — a
  // section screen is also the first step of every journey opened from it. It
  // is stored once, in the shallowest flow that holds it, so the folder names
  // where it lives in the app; every flow that lists it still refers to it by
  // id.
  // Groups are identified by key when the grouper gave one (names may repeat),
  // by name otherwise.
  const keyOf = (group) => group.key ?? group.name;
  const depthOf = (group, seen = new Set()) => {
    if (!group.parent || seen.has(keyOf(group))) return 0;
    seen.add(keyOf(group));
    const parent = flowGroups.find((candidate) => keyOf(candidate) === group.parent);
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
  // The caller's own group objects learn where their flow went, so a later
  // write-back — the researcher's names, arriving after publish — can find
  // each stored flow by its folder.
  for (const group of flowGroups) {
    const original = (options.flows ?? []).find((candidate) => keyOf(candidate) === keyOf(group));
    if (original) original.folder = group.folder;
  }
  for (const group of flowGroups) {
    const owned = group.nodeIds.filter((nodeId) => {
      const shallower = flowGroups.find((other) => other !== group && other.depth < group.depth && other.nodeIds.includes(nodeId));
      const earlier = flowGroups.find((other) => other !== group && other.depth === group.depth && flowGroups.indexOf(other) < flowGroups.indexOf(group) && other.nodeIds.includes(nodeId));
      return !shallower && !earlier;
    });
    if (!owned.length) continue;
    if (!options.dryRun) mkdirSync(join(appDir, group.folder), { recursive: true });
    owned.forEach((nodeId, position) => {
      placement.set(nodeId, { folder: group.folder, position: position + 1, total: owned.length, name: group.name });
    });
  }

  const today = localDateString();
  const capture = options.capture ?? {};

  // ─── Screens ────────────────────────────────────────────────────────────
  for (const node of nodes) {
    const analysis = node.analysis;
    const publishedType = publishedTypeFor(analysis.screenType);
    const placed = placement.get(node.id);
    const name = names.get(node.id);

    let relativePath;
    if (placed) {
      relativePath = `${placed.folder}/${placed.position}`;
    } else {
      const index = (typeCounts.get(publishedType) ?? 0) + 1;
      typeCounts.set(publishedType, index);
      // The builder reads a screen's type from the filename prefix when no
      // sidecar overrides it, so the prefix has to be a published type.
      const base = safeName(index === 1 ? publishedType : `${publishedType}-${index}`);
      relativePath = base;
    }
    // Ids and URLs are addressed from the app folder, so they carry the
    // version prefix; `relativePath` itself stays exactly what it always was
    // — it is joined onto `appDir`, which is already inside `versions/<id>/`
    // when this run is versioned.
    const screenId = idFor(app.appId, platform, `${versionPrefix}${relativePath}`);

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
      ...(analysis.purpose ? { purpose: analysis.purpose } : {}),
      ...(analysis.primaryAction ? { primaryAction: analysis.primaryAction } : {}),
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
      purpose: analysis.purpose ?? null,
      primary_action: analysis.primaryAction ?? null,
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
      // Cache-busted by the write time, so the admin page shows the frame
      // just written rather than a cached earlier one.
      url: `/api/inspirations/screens/${platform}/${app.appId}/${versionPrefix}${fileName}?v=${Math.floor(Date.now() / 1000).toString(36)}`,
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
    const idOfGroup = new Map(flowGroups.map((group) => [keyOf(group), idFor(app.appId, platform, `${versionPrefix}${group.folder}`)]));
    // Children before their parent would read backwards in the store; parents
    // first, then children in walk order.
    flowGroups.sort((a, b) => a.depth - b.depth || flowGroups.indexOf(a) - flowGroups.indexOf(b));
    for (const group of flowGroups) {
      const screenIds = group.nodeIds.map((nodeId) => screenIdByNode.get(nodeId)).filter(Boolean);
      if (!screenIds.length) continue;
      flows.push({
        id: idFor(app.appId, platform, `${versionPrefix}${group.folder}`),
        appId: app.appId,
        name: group.name,
        ...(group.summary ? { summary: group.summary } : {}),
        category: group.category,
        platform,
        screenIds,
        // The flow this one branches from and returns to, when the recording
        // showed one; the gallery nests it beneath that flow.
        parentId: group.parent && idOfGroup.has(group.parent) ? idOfGroup.get(group.parent) : null,
        // Each step with the move that led to it — tap, type, switch tab,
        // scroll, back, dismiss, wait — so the strip can show the journey
        // rather than only its stops.
        steps: (group.steps ?? group.nodeIds.map((nodeId) => ({ nodeId, action: null })))
          .filter((step) => screenIdByNode.has(step.nodeId))
          .map((step) => ({
            screenId: screenIdByNode.get(step.nodeId),
            action: step.action ? { kind: step.action.kind, label: step.action.label ?? null, basis: step.action.basis ?? null } : null,
          })),
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
        id: idFor(app.appId, platform, `${versionPrefix}${category}`),
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
    version: versionId,
    screens: written,
    skipped,
    flows,
    status: sourcesDoc.sources[app.appId].status,
  };
}

/**
 * Rewrites the words of a publish that has already happened: screen names,
 * descriptions, purposes and primary actions in the sidecars and analysis
 * records, flow names and summaries in flows.json. Files, ids and structure
 * stay where they are — this runs after the researcher has had its say, so
 * the library can show the screens straight away and get its content a few
 * minutes later.
 *
 * @param {{dataDir?: string, version?: string, app: object, graph: ScreenGraph, written: object[], flows: object[], flowGroups: object[]}} options
 */
export function updatePublishedContent(options) {
  const dataDir = resolveDataDir(options.dataDir);
  const platform = options.app.platform || 'ios';
  // Must agree with the appDir publishCrawl actually wrote these screens to —
  // callers pass back the `version` publishCrawl resolved and returned.
  const appDir = options.version
    ? join(dataDir, 'screens', platform, options.app.appId, VERSIONS_DIR_NAME, options.version)
    : join(dataDir, 'screens', platform, options.app.appId);
  const analysisDir = join(dataDir, 'analysis');
  let screens = 0;
  let flows = 0;

  const names = uniqueNames(options.written.map((entry) => options.graph.get(entry.nodeId)).filter(Boolean));
  for (const entry of options.written) {
    const node = options.graph.get(entry.nodeId);
    if (!node || node.analysis.viaHeuristics !== false) continue;
    const analysis = node.analysis;
    const name = names.get(node.id) ?? analysis.name;
    const base = entry.file.replace(/\.[^.]+$/, '');
    const sidecarPath = join(appDir, `${base}.json`);
    if (existsSync(sidecarPath)) {
      const sidecar = readJson(sidecarPath, {});
      sidecar.name = name;
      sidecar.description = analysis.description || sidecar.description || '';
      if (analysis.purpose) sidecar.purpose = analysis.purpose;
      if (analysis.primaryAction) sidecar.primaryAction = analysis.primaryAction;
      writeJson(sidecarPath, sidecar);
    }
    const recordPath = join(analysisDir, `${entry.screenId}.json`);
    if (existsSync(recordPath)) {
      const record = readJson(recordPath, {});
      record.name = name;
      record.description = analysis.description;
      record.purpose = analysis.purpose ?? null;
      record.primary_action = analysis.primaryAction ?? null;
      record.analyzer = analysis.analyzer ?? record.analyzer;
      record.analyzedAt = new Date().toISOString();
      writeJson(recordPath, record);
    }
    entry.name = name;
    screens++;
  }

  const flowsFile = join(dataDir, 'flows.json');
  const flowsDoc = readJson(flowsFile, { version: 1, flows: [] });
  const versionPrefix = options.version ? `${VERSIONS_DIR_NAME}/${options.version}/` : '';
  const keyOf = (group) => group.key ?? group.name;
  for (const flow of options.flows) {
    const group = options.flowGroups.find((candidate) => idFor(options.app.appId, platform, `${versionPrefix}${candidate.folder}`) === flow.id);
    if (!group) continue;
    const stored = (flowsDoc.flows || []).find((entry) => entry.id === flow.id);
    if (!stored) continue;
    if (stored.name !== group.name || (group.summary && stored.summary !== group.summary)) flows++;
    stored.name = group.name;
    flow.name = group.name;
    if (group.summary) {
      stored.summary = group.summary;
      flow.summary = group.summary;
    }
    void keyOf;
  }
  writeJson(flowsFile, flowsDoc);
  return { screens, flows };
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

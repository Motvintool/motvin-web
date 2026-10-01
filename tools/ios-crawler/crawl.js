#!/usr/bin/env node
/**
 * motvin-ios-crawler — automated screen capture for Motvin Inspirations.
 *
 *   node crawl.js doctor
 *   node crawl.js self-test
 *   node crawl.js run --app apps/my-app.json --authorized
 *
 * For apps you own, or hold written permission or a licence to capture. The
 * crawler stops at every access control rather than working around one; see
 * src/safety.js.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configureLog, log, bold, dim } from './src/log.js';
import { has } from './src/exec.js';
import { doctor } from './src/doctor.js';
import { selfTest } from './src/selftest.js';
import { Simulator } from './src/device.js';
import { Crawler, DEFAULTS } from './src/crawler.js';
import { assertAuthorized } from './src/safety.js';
import { localDateString, publishCrawl, rebuildManifest, resolveDataDir } from './src/publish.js';
import { classifyStored, ingestFolder, researchStored, resumeIngest } from './src/ingest.js';
import { extractJson, pickBackend, probeAnalyzer, resolveBackend } from './src/analyze.js';
import { AI_PROVIDERS, aiChat, aiChatStream, aiConfig, aiStatus, canStream, readAiSettings, writeAiSettings } from './src/ai.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Prefix for the `--json` result line, so a caller can find it among the logs. */
const RESULT_MARKER = 'MOTVIN_RESULT';
/** Prefix for `--json` progress lines, one per stage, so a caller can show them live. */
const PROGRESS_MARKER = 'MOTVIN_PROGRESS';
const TOKEN_MARKER = 'MOTVIN_TOKEN';

const USAGE = `${bold('motvin-ios-crawler')} — automated iOS screen capture for Inspirations

${bold('Commands')}
  doctor                    check every prerequisite and print the fix for each gap
  self-test                 exercise hashing, dedup, safety and taxonomy (no Simulator needed)
  run --app <file>          crawl one authorized app                        ${dim('needs Xcode + idb')}
  ingest --app <file> --from <dir>
                            a folder of screenshots → the store             ${dim('no Simulator needed')}
  resume --staging <dir>    finish a run paused by ingest --review, keeping or
                            dropping screens the admin chose
  classify --app-id <id>    analyse screens already stored                  ${dim('no Simulator needed')}
  ai                        which free AI is set up, and whether it answers   ${dim('--json for machines')}
  ask                       one question to the AI, JSON on stdin             ${dim('used by the admin assistant')}
  research --app-id <id>    rewrite an app's flow names, summaries and screen   ${dim('--only journeys|screens')}
                            content with the AI, from what is already stored ${dim('needs a model')}

${bold('run options')}
  --app <file>              app config JSON (see apps/example.json)          ${dim('required')}
  --authorized              confirm you hold the rights recorded in the config ${dim('required')}
  --device <name>           simulator device name            ${dim(`default "iPhone 16 Pro"`)}
  --udid <id>               target a specific simulator instead of --device
  --max-screens <n>         unique screens to collect        ${dim(`default ${DEFAULTS.maxScreens}`)}
  --max-actions <n>         taps to spend                    ${dim(`default ${DEFAULTS.maxActions}`)}
  --max-minutes <n>         wall-clock budget                ${dim(`default ${DEFAULTS.maxMinutes}`)}
  --max-depth <n>           navigation depth from launch     ${dim(`default ${DEFAULTS.maxDepth}`)}
  --backend <auto|api|ai|local|cli>
                            auto  — api with ANTHROPIC_API_KEY; else a free AI
                                    (Ollama here, or MOTVIN_AI_URL/KEY); else local
                            api   — the Anthropic API
                            ai    — a free OpenAI-compatible model: Ollama, Gemini,
                                    Groq, OpenRouter. Reads the screenshots and
                                    writes flow names and screen content
                            local — on-device OCR + rules. No key, no network
                            cli   — the signed-in claude binary. Slow
  --data-dir <path>         Inspirations store   ${dim('default ../../motvin-backend/data/inspirations')}
  --no-publish              crawl only; leave the store untouched
  --dry-run                 run the publish step without writing anything
  --verbose                 log every subprocess

${bold('ingest options')}
  --from <path>             folder of screenshots, OR a screen recording    ${dim('required')}
  --authorized              confirm you hold the rights to capture this app ${dim('required')}
  --app <file>              app config JSON. Omit it and the app is identified
                            from the screens themselves
  --app-id <id>             add to an app already in the library, by its slug —
                            skips identification, instead of a config file
  --authorized-by <who>     recorded in sources.json when there is no --app
  --fps <n>                 frames per second to pull from a video          ${dim('default one every 0.3s (~3.33)')}
  --min-hold <seconds>      how long a screen must hold still to count      ${dim('default 0.5')}
  --no-brief                drop screens shown for less than --min-hold even
                            when they are distinct (splash, toasts, spinners)
  --keep-loading            publish pages still loading too; by default they
                            are left out of the library
  --version <YYYY-MM-DD>    which dated capture to publish into            ${dim("default: today")}
  --data-dir <path>         Inspirations store
  --no-classify             skip analysis; file everything as "other"
  --review                  pause after capture, before anything is classified
                            or published, and report the screens found; finish
                            with \`resume\` once the admin has decided what to
                            keep. Nothing is sent to the analyzer until then
  --dry-run                 report what would be written, write nothing
  --json                    print machine-readable progress and result lines

${bold('resume options')}
  --staging <dir>           the folder \`ingest --review\` reported            ${dim('required')}
  --excluded <ids>          comma-separated candidate ids to leave out of the
                            library — "manual", the admin's full word on every
                            screen the review showed, kept and dropped alike.
                            A dropped one left off this list is recovered and
                            published; a kept one on it is removed. Omit the
                            flag entirely for "automatic" (the segmenter's own
                            choices stand untouched; the loading / third-party
                            sign-in rules still run)
  --app, --app-id, --authorized-by, --authorized, --platform, --version,
  --data-dir, --keep-loading, --dry-run, --json
                            the same as \`ingest\` — give it whatever was given
                            to the paused run, so the published screens land
                            in the same place

${bold('classify options')}
  --app-id <id>             app slug as stored under screens/<platform>/    ${dim('required')}
  --platform <p>            ios | android | web                             ${dim('default ios')}
  --overwrite               re-analyse screens that already have a screenType
  --keep-external           leave Google/Apple/Facebook sign-in pages in the
                            store instead of removing them
  --dry-run                 report without writing

${bold('Examples')}
  export ANTHROPIC_API_KEY=…
  node crawl.js run --app apps/my-app.json --authorized --max-screens 30
  node crawl.js ingest --from ~/Desktop/session.mov --authorized
  node crawl.js ingest --app apps/my-app.json --from ~/Desktop/shots --authorized
  node crawl.js classify --app-id my-app
`;

function parseArgs(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      flags._.push(token);
      continue;
    }
    const name = token.slice(2);
    if (name.startsWith('no-')) {
      flags[camel(name.slice(3))] = false;
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      flags[camel(name)] = true;
    } else {
      flags[camel(name)] = next;
      i++;
    }
  }
  return flags;
}

const camel = (name) => name.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
const number = (value, fallback) => (value === undefined ? fallback : Number(value));

/** Reads and validates an app config. */
function loadAppConfig(file) {
  const path = resolve(file.startsWith('/') ? file : join(HERE, file));
  if (!existsSync(path)) throw new Error(`app config not found: ${path}`);

  const config = JSON.parse(readFileSync(path, 'utf-8'));
  const missing = ['appId', 'name', 'bundleId', 'industry'].filter((key) => !config[key]);
  if (missing.length) {
    throw new Error(`${path} is missing required field(s): ${missing.join(', ')}`);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(config.appId)) {
    throw new Error(`appId "${config.appId}" must be lowercase letters, digits and hyphens — it becomes a folder name and a URL`);
  }
  return config;
}

async function runCrawl(flags) {
  if (!flags.app) {
    log.error('--app is required. See `node crawl.js` for usage.');
    return 1;
  }

  const app = loadAppConfig(flags.app);

  // Gate one: the rights record. Throws with an explanation if incomplete.
  assertAuthorized(app, { authorized: flags.authorized === true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const runDir = join(HERE, 'runs', `${app.appId}-${stamp}`);
  mkdirSync(runDir, { recursive: true });
  configureLog({ file: join(runDir, 'crawl.log'), verbose: flags.verbose === true });

  log.heading(`${app.name} (${app.bundleId})`);
  log.info(`authorization: ${app.authorization.permission} — ${app.authorization.authorizedBy}, ${app.authorization.grantedAt}`);
  log.info(`run directory: ${runDir}`);
  log.info(`analyzer: ${pickBackend(flags.backend)}`);

  const idbAvailable = await has('idb');
  if (!idbAvailable) {
    log.error('idb is not installed, so the crawler cannot tap anything.');
    log.raw(dim('  brew tap facebook/fb && brew install idb-companion'));
    log.raw(dim('  pipx install fb-idb'));
    return 1;
  }

  const simulator = new Simulator({
    deviceName: flags.device,
    udid: flags.udid,
    idbAvailable,
  });

  log.heading('Simulator');
  await simulator.boot();

  if (app.appPath) {
    await simulator.install(resolve(app.appPath.startsWith('/') ? app.appPath : join(HERE, app.appPath)));
  } else if (!(await simulator.isInstalled(app.bundleId))) {
    throw new Error(
      `${app.bundleId} is not installed on ${simulator.deviceName}, and the config has no "appPath". ` +
        'Add the path to a simulator .app build, or install it yourself first.',
    );
  }

  log.detail(`launching ${app.bundleId}`);
  await simulator.relaunch(app.bundleId);

  const crawler = new Crawler({
    simulator,
    app,
    runDir,
    backend: flags.backend,
    limits: {
      maxScreens: number(flags.maxScreens, DEFAULTS.maxScreens),
      maxActions: number(flags.maxActions, DEFAULTS.maxActions),
      maxMinutes: number(flags.maxMinutes, DEFAULTS.maxMinutes),
      maxDepth: number(flags.maxDepth, DEFAULTS.maxDepth),
    },
  });

  const graph = await crawler.run();
  summarise(crawler, graph);

  if (flags.publish === false) {
    log.info('--no-publish: the store was not touched.');
    log.info(`graph and frames are in ${runDir}`);
    return 0;
  }

  log.heading('Publishing');
  const result = await publishCrawl({
    graph,
    app,
    dataDir: flags.dataDir,
    dryRun: flags.dryRun === true,
  });

  log.info(`${result.screens.length} screen(s) → ${result.appDir}${flags.dryRun ? dim(' (dry run — nothing written)') : ''}`);
  log.info(`${result.flows.length} flow(s) written to flows.json`);

  if (!flags.dryRun) {
    await rebuildManifest(result.dataDir);
  }

  writeFileSync(join(runDir, 'published.json'), `${JSON.stringify(result, null, 2)}\n`);

  reportGate();
  return 0;
}

/**
 * An app already in the library, as `runIngest`'s own `app` shape — used by
 * `--app-id`, the "add to an existing app" path the admin page's video
 * upload offers alongside "identify a new app from the screens". Unlike
 * `--app`, this needs no config file: everything the pipeline needs (name,
 * industry) is already recorded in apps.json from when the app was first
 * ingested.
 */
function loadExistingApp(dataDirRaw, appId) {
  const dataDir = resolveDataDir(dataDirRaw);
  const appsFile = join(dataDir, 'apps.json');
  if (!existsSync(appsFile)) return null;
  const apps = JSON.parse(readFileSync(appsFile, 'utf-8'))?.apps ?? [];
  return apps.find((a) => a.id === appId) ?? null;
}

/**
 * The app and its rights record, from --app-id (an app already in the
 * library) or --app (a config file), or neither — in which case the screens
 * identify it themselves once they are chosen. Shared by `ingest` and
 * `resume`, since a paused run's decision can arrive with the same choices.
 */
function resolveAppFlag(flags) {
  if (flags.appId) {
    const existing = loadExistingApp(flags.dataDir, flags.appId);
    if (!existing) throw new Error(`no app "${flags.appId}" in the library — check Apps for its id.`);
    return {
      appId: existing.id,
      name: existing.name,
      industry: existing.industry,
      website: existing.website || '',
      tagline: existing.tagline || '',
      authorization: { permission: '', authorizedBy: flags.authorizedBy || '', grantedAt: localDateString() },
    };
  }
  if (flags.app) {
    const app = loadAppConfig(flags.app);
    assertAuthorized(app, { authorized: flags.authorized === true });
    return app;
  }
  return null;
}

/**
 * The analyzer to classify with, probed and logged once. Without one every
 * screen files as "other" and the flows collapse into one bucket, so the
 * caller stops rather than being allowed to produce that — unless
 * --no-classify asked for exactly that.
 */
async function resolveAnalyzer(flags) {
  let backend = flags.classify === false ? 'none' : await resolveBackend(flags.backend);
  if (backend === 'none') {
    log.info('analyzer: off (--no-classify)');
    return { backend, vision: undefined, analyzerLabel: undefined, journeyModel: undefined };
  }
  const probe = await probeAnalyzer(backend);
  if (!probe.usable) {
    log.error(`No analyzer available — ${probe.reason}`);
    log.raw('');
    log.raw(dim('  Screen names, types and flow grouping all come from the analyzer.'));
    log.raw(dim('  Without one, nothing is published.'));
    log.raw('');
    log.raw(dim('  --backend local   reads the screens on-device. No key, no network.'));
    log.raw(dim('  --no-classify     files the screens with no analysis at all.'));
    return null;
  }
  log.info(
    probe.backend === 'local'
      ? 'analyzer: on-device text recognition (no model — types and flows from rules)'
      : probe.backend === 'ai'
        ? `analyzer: free AI — ${probe.provider} / ${probe.model}${probe.vision ? ' (reads screenshots)' : ' (text only)'}`
        : `analyzer: ${probe.backend} ✓`,
  );
  if (probe.journeyModel && probe.journeyModel !== probe.model) log.info(`journey names: ${probe.journeyModel}`);
  return {
    backend: probe.backend,
    vision: probe.vision !== false,
    analyzerLabel: probe.backend === 'ai' ? `${probe.provider}/${probe.model}` : probe.backend,
    journeyModel: probe.journeyModel ?? null,
  };
}

/**
 * The summary lines, the manifest rebuild, and the machine-readable tail a
 * subprocess caller reads back — identical whether the run went straight
 * through or was resumed after a review pause.
 */
async function reportIngestResult(result, flags, app) {
  log.raw('');
  log.info(
    `${result.ingested} unique screen(s), ${result.duplicates.length} repeat(s) dropped` +
      (result.excluded.length ? `, ${result.excluded.length} screen(s) left out (loading states, third-party sign-in)` : ''),
  );
  log.info(`${result.flows.length} flow(s) written`);
  if (!flags.dryRun) {
    if (flags.json) process.stdout.write(`${PROGRESS_MARKER} ${JSON.stringify({ stage: 'manifest', message: 'Rebuilding the library index' })}\n`);
    await rebuildManifest(result.dataDir);
  }

  if (result.identified && !result.identified.confident) {
    log.warn(`"${result.app.name}" is a best guess — rename it under Apps if it is wrong.`);
  }

  // Machine-readable tail for callers that drive this as a subprocess — the
  // admin page's video upload does exactly that. Marker-prefixed rather than
  // bare JSON so it cannot be confused with a log line.
  if (flags.json) {
    process.stdout.write(
      `${RESULT_MARKER} ${JSON.stringify({
        ingested: result.ingested,
        duplicates: result.duplicates.length,
        status: result.status,
        classified: ['api', 'cli', 'ai'].includes(result.backend),
        researched: result.researched ?? null,
        backend: result.backend,
        grouped: result.grouped,
        app: result.app,
        identified: result.identified,
        excluded: result.excluded,
        skipped: result.skipped,
        capture: result.capture,
        timeline: result.timeline,
        // Named journeys, each with its screens in walk order — what the admin
        // page renders as a flow.
        flows: result.flows.map((flow) => ({
          id: flow.id,
          name: flow.name,
          category: flow.category,
          screenIds: flow.screenIds,
        })),
        screens: result.screens,
      })}\n`,
    );
  }

  if (!result.analyzerUsable) {
    log.raw('');
    log.warn('Screens were filed as "other" because no analyzer was reachable.');
    if (app) log.raw(dim(`  Once ANTHROPIC_API_KEY is set: node crawl.js classify --app-id ${app.appId}`));
  }
  reportGate();
}

async function runIngest(flags) {
  if (!flags.from) {
    log.error('--from is required. See `node crawl.js` for usage.');
    return 1;
  }

  // With --app, the config file supplies the app and its rights record. With
  // --app-id, it names an app already in the library — its record there
  // supplies name and industry, so these screens are added to it rather than
  // identified as a possibly-different app of the same name. Without either,
  // the app is identified from the screens themselves — which is what the
  // admin page's video upload does by default, so a capture needs no form
  // first.
  let app;
  try {
    app = resolveAppFlag(flags);
  } catch (error) {
    log.error(error.message);
    return 1;
  }
  if (!app && flags.authorized !== true) {
    log.error('pass --authorized to confirm you hold the rights to capture this app.');
    return 1;
  }

  const folder = resolve(flags.from.replace(/^~/, process.env.HOME ?? '~'));
  log.heading(`${app ? app.name : 'Identifying the app'} ← ${folder}`);
  if (app) {
    log.info(`authorization: ${app.authorization.permission} — ${app.authorization.authorizedBy}, ${app.authorization.grantedAt}`);
  } else if (flags.authorizedBy) {
    log.info(`captured by: ${flags.authorizedBy}`);
  }
  // Checked before the video is touched — reviewing a batch that is never
  // going to be classified anyway would waste the admin's time.
  const analyzerInfo = flags.review ? { backend: 'deferred' } : await resolveAnalyzer(flags);
  if (!analyzerInfo) return 1;

  const result = await ingestFolder({
    folder,
    app,
    authorization: app
      ? app.authorization
      : { permission: '', authorizedBy: flags.authorizedBy || '', grantedAt: localDateString() },
    dataDir: flags.dataDir,
    backend: analyzerInfo.backend,
    vision: analyzerInfo.vision,
    analyzerLabel: analyzerInfo.analyzerLabel,
    journeyModel: analyzerInfo.journeyModel,
    fps: flags.fps === undefined ? undefined : Number(flags.fps),
    minHoldSeconds: flags.minHold === undefined ? undefined : Number(flags.minHold),
    minRun: flags.minRun === undefined ? undefined : Number(flags.minRun),
    keepBrief: flags.brief !== false,
    keepLoading: flags.keepLoading === true,
    platform: flags.platform,
    version: flags.version,
    dryRun: flags.dryRun === true,
    reviewOnly: flags.review === true,
    onProgress: flags.json
      ? (event) => process.stdout.write(`${PROGRESS_MARKER} ${JSON.stringify(event)}\n`)
      : undefined,
  });

  if (result.pausedForReview) {
    // Nothing is published yet — reportGate()'s "live in the gallery" line
    // would be wrong here, since resolving this run is what makes that true.
    log.raw('');
    log.info(`${result.screens} screen(s) captured — waiting for the admin to choose how to clean them up.`);
    return 0;
  }

  await reportIngestResult(result, flags, app);
  return 0;
}

/**
 * Finishes a run that paused after capture: the admin's "automatic" (nothing
 * changed from what the segmenter captured) or "manual" (--excluded names,
 * from every candidate the review showed, which ones should not be in the
 * library) decision, read back from the staging dir `ingest --review` left
 * behind.
 */
async function runResume(flags) {
  if (!flags.staging) {
    log.error('--staging is required — the folder `ingest --review` reported when it paused.');
    return 1;
  }
  let app;
  try {
    app = resolveAppFlag(flags);
  } catch (error) {
    log.error(error.message);
    return 1;
  }
  if (!app && flags.authorized !== true) {
    log.error('pass --authorized to confirm you hold the rights to capture this app.');
    return 1;
  }
  const analyzerInfo = await resolveAnalyzer(flags);
  if (!analyzerInfo) return 1;

  // --excluded present at all, even empty, is "manual" — the admin's full
  // word on every candidate shown. Its absence is "automatic": the
  // segmenter's own kept/dropped split stands untouched.
  const manual = flags.excluded !== undefined;
  const excluded = manual
    ? String(flags.excluded)
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    : [];
  log.heading(manual ? `Applying ${excluded.length} exclusion(s) and continuing` : 'Cleaning up automatically and continuing');

  const result = await resumeIngest({
    stagingDir: resolve(flags.staging),
    excluded: manual ? excluded : undefined,
    app,
    authorization: app
      ? app.authorization
      : { permission: '', authorizedBy: flags.authorizedBy || '', grantedAt: localDateString() },
    dataDir: flags.dataDir,
    backend: analyzerInfo.backend,
    vision: analyzerInfo.vision,
    analyzerLabel: analyzerInfo.analyzerLabel,
    journeyModel: analyzerInfo.journeyModel,
    keepLoading: flags.keepLoading === true,
    platform: flags.platform,
    version: flags.version,
    dryRun: flags.dryRun === true,
    onProgress: flags.json
      ? (event) => process.stdout.write(`${PROGRESS_MARKER} ${JSON.stringify(event)}\n`)
      : undefined,
  });

  await reportIngestResult(result, flags, app);
  return 0;
}

async function runClassify(flags) {
  if (!flags.appId) {
    log.error('--app-id is required. See `node crawl.js` for usage.');
    return 1;
  }

  const result = await classifyStored({
    appId: flags.appId,
    platform: flags.platform,
    dataDir: flags.dataDir,
    backend: flags.backend,
    overwrite: flags.overwrite === true,
    keepExternal: flags.keepExternal === true,
    dryRun: flags.dryRun === true,
  });

  log.raw('');
  log.info(`${result.classified} screen(s) classified${result.removed ? `, ${result.removed} removed` : ''}`);
  if ((result.classified || result.removed) && !flags.dryRun) await rebuildManifest(result.dataDir);
  return result.failed ? 1 : 0;
}

/**
 * The AI's standing: which server and model are chosen, where the choice
 * came from, and whether the server answers right now. `--set` writes a
 * choice from the terminal; the admin page writes the same file directly.
 */
async function runAi(flags) {
  if (flags.set !== undefined) {
    const current = aiConfig();
    const settings = {
      provider: flags.provider ?? current.provider,
      url: flags.url ?? (flags.provider ? AI_PROVIDERS.find((entry) => entry.id === flags.provider)?.url : current.url) ?? current.url,
      model: flags.model ?? current.model,
      journeyModel: flags.journeyModel ?? readAiSettings().journeyModel ?? '',
      chatModel: flags.chatModel ?? readAiSettings().chatModel ?? '',
      key: flags.key ?? current.key,
      enabled: flags.enabled !== false && flags.off !== true,
    };
    writeAiSettings(settings);
  }
  const status = await aiStatus();
  const config = aiConfig();
  const payload = { ...status, providers: AI_PROVIDERS, configuredModel: config.model || null, configuredUrl: config.url };
  if (flags.json) {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return 0;
  }
  log.heading('Free AI');
  log.info(`server: ${status.url} (${status.provider}, ${status.source === 'env' ? 'from the environment' : status.source === 'settings' ? 'chosen on the admin page' : 'the default'})`);
  if (!status.enabled) log.warn(status.reason);
  else if (status.usable) log.ok(`${status.model}${status.vision ? ' — reads screenshots' : ' — text only'}${status.connected ? '' : ' (server did not list its models)'}`);
  if (status.usable && status.journeyModel && status.journeyModel !== status.model) log.info(`journey names: ${status.journeyModel} (a larger general model; set --journey-model or MOTVIN_AI_JOURNEY_MODEL to change)`);
  if (status.usable && status.chatModel && status.chatModel !== status.journeyModel) log.info(`admin chat: ${status.chatModel} (set --chat-model or MOTVIN_AI_CHAT_MODEL to change)`);
  else log.error(status.reason);
  if (status.models.length) log.detail(`models: ${status.models.join(', ')}`);
  return status.usable || !status.enabled ? 0 : 1;
}

/**
 * One question to the free AI, for the admin page's assistant. The request
 * comes on stdin as JSON — `{ "system": "...", "user": "...", "model": "..." }`
 * — and the reply goes to stdout as `{ "text": "..." }`. Always asked in JSON
 * mode, because a reasoning model answering in the open leaves its answer in
 * the wrong field.
 */
async function runAsk(flags) {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const request = JSON.parse(input || '{}');
  const status = await aiStatus();
  if (!status.usable) {
    process.stdout.write(`${JSON.stringify({ text: null, reason: status.reason })}\n`);
    return 1;
  }
  const model = request.model || status.chatModel || status.journeyModel || status.model;
  // --stream: each piece of the answer as the model writes it, one marked
  // line per piece, then the whole answer as the last line. A model that
  // cannot be streamed (see canStream) answers whole, in JSON mode.
  if (flags.stream && canStream(model)) {
    // With --raw the caller's JSON shape streams out as written; the caller
    // reads the fields it wants as they arrive.
    const text = await aiChatStream(
      {
        system: flags.raw ? String(request.system ?? '') : `${request.system ?? ''}\nAnswer in plain text — no JSON, no markdown.`,
        blocks: [{ type: 'text', text: String(request.user ?? '') }],
        model,
        json: Boolean(flags.raw),
        maxTokens: Number(flags.maxTokens ?? 400),
        temperature: flags.raw ? 0.4 : 0.3,
      },
      (piece) => process.stdout.write(`${TOKEN_MARKER} ${JSON.stringify(piece)}\n`),
    );
    process.stdout.write(`${JSON.stringify({ text: text.trim(), model, streamed: true })}\n`);
    return 0;
  }
  // --raw: the caller's own JSON shape comes back untouched; otherwise the
  // model is asked for {"answer": …} and the answer text is returned.
  const reply = await aiChat({
    system: flags.raw ? String(request.system ?? '') : `${request.system ?? ''}\nReply as JSON: {"answer": "<your answer>"} and nothing else.`,
    blocks: [{ type: 'text', text: String(request.user ?? '') }],
    model,
    maxTokens: Number(flags.maxTokens ?? 400),
    temperature: flags.raw ? 0.2 : 0.3,
  });
  let text = String(reply);
  if (!flags.raw) {
    try {
      const parsed = extractJson(reply);
      if (parsed && typeof parsed.answer === 'string') text = parsed.answer;
    } catch {
      // The raw reply is better than nothing.
    }
  }
  process.stdout.write(`${JSON.stringify({ text: text.trim(), model })}\n`);
  return 0;
}

async function runResearch(flags) {
  if (!flags.appId) {
    log.error('--app-id is required. See `node crawl.js` for usage.');
    return 1;
  }
  const backend = await resolveBackend(flags.backend);
  const probe = await probeAnalyzer(backend);
  if (!probe.usable || backend === 'local') {
    log.error(`No model available — ${probe.reason ?? 'only the on-device rules are set up'}`);
    log.raw(dim('  Start Ollama with a vision model (ollama pull qwen3-vl:2b), or set MOTVIN_AI_URL / MOTVIN_AI_KEY.'));
    return 1;
  }
  log.info(
    probe.backend === 'ai'
      ? `analyzer: free AI — ${probe.provider} / ${probe.model}${probe.vision ? ' (reads screenshots)' : ' (text only)'}`
      : `analyzer: ${probe.backend} ✓`,
  );
  if (probe.journeyModel && probe.journeyModel !== probe.model) log.info(`journey names: ${probe.journeyModel}`);
  const result = await researchStored({
    appId: flags.appId,
    platform: flags.platform,
    dataDir: flags.dataDir,
    backend,
    vision: probe.vision !== false,
    analyzerLabel: probe.backend === 'ai' ? `${probe.provider}/${probe.model}` : probe.backend,
    journeyModel: probe.journeyModel ?? null,
    dryRun: flags.dryRun === true,
    only: flags.only === 'journeys' || flags.only === 'screens' ? flags.only : null,
  });
  log.raw('');
  log.info(`${result.flowsChanged} flow(s) and ${result.screensChanged} screen(s) rewritten${flags.dryRun ? dim(' (dry run — nothing written)') : ''}`);
  if (!flags.dryRun && (result.flowsChanged || result.screensChanged)) await rebuildManifest(result.dataDir);
  return 0;
}

function reportGate() {
  log.raw('');
  log.ok('Published — the screens are live in the gallery.');
  log.raw(dim('  Review or remove them at /inspirations/admin.'));
}

function summarise(crawler, graph) {
  const byType = new Map();
  for (const node of graph.nodes.values()) {
    const type = node.analysis.screenType;
    byType.set(type, (byType.get(type) ?? 0) + 1);
  }

  log.heading('Screens found');
  for (const [type, count] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
    log.info(`${String(count).padStart(3)}  ${type}`);
  }

  if (crawler.blockedBranches.length) {
    log.heading('Blocked branches');
    for (const branch of crawler.blockedBranches) {
      log.blocked(`${branch.nodeId} ${branch.name} — ${branch.reason}`);
    }
    log.raw(dim('  These screens were captured but not explored past. Continuing any of them'));
    log.raw(dim('  needs an authorized human on the device, not a change to the crawler.'));
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const flags = parseArgs(argv);
  const command = flags._[0] ?? (flags.doctor ? 'doctor' : flags.selfTest ? 'self-test' : null);

  configureLog({ verbose: flags.verbose === true });

  try {
    switch (command) {
      case 'doctor':
        return (await doctor()) ? 0 : 1;
      case 'self-test':
        return (await selfTest()) ? 0 : 1;
      case 'run':
        return await runCrawl(flags);
      case 'ingest':
        return await runIngest(flags);
      case 'resume':
        return await runResume(flags);
      case 'classify':
        return await runClassify(flags);
      case 'research':
        return await runResearch(flags);
      case 'ai':
        return await runAi(flags);
      case 'ask':
        return await runAsk(flags);
      case 'where':
        log.info(resolveDataDir(flags.dataDir));
        return 0;
      default:
        process.stdout.write(`${USAGE}\n`);
        return command ? 1 : 0;
    }
  } catch (error) {
    log.raw('');
    if (error.authorization) {
      log.error(error.message);
    } else {
      log.error(error.message);
      if (flags.verbose) log.raw(dim(error.stack ?? ''));
    }
    return 1;
  }
}

process.exitCode = await main();

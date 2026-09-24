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
import { publishCrawl, rebuildManifest, resolveDataDir } from './src/publish.js';
import { classifyStored, ingestFolder } from './src/ingest.js';
import { pickBackend, probeAnalyzer } from './src/analyze.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Prefix for the `--json` result line, so a caller can find it among the logs. */
const RESULT_MARKER = 'MOTVIN_RESULT';
/** Prefix for `--json` progress lines, one per stage, so a caller can show them live. */
const PROGRESS_MARKER = 'MOTVIN_PROGRESS';

const USAGE = `${bold('motvin-ios-crawler')} — automated iOS screen capture for Inspirations

${bold('Commands')}
  doctor                    check every prerequisite and print the fix for each gap
  self-test                 exercise hashing, dedup, safety and taxonomy (no Simulator needed)
  run --app <file>          crawl one authorized app                        ${dim('needs Xcode + idb')}
  ingest --app <file> --from <dir>
                            a folder of screenshots → the store             ${dim('no Simulator needed')}
  classify --app-id <id>    analyse screens already stored                  ${dim('no Simulator needed')}

${bold('run options')}
  --app <file>              app config JSON (see apps/example.json)          ${dim('required')}
  --authorized              confirm you hold the rights recorded in the config ${dim('required')}
  --device <name>           simulator device name            ${dim(`default "iPhone 16 Pro"`)}
  --udid <id>               target a specific simulator instead of --device
  --max-screens <n>         unique screens to collect        ${dim(`default ${DEFAULTS.maxScreens}`)}
  --max-actions <n>         taps to spend                    ${dim(`default ${DEFAULTS.maxActions}`)}
  --max-minutes <n>         wall-clock budget                ${dim(`default ${DEFAULTS.maxMinutes}`)}
  --max-depth <n>           navigation depth from launch     ${dim(`default ${DEFAULTS.maxDepth}`)}
  --backend <auto|api|local|cli>
                            auto  — api when ANTHROPIC_API_KEY is set, else local
                            api   — best: real descriptions and flow names
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
  --authorized-by <who>     recorded in sources.json when there is no --app
  --fps <n>                 frames per second to pull from a video          ${dim('default 5')}
  --min-hold <seconds>      how long a screen must hold still to count      ${dim('default 0.5')}
  --no-brief                drop screens shown for less than --min-hold even
                            when they are distinct (splash, toasts, spinners)
  --data-dir <path>         Inspirations store
  --no-classify             skip analysis; file everything as "other"
  --dry-run                 report what would be written, write nothing
  --json                    print machine-readable progress and result lines

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
  const result = publishCrawl({
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

async function runIngest(flags) {
  if (!flags.from) {
    log.error('--from is required. See `node crawl.js` for usage.');
    return 1;
  }

  // With --app, the config supplies the app and its rights record. Without it,
  // the app is identified from the screens themselves — which is what the admin
  // page's video upload does, so that a capture needs no form first.
  const app = flags.app ? loadAppConfig(flags.app) : null;
  if (app) {
    assertAuthorized(app, { authorized: flags.authorized === true });
  } else if (flags.authorized !== true) {
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
  // Checked before the video is touched. Without an analyzer every screen
  // files as "other" and the flows collapse into one bucket, so the run is
  // stopped here rather than allowed to produce that.
  const backend = flags.classify === false ? 'none' : flags.backend;
  if (backend !== 'none') {
    const probe = await probeAnalyzer(backend);
    if (!probe.usable) {
      log.error(`No analyzer available — ${probe.reason}`);
      log.raw('');
      log.raw(dim('  Screen names, types and flow grouping all come from the analyzer.'));
      log.raw(dim('  Without one, nothing is published.'));
      log.raw('');
      log.raw(dim('  --backend local   reads the screens on-device. No key, no network.'));
      log.raw(dim('  --no-classify     files the screens with no analysis at all.'));
      return 1;
    }
    log.info(
      probe.backend === 'local'
        ? 'analyzer: on-device text recognition (no API key — types and flows from rules)'
        : `analyzer: ${probe.backend} ✓`,
    );
  } else {
    log.info('analyzer: off (--no-classify)');
  }

  const result = await ingestFolder({
    folder,
    app,
    authorization: app
      ? app.authorization
      : { permission: '', authorizedBy: flags.authorizedBy || '', grantedAt: new Date().toISOString().slice(0, 10) },
    dataDir: flags.dataDir,
    backend: flags.classify === false ? 'none' : flags.backend,
    fps: flags.fps === undefined ? undefined : Number(flags.fps),
    minHoldSeconds: flags.minHold === undefined ? undefined : Number(flags.minHold),
    minRun: flags.minRun === undefined ? undefined : Number(flags.minRun),
    keepBrief: flags.brief !== false,
    dryRun: flags.dryRun === true,
    onProgress: flags.json
      ? (event) => process.stdout.write(`${PROGRESS_MARKER} ${JSON.stringify(event)}\n`)
      : undefined,
  });

  log.raw('');
  log.info(
    `${result.ingested} unique screen(s), ${result.duplicates.length} repeat(s) dropped` +
      (result.excluded.length ? `, ${result.excluded.length} third-party sign-in screen(s) left out` : ''),
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
        classified: result.backend === 'api' || result.backend === 'cli',
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
    log.raw(dim(`  Once ANTHROPIC_API_KEY is set: node crawl.js classify --app-id ${app.appId}`));
  }
  reportGate();
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
      case 'classify':
        return await runClassify(flags);
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

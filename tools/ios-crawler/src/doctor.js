/**
 * Preflight. Every external thing the crawler needs, checked in one pass, with
 * the exact command that fixes each gap.
 *
 * Worth running before the first crawl on any machine — the failure modes
 * (missing Xcode, no runtime installed, idb not on PATH) all look the same
 * from inside the crawl loop otherwise.
 */

import { existsSync } from 'node:fs';
import { has, run } from './exec.js';
import { probeAnalyzer } from './analyze.js';
import { log, bold, dim } from './log.js';
import { resolveDataDir } from './publish.js';

const PASS = 'pass';
const FAIL = 'fail';
const WARN = 'warn';

async function checkXcode() {
  const selected = await run('xcode-select', ['-p'], { timeout: 10_000 });
  const path = selected.stdout.trim();

  if (selected.failed || !path) {
    return { status: FAIL, detail: 'no developer directory selected', fix: 'Install Xcode from the App Store, then: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer' };
  }
  if (path.includes('CommandLineTools')) {
    return {
      status: FAIL,
      detail: `xcode-select points at ${path}`,
      fix: 'Command Line Tools alone cannot run a Simulator. Install Xcode, then: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer',
    };
  }
  return { status: PASS, detail: path };
}

async function checkSimctl() {
  const result = await run('xcrun', ['simctl', 'help'], { timeout: 15_000 });
  return result.failed
    ? { status: FAIL, detail: 'xcrun simctl unavailable', fix: 'Comes with Xcode. Install Xcode and select it with xcode-select.' }
    : { status: PASS, detail: 'available' };
}

async function checkRuntimes() {
  const result = await run('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], { timeout: 30_000 });
  if (result.failed) {
    return { status: FAIL, detail: 'could not list devices', fix: 'Install Xcode first.' };
  }
  let devices = {};
  try {
    devices = JSON.parse(result.stdout).devices ?? {};
  } catch {
    return { status: FAIL, detail: 'simctl returned unreadable JSON', fix: 'Try: xcrun simctl list devices available' };
  }
  const iphones = Object.values(devices)
    .flat()
    .filter((device) => device.isAvailable && /iPhone/i.test(device.name))
    .map((device) => device.name);

  if (!iphones.length) {
    return {
      status: FAIL,
      detail: 'no iPhone simulators installed',
      fix: 'Xcode › Settings › Components › install an iOS Simulator runtime',
    };
  }
  return { status: PASS, detail: `${iphones.length} iPhone device(s): ${[...new Set(iphones)].slice(0, 4).join(', ')}` };
}

async function checkIdb() {
  const present = await has('idb');
  if (!present) {
    return {
      status: FAIL,
      detail: 'idb not on PATH',
      fix: 'brew tap facebook/fb && brew install idb-companion  •  pipx install fb-idb',
    };
  }
  const version = await run('idb', ['--version'], { timeout: 15_000 });
  return { status: PASS, detail: version.stdout.trim() || 'installed' };
}

async function checkSips() {
  const present = await has('sips');
  return present
    ? { status: PASS, detail: 'ships with macOS' }
    : { status: FAIL, detail: 'sips missing', fix: 'sips is part of macOS; this crawler is macOS-only.' };
}

async function checkAnalyzer() {
  if (process.env.ANTHROPIC_API_KEY) {
    return { status: PASS, detail: 'ANTHROPIC_API_KEY set — full analysis' };
  }

  // No key is no longer a failure: the on-device analyzer reads each screen
  // with Vision and types it by rule. It gives no descriptions and cannot
  // recognise a brand, so it warns rather than passes.
  const probe = await probeAnalyzer('local');
  if (probe.usable) {
    return {
      status: WARN,
      detail: 'no ANTHROPIC_API_KEY — using on-device text recognition',
      fix: 'Screen types and flow names work offline. Descriptions and app names need a key: add ANTHROPIC_API_KEY to motvin-web/.env.local.',
    };
  }

  return {
    status: FAIL,
    detail: `no analyzer available — ${probe.reason}`,
    fix: 'xcode-select --install builds the on-device reader, or set ANTHROPIC_API_KEY.',
  };
}

function checkStore() {
  const dataDir = resolveDataDir();
  if (!existsSync(dataDir)) {
    return {
      status: WARN,
      detail: `not found at ${dataDir}`,
      fix: 'Set INSPIRATIONS_DATA_DIR, or pass --data-dir, to point at motvin-backend/data/inspirations. Crawling still works; publishing will not.',
    };
  }
  return { status: PASS, detail: dataDir };
}

async function checkVideo() {
  if (await has('ffmpeg')) {
    return { status: PASS, detail: 'ffmpeg — fastest option' };
  }
  if (await has('clang')) {
    return {
      status: PASS,
      detail: 'AVFoundation (built on first use) — no install needed',
    };
  }
  return {
    status: WARN,
    detail: 'neither ffmpeg nor clang',
    fix: 'xcode-select --install, or brew install ffmpeg. Only needed to ingest a video; folders of screenshots work without either.',
  };
}

const CHECKS = [
  ['Xcode', checkXcode, true],
  ['simctl', checkSimctl, true],
  ['Simulator runtimes', checkRuntimes, true],
  ['idb (touch + accessibility)', checkIdb, true],
  ['sips (image hashing)', checkSips, true],
  ['Video reader', checkVideo, false],
  ['Claude analyzer', checkAnalyzer, true],
  ['Inspirations store', checkStore, false],
];

export async function doctor() {
  log.heading('Preflight');

  const results = [];
  for (const [name, check, required] of CHECKS) {
    const result = await check();
    results.push({ name, required, ...result });
    const mark = result.status === PASS ? log.ok : result.status === WARN ? log.warn : log.error;
    mark(`${name.padEnd(28)} ${result.detail}`);
    if (result.fix && result.status !== PASS) log.raw(dim(`  ↳ ${result.fix}`));
  }

  const blockers = results.filter((result) => result.required && result.status === FAIL);
  log.raw('');
  if (blockers.length) {
    log.error(`${blockers.length} blocker(s): ${blockers.map((b) => b.name).join(', ')}`);
    log.raw(dim('  Crawling needs all of the above. `node crawl.js self-test` exercises the parts that do not.'));
  } else {
    log.ok(bold('Ready to crawl.'));
  }
  return blockers.length === 0;
}

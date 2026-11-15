/**
 * The iOS Simulator, as the crawler sees it.
 *
 * Two command-line tools do the work, and the split matters:
 *
 *   xcrun simctl — ships with Xcode. Boots devices, installs and launches
 *                  apps, takes screenshots. It cannot inject touches, which is
 *                  why it is not enough on its own.
 *   idb          — Meta's iOS Development Bridge. Provides the accessibility
 *                  tree (`idb ui describe-all`) and touch injection
 *                  (`idb ui tap`). Install with:
 *                      brew tap facebook/fb && brew install idb-companion
 *                      pipx install fb-idb
 *
 * Only simulator builds can be installed — a `.app` from Xcode or an internal
 * distribution. App Store `.ipa` files are device-only binaries and will not
 * install here, which happens to align with the rule that this tool is for
 * apps you are authorized to test.
 */

import { existsSync } from 'node:fs';
import { run, runOrThrow, sleep } from './exec.js';
import { log } from './log.js';

export class Simulator {
  /**
   * @param {{deviceName?: string, udid?: string, idbAvailable?: boolean}} options
   */
  constructor(options = {}) {
    this.deviceName = options.deviceName || 'iPhone 16 Pro';
    this.udid = options.udid || null;
    this.idbAvailable = options.idbAvailable ?? false;
    this.screenSize = null;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  /** Finds (or picks) a device and boots it. Idempotent. */
  async boot() {
    const listed = await runOrThrow('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], { timeout: 60_000 });
    const devices = JSON.parse(listed.stdout).devices;

    let match = null;
    for (const [runtime, entries] of Object.entries(devices)) {
      for (const device of entries) {
        if (!device.isAvailable) continue;
        const wanted = this.udid ? device.udid === this.udid : device.name === this.deviceName;
        if (wanted) {
          match = { ...device, runtime };
          break;
        }
      }
      if (match) break;
    }

    if (!match) {
      const names = Object.values(devices)
        .flat()
        .filter((d) => d.isAvailable)
        .map((d) => d.name);
      const available = names.length ? [...new Set(names)].join(', ') : 'none — install a runtime in Xcode › Settings › Components';
      throw new Error(`No available simulator named "${this.udid || this.deviceName}". Available: ${available}`);
    }

    this.udid = match.udid;
    this.deviceName = match.name;
    log.info(`Simulator: ${match.name} (${match.runtime.split('.').pop()})`);

    if (match.state !== 'Booted') {
      log.detail('booting…');
      await runOrThrow('xcrun', ['simctl', 'boot', this.udid], { timeout: 180_000 });
      await this.waitUntilBooted();
    } else {
      log.detail('already booted');
    }

    // The window is what a human watches; the crawl itself is headless.
    await run('open', ['-a', 'Simulator', '--args', '-CurrentDeviceUDID', this.udid], { timeout: 30_000 });
    await this.readScreenSize();
    return this;
  }

  async waitUntilBooted(timeoutMs = 180_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const result = await run('xcrun', ['simctl', 'bootstatus', this.udid], { timeout: 30_000 });
      if (!result.failed) return;
      await sleep(2000);
    }
    throw new Error('simulator did not finish booting in time');
  }

  /** Point dimensions, from the accessibility tree's root frame when available. */
  async readScreenSize() {
    if (!this.idbAvailable) return null;
    const elements = await this.describeElements();
    const root = elements.reduce((largest, element) => {
      const area = element.frame.width * element.frame.height;
      return area > (largest ? largest.frame.width * largest.frame.height : 0) ? element : largest;
    }, null);
    if (root) {
      this.screenSize = { width: root.frame.width, height: root.frame.height };
      log.detail(`screen: ${this.screenSize.width}×${this.screenSize.height}pt`);
    }
    return this.screenSize;
  }

  // ─── App ──────────────────────────────────────────────────────────────────

  async install(appPath) {
    if (!existsSync(appPath)) {
      throw new Error(`app bundle not found: ${appPath}`);
    }
    if (appPath.endsWith('.ipa')) {
      throw new Error(
        `${appPath} is an .ipa. The Simulator only runs simulator builds (.app). ` +
          'Build the app for a simulator destination, or point --app-path at a .app bundle.',
      );
    }
    log.detail(`installing ${appPath}`);
    await runOrThrow('xcrun', ['simctl', 'install', this.udid, appPath], { timeout: 180_000 });
  }

  async isInstalled(bundleId) {
    const result = await run('xcrun', ['simctl', 'get_app_container', this.udid, bundleId], { timeout: 30_000 });
    return !result.failed;
  }

  async launch(bundleId) {
    await runOrThrow('xcrun', ['simctl', 'launch', this.udid, bundleId], { timeout: 60_000 });
  }

  async terminate(bundleId) {
    // A not-running app is a perfectly normal answer here.
    await run('xcrun', ['simctl', 'terminate', this.udid, bundleId], { timeout: 30_000 });
  }

  /** Relaunch from scratch — the crawler's way back to a known state. */
  async relaunch(bundleId) {
    await this.terminate(bundleId);
    await sleep(600);
    await this.launch(bundleId);
  }

  // ─── Capture ──────────────────────────────────────────────────────────────

  async screenshot(destination) {
    await runOrThrow('xcrun', ['simctl', 'io', this.udid, 'screenshot', '--type=png', destination], {
      timeout: 30_000,
    });
    return destination;
  }

  // ─── Accessibility ────────────────────────────────────────────────────────

  /**
   * The on-screen accessibility elements. Returns [] when idb is unavailable,
   * which pushes element discovery onto the vision analyzer instead.
   */
  async describeElements() {
    if (!this.idbAvailable) return [];
    const result = await run('idb', ['ui', 'describe-all', '--udid', this.udid, '--json'], { timeout: 30_000 });
    if (result.failed) {
      log.debug(`idb describe-all failed: ${result.stderr.trim()}`);
      return [];
    }
    return parseIdbElements(result.stdout);
  }

  // ─── Input ────────────────────────────────────────────────────────────────

  async tap(x, y) {
    if (!this.idbAvailable) throw new Error('tapping needs idb — run `crawl.js doctor` for install steps');
    await runOrThrow('idb', ['ui', 'tap', '--udid', this.udid, String(Math.round(x)), String(Math.round(y))], {
      timeout: 20_000,
    });
  }

  async swipe(fromX, fromY, toX, toY, durationSeconds = 0.3) {
    if (!this.idbAvailable) throw new Error('swiping needs idb');
    await runOrThrow(
      'idb',
      [
        'ui', 'swipe', '--udid', this.udid,
        '--duration', String(durationSeconds),
        String(Math.round(fromX)), String(Math.round(fromY)),
        String(Math.round(toX)), String(Math.round(toY)),
      ],
      { timeout: 30_000 },
    );
  }

  /** Scrolls the content up by roughly one screen. */
  async scrollDown() {
    const { width, height } = this.screenSize || { width: 390, height: 844 };
    await this.swipe(width / 2, height * 0.75, width / 2, height * 0.3, 0.4);
  }

  /** Edge-swipe back, the gesture almost every iOS app honours. */
  async goBack() {
    const { width, height } = this.screenSize || { width: 390, height: 844 };
    await this.swipe(2, height / 2, width * 0.75, height / 2, 0.25);
  }

  async pressHome() {
    if (!this.idbAvailable) return;
    await run('idb', ['ui', 'button', '--udid', this.udid, 'HOME'], { timeout: 20_000 });
  }
}

/**
 * Normalises idb's accessibility output into the element shape the rest of the
 * crawler uses. idb emits one JSON object per line rather than an array, and
 * the key names differ between versions, so both spellings are accepted.
 */
export function parseIdbElements(stdout) {
  const elements = [];

  for (const line of stdout.split('\n')) {
    const text = line.trim();
    if (!text || (text[0] !== '{' && text[0] !== '[')) continue;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }
    for (const node of Array.isArray(parsed) ? parsed : [parsed]) {
      const element = normaliseNode(node);
      if (element) elements.push(element);
    }
  }

  return elements;
}

function normaliseNode(node) {
  const frame = node.frame || node.AXFrame || {};
  const width = Number(frame.width ?? frame.Width ?? 0);
  const height = Number(frame.height ?? frame.Height ?? 0);
  if (!width || !height) return null;

  const role = String(node.type || node.AXType || node.role || '');
  const label = clean(node.AXLabel ?? node.label ?? node.AXValue ?? node.title ?? '');
  const hint = clean(node.AXHint ?? node.hint ?? '');
  const value = clean(node.AXValue ?? node.value ?? '');

  return {
    role,
    kind: kindFor(role),
    label,
    hint,
    value: value === label ? '' : value,
    enabled: node.enabled !== false,
    frame: {
      x: Number(frame.x ?? frame.X ?? 0),
      y: Number(frame.y ?? frame.Y ?? 0),
      width,
      height,
    },
  };
}

function clean(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

/** XCUIElement type → the coarse kind the crawler reasons about. */
function kindFor(role) {
  const type = role.toLowerCase();
  if (type.includes('securetextfield')) return 'input';
  if (type.includes('textfield') || type.includes('textview') || type.includes('searchfield')) return 'input';
  if (type.includes('tabbar') || type === 'tab') return 'tab';
  if (type.includes('cell') || type.includes('row')) return 'cell';
  if (type.includes('button') || type.includes('link')) return 'button';
  if (type.includes('statictext') || type.includes('text')) return 'text';
  if (type.includes('image')) return 'image';
  if (type.includes('switch') || type.includes('slider') || type.includes('stepper')) return 'control';
  return 'other';
}

/** Elements that carry readable text — the screen's textual signature. */
export function labelsOf(elements) {
  return elements
    .map((element) => element.label || element.value)
    .filter((label) => label && label.length > 1)
    .map((label) => label.toLowerCase());
}

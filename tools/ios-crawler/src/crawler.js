/**
 * The crawl loop.
 *
 * capture → fingerprint → is this new? → analyse → pick an untried action →
 * tap → wait for the UI to settle → capture again.
 *
 * When the current screen has nothing left to try, the crawler backs out with
 * the edge-swipe gesture. When that fails, it relaunches the app and replays a
 * recorded action path to the nearest screen that still has untried controls.
 * Replay is the expensive move, so the frontier is ordered by path length.
 *
 * Everything stops early on three independent budgets — screens, actions and
 * wall-clock — because an app with an infinite feed has no natural end.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sleep } from './exec.js';
import { log } from './log.js';
import { fingerprint, hamming } from './hash.js';
import { labelsOf } from './device.js';
import { analyseScreen } from './analyze.js';
import { ScreenGraph } from './graph.js';
import { actionSafety, isBlockingScreen } from './safety.js';

export const DEFAULTS = {
  maxScreens: 40,
  maxActions: 120,
  maxMinutes: 20,
  maxDepth: 8,
  settleTimeoutMs: 6000,
  settlePollMs: 450,
  afterTapMs: 900,
};

export class Crawler {
  /**
   * @param {{simulator: object, app: object, runDir: string, limits?: object, backend?: string}} options
   */
  constructor(options) {
    this.sim = options.simulator;
    this.app = options.app;
    this.runDir = options.runDir;
    this.framesDir = join(options.runDir, 'frames');
    this.limits = { ...DEFAULTS, ...(options.limits || {}) };
    this.backend = options.backend;
    this.graph = new ScreenGraph();
    this.frameCount = 0;
    this.actionCount = 0;
    this.startedAt = Date.now();
    this.stopReason = null;
    this.blockedBranches = [];
    mkdirSync(this.framesDir, { recursive: true });
  }

  // ─── Budgets ──────────────────────────────────────────────────────────────

  budgetExhausted() {
    if (this.graph.size >= this.limits.maxScreens) return `screen limit (${this.limits.maxScreens})`;
    if (this.actionCount >= this.limits.maxActions) return `action limit (${this.limits.maxActions})`;
    const minutes = (Date.now() - this.startedAt) / 60_000;
    if (minutes >= this.limits.maxMinutes) return `time limit (${this.limits.maxMinutes}m)`;
    return null;
  }

  // ─── Capture ──────────────────────────────────────────────────────────────

  async captureFrame() {
    const file = join(this.framesDir, `frame-${String(++this.frameCount).padStart(4, '0')}.png`);
    await this.sim.screenshot(file);
    return file;
  }

  /**
   * Waits for animation to finish: screenshots on a short poll until two
   * consecutive frames are visually identical, then returns the settled one.
   */
  async waitForSettle() {
    const deadline = Date.now() + this.limits.settleTimeoutMs;
    let previous = null;
    let previousPrint = null;

    while (Date.now() < deadline) {
      const file = await this.captureFrame();
      const print = await fingerprint(file);
      if (previousPrint && hamming(print.dhash, previousPrint.dhash) <= 2) {
        return { file, fingerprint: print };
      }
      previous = file;
      previousPrint = print;
      await sleep(this.limits.settlePollMs);
    }

    log.debug('settle timed out — using last frame');
    const file = previous ?? (await this.captureFrame());
    return { file, fingerprint: previousPrint ?? (await fingerprint(file)) };
  }

  /**
   * Captures the current screen and resolves it against the graph.
   * @returns {Promise<{node: object, isNew: boolean}>}
   */
  async observe(context = {}) {
    const settled = await this.waitForSettle();
    const elements = await this.sim.describeElements();
    const labels = labelsOf(elements);

    const existing = this.graph.match(settled.fingerprint, labels);
    if (existing) {
      existing.visits++;
      return { node: existing, isNew: false, elements };
    }

    const analysis = await this.analyseSafely(settled.file, elements);
    const node = this.graph.add({
      fingerprint: settled.fingerprint,
      labels,
      screenshot: settled.file,
      analysis,
      depth: context.depth ?? 0,
      path: context.path ?? [],
    });

    this.applySafety(node, labels);
    if (!node.blocked) {
      this.registerActions(node, analysis.actions);
    }

    return { node, isNew: true, elements };
  }

  /**
   * A model failure must not end the crawl — the screen is still worth keeping,
   * it just lands as "other" with no actions, which retires that branch.
   */
  async analyseSafely(file, elements) {
    try {
      return await analyseScreen(file, elements, { backend: this.backend });
    } catch (error) {
      log.warn(`analysis failed (${error.message.split('\n')[0]}) — filing screen as "other"`);
      return {
        screenType: 'other',
        category: null,
        flow: null,
        name: 'Unanalysed screen',
        description: '',
        tags: [],
        elements: [],
        style: [],
        blocked: false,
        blockedReason: null,
        actions: [],
        analysisFailed: true,
      };
    }
  }

  /** Marks a screen as an access control and retires its branch. */
  applySafety(node, labels) {
    const verdict = isBlockingScreen({
      screenType: node.analysis.screenType,
      name: node.analysis.name,
      description: node.analysis.description,
      blocked: node.analysis.blocked,
      blockedReason: node.analysis.blockedReason,
      labels,
    });

    if (verdict.blocked) {
      node.blocked = true;
      node.blockedReason = verdict.reason;
      this.blockedBranches.push({
        nodeId: node.id,
        name: node.analysis.name,
        screenType: node.analysis.screenType,
        reason: verdict.reason,
      });
      log.blocked(`${node.id} ${node.analysis.name} — ${verdict.reason}`);
      log.detail('branch stopped; screen kept for the library');
    }
  }

  /** Filters the model's suggested actions through the safety rules. */
  registerActions(node, actions) {
    const allowed = [];
    for (const action of actions) {
      const verdict = actionSafety(action);
      if (!verdict.safe) {
        log.debug(`skip "${action.label}" (${verdict.rule})`);
        continue;
      }
      if (action.risk !== 'safe') {
        log.debug(`skip "${action.label}" (model risk: ${action.risk})`);
        continue;
      }
      allowed.push(action);
    }
    this.graph.setActions(node, allowed);

    // Record what was filtered, so a run report can explain a thin frontier.
    for (const action of actions) {
      if (allowed.includes(action)) continue;
      const verdict = actionSafety(action);
      const key = `skipped:${action.label}:${action.kind}`;
      if (node.actions.has(key)) continue;
      node.actions.set(key, {
        key,
        label: action.label,
        kind: action.kind,
        risk: action.risk,
        navigational: action.navigational,
        explored: false,
        skipped: true,
        skipReason: verdict.rule ?? `risk:${action.risk}`,
        resultNodeId: null,
      });
    }
  }

  // ─── Movement ─────────────────────────────────────────────────────────────

  /** Converts an action's point to device coordinates and taps it. */
  async execute(action) {
    const { x, y } = action.point;
    const size = this.sim.screenSize || { width: 390, height: 844 };
    const target = action.point.normalised ? { x: x * size.width, y: y * size.height } : { x, y };
    await this.sim.tap(target.x, target.y);
    this.actionCount++;
    await sleep(this.limits.afterTapMs);
  }

  /**
   * Returns to a screen with untried actions. Tries the back gesture first;
   * falls back to a relaunch plus path replay.
   * @returns {Promise<object|null>} the node we ended up on
   */
  async recover(target) {
    log.detail(`recovering to ${target.id} (${target.analysis.name})`);

    // The cheap route: one edge-swipe back often lands somewhere useful.
    try {
      await this.sim.goBack();
      await sleep(this.limits.afterTapMs);
      const { node } = await this.observe();
      if (this.graph.hasPending(node) && !node.blocked) return node;
    } catch (error) {
      log.debug(`back gesture failed: ${error.message}`);
    }

    // The reliable route: cold start, then repeat the recorded taps.
    await this.sim.relaunch(this.app.bundleId);
    await sleep(1500);
    let { node } = await this.observe();

    for (const step of target.path) {
      const action = node.actions.get(step);
      if (!action) {
        log.debug(`replay diverged at ${node.id} — step "${step}" not present`);
        return node;
      }
      await this.execute(action);
      ({ node } = await this.observe({ depth: node.depth + 1, path: [...node.path, step] }));
    }

    return node;
  }

  // ─── Main loop ────────────────────────────────────────────────────────────

  async run() {
    log.heading('Crawling');

    let { node } = await this.observe({ depth: 0, path: [] });
    log.ok(`${node.id} ${node.analysis.name} — ${node.analysis.screenType} (root)`);

    while (true) {
      const exhausted = this.budgetExhausted();
      if (exhausted) {
        this.stopReason = `stopped at ${exhausted}`;
        break;
      }

      if (node.blocked || node.depth >= this.limits.maxDepth || !this.graph.hasPending(node)) {
        const candidates = this.graph.frontier().filter((candidate) => candidate.depth < this.limits.maxDepth);
        if (!candidates.length) {
          this.stopReason = 'exploration complete — no reachable screens with untried actions';
          break;
        }
        node = await this.recover(candidates[0]);
        if (!this.graph.hasPending(node)) {
          // Recovery landed somewhere unhelpful. Let the next iteration pick
          // another frontier node; the visit counter stops this looping forever.
          if (node.visits > 4) {
            this.stopReason = 'could not return to any screen with untried actions';
            break;
          }
        }
        continue;
      }

      const action = this.graph.nextAction(node);
      if (!action) continue;

      const from = node;
      action.explored = true;
      log.step(`${from.id} → tap "${action.label || action.kind}"`);

      try {
        await this.execute(action);
      } catch (error) {
        action.skipped = true;
        action.skipReason = `tap failed: ${error.message}`;
        log.warn(`tap failed: ${error.message}`);
        continue;
      }

      const observation = await this.observe({ depth: from.depth + 1, path: [...from.path, action.key] });
      node = observation.node;
      action.resultNodeId = node.id;
      this.graph.connect(from.id, action.key, node.id, action.label);

      if (observation.isNew) {
        log.ok(`${node.id} ${node.analysis.name} — ${node.analysis.screenType} (depth ${node.depth})`);
      } else {
        log.detail(`→ ${node.id} (already seen, ${node.visits} visits)`);
        if (node.id === from.id) {
          // The tap changed nothing visible. Not a navigation control after all.
          action.skipped = true;
          action.skipReason = 'no screen change';
        }
      }
    }

    log.heading('Crawl finished');
    log.info(this.stopReason);
    log.info(`${this.graph.size} unique screens, ${this.actionCount} actions, ${this.blockedBranches.length} blocked branches`);

    this.writeGraph();
    return this.graph;
  }

  writeGraph() {
    const payload = {
      app: { id: this.app.appId, name: this.app.name, bundleId: this.app.bundleId },
      device: { name: this.sim.deviceName, udid: this.sim.udid, screen: this.sim.screenSize },
      startedAt: new Date(this.startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
      stopReason: this.stopReason,
      limits: this.limits,
      counts: {
        screens: this.graph.size,
        actions: this.actionCount,
        frames: this.frameCount,
        blockedBranches: this.blockedBranches.length,
      },
      blockedBranches: this.blockedBranches,
      graph: this.graph.toJSON(),
    };
    writeFileSync(join(this.runDir, 'graph.json'), `${JSON.stringify(payload, null, 2)}\n`);
    return payload;
  }
}

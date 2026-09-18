/**
 * The screen graph: what we have seen, how we got there, and what is left.
 *
 * Nodes are unique screens, edges are the taps that moved between them. The
 * graph is the crawler's memory — it answers "is this new?", "what haven't I
 * tried here?", and "how do I get back to that screen?".
 *
 * Deduplication is deliberately two-signal. Pixels alone call a scrolled feed a
 * new screen; labels alone merge two settings pages that share a header. A
 * screen matches an existing node when the pixels are nearly identical, or when
 * the pixels are close *and* the visible text agrees.
 */

import { hamming, jaccard } from './hash.js';

/** Bit distance under which two frames are the same screen outright. */
const IDENTICAL_BITS = 6;
/** Bit distance still considered the same screen if the labels also agree. */
const SIMILAR_BITS = 18;
/** Label overlap required to rescue a near-miss at SIMILAR_BITS. */
const LABEL_AGREEMENT = 0.82;

export class ScreenGraph {
  constructor() {
    /** @type {Map<string, object>} */
    this.nodes = new Map();
    /** @type {Array<{from: string, to: string, actionKey: string, label: string}>} */
    this.edges = [];
    this.rootId = null;
    this.sequence = 0;
  }

  /**
   * Finds the node matching a fingerprint, or null.
   * @param {{dhash: string, ahash: string}} fingerprint
   * @param {string[]} labels lowercase visible text
   */
  match(fingerprint, labels = []) {
    let best = null;
    let bestDistance = Number.MAX_SAFE_INTEGER;

    for (const node of this.nodes.values()) {
      const dDistance = hamming(fingerprint.dhash, node.fingerprint.dhash);
      const aDistance = hamming(fingerprint.ahash, node.fingerprint.ahash);
      // Both hashes must agree. Taking the lower of the two would merge two
      // genuinely different screens whenever either hash happened to collide —
      // and a wrongly merged screen is content lost from the library, where a
      // wrongly split one is only a near-duplicate a reviewer can delete.
      const distance = Math.max(dDistance, aDistance);

      if (distance <= IDENTICAL_BITS) {
        if (distance < bestDistance) {
          best = node;
          bestDistance = distance;
        }
        continue;
      }

      if (distance <= SIMILAR_BITS && labels.length && node.labels.length) {
        if (jaccard(labels, node.labels) >= LABEL_AGREEMENT && distance < bestDistance) {
          best = node;
          bestDistance = distance;
        }
      }
    }

    return best;
  }

  /**
   * Registers a new screen.
   * @param {object} screen
   */
  add(screen) {
    const id = `s${String(++this.sequence).padStart(3, '0')}`;
    const node = {
      id,
      fingerprint: screen.fingerprint,
      labels: screen.labels || [],
      screenshot: screen.screenshot,
      analysis: screen.analysis,
      depth: screen.depth ?? 0,
      /** Shortest known action path from the root, for replay. */
      path: screen.path ?? [],
      blocked: false,
      blockedReason: null,
      visits: 1,
      /** @type {Map<string, object>} action key → action record */
      actions: new Map(),
    };
    this.nodes.set(id, node);
    if (!this.rootId) this.rootId = id;
    return node;
  }

  get(id) {
    return this.nodes.get(id);
  }

  get size() {
    return this.nodes.size;
  }

  /** Seeds a node's action list from an analysis, preserving already-explored marks. */
  setActions(node, actions) {
    for (const action of actions) {
      const key = actionKey(action);
      if (node.actions.has(key)) continue;
      node.actions.set(key, {
        key,
        ...action,
        explored: false,
        skipped: false,
        skipReason: null,
        resultNodeId: null,
      });
    }
  }

  /** The next action to try on this node, or null when it is exhausted. */
  nextAction(node) {
    const pending = [...node.actions.values()].filter((action) => !action.explored && !action.skipped);
    if (!pending.length) return null;
    // Navigational controls first, then the ones with a label we understand:
    // tab bars and list rows are the cheapest route to structurally new screens.
    const weight = (action) =>
      (action.navigational ? 0 : 4) +
      ({ tab: 0, cell: 1, button: 2, link: 2 }[action.kind] ?? 3) +
      (action.label ? 0 : 1);
    pending.sort((a, b) => weight(a) - weight(b));
    return pending[0];
  }

  hasPending(node) {
    return [...node.actions.values()].some((action) => !action.explored && !action.skipped);
  }

  /** Nodes with untried actions, nearest to the root first — cheapest to replay. */
  frontier() {
    return [...this.nodes.values()]
      .filter((node) => !node.blocked && this.hasPending(node))
      .sort((a, b) => a.path.length - b.path.length);
  }

  connect(fromId, actionKey, toId, label) {
    const existing = this.edges.find(
      (edge) => edge.from === fromId && edge.actionKey === actionKey && edge.to === toId,
    );
    if (!existing) this.edges.push({ from: fromId, to: toId, actionKey, label });
  }

  /**
   * Serialisable form, written to the run directory. Maps become arrays so the
   * file is diffable and can be replayed without the crawler.
   */
  toJSON() {
    return {
      rootId: this.rootId,
      nodes: [...this.nodes.values()].map((node) => ({
        id: node.id,
        name: node.analysis?.name ?? null,
        screenType: node.analysis?.screenType ?? null,
        depth: node.depth,
        path: node.path,
        blocked: node.blocked,
        blockedReason: node.blockedReason,
        visits: node.visits,
        screenshot: node.screenshot,
        fingerprint: node.fingerprint,
        analysis: node.analysis,
        actions: [...node.actions.values()].map((action) => ({
          key: action.key,
          label: action.label,
          kind: action.kind,
          risk: action.risk,
          navigational: action.navigational,
          explored: action.explored,
          skipped: action.skipped,
          skipReason: action.skipReason,
          resultNodeId: action.resultNodeId,
        })),
      })),
      edges: this.edges,
    };
  }
}

/**
 * A stable identity for one control, so the same button is recognised across
 * visits. Coordinates are rounded hard because a few points of layout drift
 * between renders should not look like a different control.
 */
export function actionKey(action) {
  const frame = action.frame;
  const box = frame
    ? `${Math.round(frame.x / 8)},${Math.round(frame.y / 8)},${Math.round(frame.width / 8)},${Math.round(frame.height / 8)}`
    : `${(action.point.x ?? 0).toFixed(2)},${(action.point.y ?? 0).toFixed(2)}`;
  return `${action.kind}|${(action.label || '').toLowerCase()}|${box}`;
}

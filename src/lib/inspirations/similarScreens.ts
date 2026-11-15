import type { Flow, Screen } from './types';

/**
 * Screens like one being looked at, from other apps, best first — for the screen view's Zoom out.
 *
 * The candidates are already the same type on the same section (Webs or iOS). Among them the best
 * match is the same step of the same kind of journey: Claude's sign-in during onboarding first meets
 * LinkedIn's and Grok's sign-in during onboarding, then other login screens. After that, screens that
 * share more UI elements. One per app comes first, so the grid shows as many apps as it can.
 */
export function rankSimilar(
  current: Screen,
  currentFlow: Flow | null,
  candidates: Screen[],
  flowOf: (screenId: string) => Flow | null,
  limit: number,
): Screen[] {
  const position = (flow: Flow | null, id: string) => {
    if (!flow || flow.screenIds.length < 2) return null;
    const i = flow.screenIds.indexOf(id);
    return i < 0 ? null : i / (flow.screenIds.length - 1);
  };
  const here = position(currentFlow, current.id);
  const elements = new Set(current.elements ?? []);

  const scored = candidates
    .filter((s) => s.appId !== current.appId && s.platform && s.id !== current.id)
    .map((s, order) => {
      const flow = flowOf(s.id);
      let score = 0;
      if (currentFlow && flow && flow.category === currentFlow.category) {
        score += 3;
        const there = position(flow, s.id);
        if (here !== null && there !== null) score += 2 * (1 - Math.abs(here - there));
      }
      score += 0.3 * (s.elements ?? []).filter((e) => elements.has(e)).length;
      return { s, score, order };
    })
    .sort((a, b) => b.score - a.score || a.order - b.order);

  // One per app first, then the next best of each, until the grid is full.
  const out: Screen[] = [];
  const perApp = new Map<string, number>();
  for (let round = 0; out.length < limit && round < 4; round++) {
    for (const { s } of scored) {
      if (out.length >= limit) break;
      if (out.includes(s) || (perApp.get(s.appId) ?? 0) !== round) continue;
      out.push(s);
      perApp.set(s.appId, round + 1);
    }
  }
  return out;
}

import { describe, expect, it } from 'vitest';
import { rankSimilar } from './similarScreens';
import type { Flow, Screen } from './types';

const screen = (id: string, appId: string, elements: string[] = []) => ({ id, appId, platform: 'webapp', screenType: 'login', elements }) as unknown as Screen;
const flow = (id: string, category: string, screenIds: string[]) => ({ id, category, screenIds, parentId: 'area' }) as unknown as Flow;

describe('similar screens', () => {
  const current = screen('claude-1', 'claude', ['button']);
  const currentFlow = flow('claude-onb', 'onboarding', ['claude-0', 'claude-1']);
  const flows = [
    currentFlow,
    flow('li-onb', 'onboarding', ['li-0', 'li-1']),
    flow('grok-set', 'settings', ['grok-1']),
    flow('dr-onb', 'onboarding', ['dr-1', 'dr-9']),
  ];
  const flowOf = (id: string) => flows.find((f) => f.screenIds.includes(id)) ?? null;

  it('never shows the same app, and ranks the same step of the same kind of flow first', () => {
    const out = rankSimilar(current, currentFlow, [screen('grok-1', 'grok-ai'), screen('claude-0', 'claude'), screen('dr-1', 'dribbble'), screen('li-1', 'linkedin')], flowOf, 8);
    expect(out.map((s) => s.id)).toEqual(['li-1', 'dr-1', 'grok-1']);
  });

  it('shows one screen per app before a second from any app', () => {
    const out = rankSimilar(current, currentFlow, [screen('li-1', 'linkedin'), screen('li-0', 'linkedin'), screen('grok-1', 'grok-ai')], flowOf, 3);
    expect(out.map((s) => s.appId)).toEqual(['linkedin', 'grok-ai', 'linkedin']);
  });

  it('keeps to the limit', () => {
    expect(rankSimilar(current, null, [screen('a', 'x'), screen('b', 'y'), screen('c', 'z')], flowOf, 2)).toHaveLength(2);
  });
});

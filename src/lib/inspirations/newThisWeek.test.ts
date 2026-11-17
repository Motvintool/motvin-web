import { describe, expect, it } from 'vitest';
import { newThisWeek } from './appFreshness';

const apps = ['canva', 'notion', 'uber', 'calm'].map((id) => ({ id }));
const none = { ios: [], webs: [] };
const ids = (list: { id: string }[]) => list.map((a) => a.id);
const WEBS = ['web', 'webapp'] as const;

describe('New this week', () => {
  it('is empty until the admin picks apps', () => {
    expect(newThisWeek(apps, undefined, ['ios'])).toEqual([]);
    expect(newThisWeek(apps, { added: none, order: none }, WEBS)).toEqual([]);
  });

  it('shows the picked apps in the order set, unplaced picks after in the order picked', () => {
    const settings = { added: { ...none, webs: ['uber', 'canva', 'calm'] }, order: { ...none, webs: ['canva'] } };
    expect(ids(newThisWeek(apps, settings, WEBS))).toEqual(['canva', 'uber', 'calm']);
  });

  it('keeps each section to its own picks', () => {
    const settings = { added: { ios: ['notion'], webs: ['canva'] }, order: none };
    expect(ids(newThisWeek(apps, settings, ['ios']))).toEqual(['notion']);
    expect(ids(newThisWeek(apps, settings, WEBS))).toEqual(['canva']);
  });
});

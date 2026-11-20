import { describe, expect, it } from 'vitest';
import { sortItems } from './SortBar';

// A page from the Thin boundary: hairlines (band 0) and light weights (band 1).
const page = [
  { id: 'a', name: 'acorn', popularity: 1, weightBand: 1 },
  { id: 'b', name: 'bell', popularity: 9, weightBand: 0 },
  { id: 'c', name: 'zap', popularity: 5, weightBand: 0 },
  { id: 'd', name: 'yarn', popularity: 8, weightBand: 1 },
];
const names = (list: { name: string }[]) => list.map((i) => i.name);

describe('sortItems on a Thin page', () => {
  it('sorts by name within each weight group, hairlines first', () => {
    expect(names(sortItems(page, 'name-asc'))).toEqual(['bell', 'zap', 'acorn', 'yarn']);
    expect(names(sortItems(page, 'name-desc'))).toEqual(['zap', 'bell', 'yarn', 'acorn']);
  });

  it('keeps hairlines first when sorting by popularity', () => {
    expect(names(sortItems(page, 'popular'))).toEqual(['bell', 'zap', 'yarn', 'acorn']);
  });

  it('keeps hairlines first in the trending order', () => {
    const bands = sortItems(page, 'trending').map((i) => i.weightBand);
    expect(bands).toEqual([0, 0, 1, 1]);
  });

  it('leaves the API order alone for the default view', () => {
    expect(names(sortItems(page, 'all'))).toEqual(['acorn', 'bell', 'zap', 'yarn']);
  });

  it('sorts plainly when items carry no band (logos, other styles)', () => {
    const plain = page.map((item) => ({ ...item, weightBand: undefined }));
    expect(names(sortItems(plain, 'name-asc'))).toEqual(['acorn', 'bell', 'yarn', 'zap']);
  });
});

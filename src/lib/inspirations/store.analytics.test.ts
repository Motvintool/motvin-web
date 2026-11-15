import { beforeEach, describe, expect, it, vi } from 'vitest';

// A visitor who allowed analytics: gtag is on the page.
const gtag = vi.fn();
const storage = new Map<string, string>();
const localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
};
vi.stubGlobal('localStorage', localStorage);
vi.stubGlobal('window', { gtag, localStorage, addEventListener() {}, removeEventListener() {} });

const { libraryStore } = await import('./store');

describe('saving tells Analytics', () => {
  beforeEach(() => gtag.mockClear());

  it('records a save, once, and not a removal', () => {
    const board = libraryStore.createCollection('Test');
    libraryStore.addToCollection(board.id, { type: 'screen', id: 's1' });
    libraryStore.addToCollection(board.id, { type: 'screen', id: 's1' });
    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag).toHaveBeenCalledWith('event', 'save_item', { item_type: 'screen' });

    gtag.mockClear();
    libraryStore.toggleInCollection(board.id, { type: 'screen', id: 's1' });
    expect(gtag).not.toHaveBeenCalled();
    libraryStore.toggleInCollection(board.id, { type: 'app', id: 'a1' });
    expect(gtag).toHaveBeenCalledWith('event', 'save_item', { item_type: 'app' });
  });
});

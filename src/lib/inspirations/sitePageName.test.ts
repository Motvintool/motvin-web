import { describe, expect, it } from 'vitest';
import { sitePageName } from './taxonomy';

describe('what a site page is called', () => {
  it('is its own name when it was given one, else its type', () => {
    expect(sitePageName({ pageType: 'other', customName: 'Integrations Hub' })).toBe('Integrations Hub');
    expect(sitePageName({ pageType: 'pricing', customName: null })).toBe('Pricing Page');
    expect(sitePageName(null)).toBe('Other Page');
  });
});

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// The Web (sites) review check, run as the review runs it, on a made-up upload: two pages that both carry the
// site's header, its Products menu and its footer.
const SCRIPT = resolve(__dirname, '../../../tools/site-review/apply-site-review.mjs');
const APP = 'acme';
const VERSION = '2026-11-24';

let root: string;
let data: string;
let reviewDir: string;

const section = (key: string, sectionType: string, heading = '') => ({ key, sectionType, heading, look: `look/section-${key}.jpg` });
const pack = {
  app: APP,
  platform: 'site',
  version: VERSION,
  appInfo: { name: 'Acme', industry: 'saas', tagline: '', website: '' },
  industries: ['saas', 'fintech'],
  pages: [
    { n: 1, url: 'https://acme.com/', title: 'Acme', pageType: 'landing', look: { top: 'a', overview: 'b' }, sections: [section('1-1', 'navigation'), section('1-2', 'nav-menu', 'Products menu'), section('1-3', 'hero', 'Pay anyone'), section('1-4', 'footer')] },
    { n: 2, url: 'https://acme.com/pricing', title: 'Pricing', pageType: 'pricing', look: { top: 'c', overview: 'd' }, sections: [section('2-1', 'navigation'), section('2-2', 'nav-menu', 'Products menu'), section('2-3', 'pricing', 'Plans'), section('2-4', 'footer')] },
  ],
};
const say = (what: string) => `${what} shown in this section's picture`;
const base = () => ({
  app: { industry: 'saas', tagline: 'Payroll for global teams' },
  pages: { 1: { pageType: 'landing', verdict: 'Home page with hero and footer' }, 2: { pageType: 'pricing', verdict: 'Pricing page with three plans' } },
  sections: {
    '1-1': { sectionType: 'navigation', verdict: say('Top bar with logo') },
    '1-2': { sectionType: 'nav-menu', verdict: say('Products menu opened') },
    '1-3': { sectionType: 'hero', verdict: say('Headline and two buttons') },
    '1-4': { sectionType: 'footer', verdict: say('Footer link columns') },
    '2-1': { sectionType: 'navigation', verdict: say('The same top bar again') },
    '2-2': { sectionType: 'nav-menu', verdict: say('The same Products menu') },
    '2-3': { sectionType: 'pricing', verdict: say('Three plan cards') },
    '2-4': { sectionType: 'footer', verdict: say('The same footer again') },
  } as Record<string, Record<string, unknown>>,
});

function check(corrections: unknown) {
  writeFileSync(join(reviewDir, 'corrections.json'), JSON.stringify(corrections));
  const run = spawnSync('node', [SCRIPT, APP, VERSION], { env: { ...process.env, INSPIRATIONS_DATA_DIR: data }, encoding: 'utf-8' });
  return `${run.stdout}${run.stderr}`;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'site-review-'));
  data = join(root, 'data', 'inspirations');
  reviewDir = join(root, 'data', 'reviews', `${APP}-site-${VERSION}`);
  mkdirSync(join(data, 'screens', 'site', APP, 'versions', VERSION), { recursive: true });
  mkdirSync(reviewDir, { recursive: true });
  writeFileSync(join(reviewDir, 'site-review.json'), JSON.stringify(pack));
  writeFileSync(join(data, 'apps.json'), JSON.stringify({ apps: [{ id: APP, name: 'Acme', industry: 'saas', tagline: '' }] }));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('the site review check', () => {
  it('asks for the header, menu and footer repeated on a later page to go', () => {
    const out = check(base());
    expect(out).toContain('review check: 3 problem(s) left');
    expect(out).toContain('section 2-1: repeats 1-1');
    expect(out).toContain('section 2-2: repeats 1-2 (the same Navigation Menu "Products menu" on page 1)');
    expect(out).toContain('section 2-4: repeats 1-4');
  });

  it('passes them removed, or kept with how they differ', () => {
    const fixed = base();
    fixed.sections['2-1'] = { remove: true, verdict: 'The same top bar as page 1' };
    fixed.sections['2-2'] = { remove: true, verdict: 'The same Products menu as page 1' };
    fixed.sections['2-4'] = { sectionType: 'footer', verdict: say('A shorter footer'), differs: 'Only legal links, no product columns' };
    // Every check passes, so it goes on to apply and rebuild (which, outside the real backend, cannot run).
    const out = check(fixed);
    expect(out).not.toContain('repeats');
    expect(out).toContain('rebuilding the library failed');
  });

  it('refuses one verdict pasted onto many sections', () => {
    const lazy = base();
    for (const key of ['1-1', '1-2', '1-3', '1-4']) lazy.sections[key].verdict = 'A section of the page';
    expect(check(lazy)).toContain('sections 1-1, 1-2, 1-3, 1-4: the same verdict');
  });

  it('saves the site address from its landing page', () => {
    const fixed = base();
    for (const key of ['2-1', '2-2', '2-4']) fixed.sections[key] = { remove: true, verdict: 'The same as on page 1' };
    check(fixed);
    // The library rebuild that follows needs the real backend; the address is written before it.
    const record = JSON.parse(readFileSync(join(data, 'apps.json'), 'utf-8')).apps[0];
    expect(record.website).toBe('https://acme.com');
  });
});

describe('the site review looks again, with fresh eyes', () => {
  // The repeats on page 2 removed, so the first pass is complete.
  const complete = () => {
    const c = base();
    for (const key of ['2-1', '2-2', '2-4']) c.sections[key] = { remove: true, verdict: 'The same as on page 1' };
    return c;
  };
  const lookList = () => JSON.parse(readFileSync(join(reviewDir, 'look-again.json'), 'utf-8')) as { key: string; kind: string }[];

  it('lists a changed type, a heading that reads like another type, and a removal — and holds the review', () => {
    const c = complete();
    c.sections['1-3'] = { sectionType: 'content', verdict: say('Headline and two buttons') };
    c.sections['2-3'] = { remove: true, verdict: 'Looks like an empty strip' };
    const out = check(c);
    expect(lookList().map((item) => `${item.key}:${item.kind}`)).toEqual(['1-3:changed', '2-3:removed']);
    expect(out).toContain('look again (changed): section 1-3 was hero, now content');
    expect(out).toContain('look again (removed): section 2-3 was removed');
    expect(out).not.toContain('rebuilding the library failed');
  });

  it('catches a heading that names another type', () => {
    const asked = structuredClone(pack);
    asked.pages[0].sections[2].heading = 'Frequently asked questions';
    writeFileSync(join(reviewDir, 'site-review.json'), JSON.stringify(asked));
    expect(check(complete())).toContain('section 1-3 is hero, but its heading "Frequently asked questions" reads like faq');
  });

  it('passes once every item is decided, and refuses "fixed" with nothing changed', () => {
    const c = complete();
    c.sections['1-3'] = { sectionType: 'content', verdict: say('Headline and two buttons') };
    check(c);
    const saidFixed = { ...c, lookAgain: [{ key: '1-3', decision: 'fixed', why: 'It has a headline and buttons' }] };
    expect(check(saidFixed)).toContain('look again 1-3: said fixed, but it is unchanged');
    const fixed = { ...c, sections: { ...c.sections, '1-3': { sectionType: 'hero', verdict: say('Headline and two buttons') } }, lookAgain: saidFixed.lookAgain };
    const out = check(fixed);
    expect(out).not.toContain('look again');
    expect(out).toContain('rebuilding the library failed');
  });
});

describe('a page named by hand in the recorder', () => {
  it('keeps its name through the review, with the type the review picks', () => {
    const side = join(data, 'screens', 'site', APP, 'versions', VERSION, 'pages');
    mkdirSync(side, { recursive: true });
    writeFileSync(join(side, '2.json'), JSON.stringify({ name: 'Plans and partners', customName: 'Plans and partners', kind: 'page', pageType: 'other' }));
    const c = base();
    for (const key of ['2-1', '2-2', '2-4']) c.sections[key] = { remove: true, verdict: 'The same as on page 1' };
    check(c);
    const meta = JSON.parse(readFileSync(join(side, '2.json'), 'utf-8'));
    expect(meta).toMatchObject({ name: 'Plans and partners', customName: 'Plans and partners', pageType: 'pricing' });
  });
});

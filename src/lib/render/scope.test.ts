import { describe, expect, it } from 'vitest';
import { scopeSvgNames } from './scope';

const prefixOf = (out: string) => /id="(m[0-9a-z]+-)/.exec(out)?.[1] ?? /class="(m[0-9a-z]+-)/.exec(out)?.[1];

describe('scopeSvgNames', () => {
  it('leaves artwork with nothing named untouched', () => {
    const svg = '<path d="M0 0h1"/>';
    expect(scopeSvgNames(svg)).toBe(svg);
  });

  it('prefixes ids and every kind of reference to them', () => {
    const out = scopeSvgNames(
      '<defs><linearGradient id="a"/><clipPath id="c"/></defs>' +
        '<path fill="url(#a)" clip-path="url(\'#c\')" style="stroke:url(#a)"/>' +
        '<use href="#a"/><use xlink:href="#c"/><path fill="url(#other)"/>',
    );
    const p = prefixOf(out);
    expect(out).toContain(`id="${p}a"`);
    expect(out).toContain(`fill="url(#${p}a)"`);
    expect(out).toContain(`clip-path="url('#${p}c')"`);
    expect(out).toContain(`style="stroke:url(#${p}a)"`);
    expect(out).toContain(`href="#${p}a"`);
    expect(out).toContain(`xlink:href="#${p}c"`);
    // A reference to an id this artwork does not own is left alone.
    expect(out).toContain('fill="url(#other)"');
  });

  it('scopes class rules so one logo cannot repaint another', () => {
    const a = scopeSvgNames('<style>.st0{fill:#60C575;}</style><path class="st0"/>');
    const b = scopeSvgNames('<style>.st0{fill:#0C2F74;}</style><path class="st0"/>');
    expect(prefixOf(a)).not.toBe(prefixOf(b));
    expect(a).toContain(`.${prefixOf(a)}st0{fill:#60C575;}`);
    expect(a).toContain(`class="${prefixOf(a)}st0"`);
  });

  it('never rewrites declaration values that look like selectors', () => {
    const out = scopeSvgNames('<style>.a,.b{opacity:.5;fill:#fff}#g .a{fill:url(#g)}</style><g id="g" class="a b"/>');
    const p = prefixOf(out);
    expect(out).toContain(`.${p}a,.${p}b{opacity:.5;fill:#fff}`);
    expect(out).toContain(`#${p}g .${p}a{fill:url(#${p}g)}`);
  });

  it('gives the same markup the same prefix (server and client agree)', () => {
    const svg = '<linearGradient id="a"/><path fill="url(#a)"/>';
    expect(scopeSvgNames(svg)).toBe(scopeSvgNames(svg));
  });
});

/**
 * Per-item naming for inline SVG.
 *
 * A grid inlines dozens of SVGs into one HTML document, and everything an SVG
 * names is global there: `id="a"` gradients resolve to whichever came first,
 * and a `<style>` block's `.st0{fill:…}` paints every `.st0` on the page.
 * VectorLogoZone alone ships 637 logos with class rules; 334 of them rendered
 * in another logo's colours. This rewrites every id, every reference to one,
 * and (when the artwork carries a stylesheet) every class with a prefix
 * derived from the markup itself — the same input always gets the same
 * prefix, so server and client renders match.
 *
 * String-based rather than DOM-based so it runs during SSR too. The export
 * path has its own DOM version (namespaceIds in flatten.ts) for merged sheets.
 */

const ID_ATTR = /\bid\s*=\s*"([^"]+)"/g;
const CLASS_ATTR = /\bclass\s*=\s*"([^"]*)"/g;
const STYLE_BLOCK = /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi;

/** FNV-1a, base 36 — short, stable, no crypto needed. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function scopeSvgNames(markup: string): string {
  const hasIds = markup.includes('id=');
  const hasStyle = /<style\b/i.test(markup);
  if (!hasIds && !hasStyle) return markup;

  const prefix = `m${hash(markup)}-`;

  const ids = new Set<string>();
  for (const m of markup.matchAll(ID_ATTR)) ids.add(m[1]);
  const classes = new Set<string>();
  if (hasStyle) {
    for (const m of markup.matchAll(CLASS_ATTR)) {
      for (const name of m[1].split(/\s+/)) if (name) classes.add(name);
    }
  }
  if (ids.size === 0 && classes.size === 0) return markup;

  const scopeRef = (id: string, whole: string, wrap: (id: string) => string) =>
    ids.has(id) ? wrap(prefix + id) : whole;

  let out = markup;
  if (ids.size) {
    out = out
      .replace(ID_ATTR, (_m, id: string) => `id="${prefix}${id}"`)
      // url(#id) in attributes, inline styles and style blocks alike.
      .replace(/url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/g, (m, q: string, id: string) =>
        scopeRef(id, m, (s) => `url(${q}#${s}${q})`),
      )
      .replace(/\b((?:xlink:)?href)\s*=\s*"#([^"]+)"/g, (m, attr: string, id: string) =>
        scopeRef(id, m, (s) => `${attr}="#${s}"`),
      );
  }

  if (classes.size) {
    out = out.replace(CLASS_ATTR, (_m, list: string) => {
      const next = list
        .split(/\s+/)
        .filter(Boolean)
        .map((name) => prefix + name)
        .join(' ');
      return `class="${next}"`;
    });
  }

  if (hasStyle) {
    out = out.replace(STYLE_BLOCK, (_m, open: string, css: string, close: string) => {
      // Selectors only: leave declaration bodies alone so values such as
      // `opacity:.5` or `#fff` are never mistaken for a class or an id.
      const next = css.replace(/([^{}]+)(\{[^}]*\})/g, (_r, selector: string, body: string) => {
        const scoped = selector
          .replace(/\.([A-Za-z_][\w-]*)/g, (s, name: string) =>
            classes.has(name) ? `.${prefix}${name}` : s,
          )
          .replace(/#([A-Za-z_][\w-]*)/g, (s, id: string) => (ids.has(id) ? `#${prefix}${id}` : s));
        return scoped + body;
      });
      return open + next + close;
    });
  }

  return out;
}

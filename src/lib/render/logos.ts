/**
 * Logo rendering — port of renderSvg / renderStyled / recolorMonochrome /
 * whiteIsTheInk in motvin-ui/JS/logos.js.
 *
 * Deliberately not the icons pipeline. A brand logo's colours ARE the brand, so
 * nothing is rewritten unless the mark is monochrome (style "solid"), and there
 * is no stroke control at all — logos aren't line art.
 */

const SHAPE_TAGS = 'path|circle|rect|polygon|polyline|line|ellipse|g|use';

const WHITE_PAINTS = new Set(['#fff', '#ffffff', '#ffff', '#ffffffff', 'white']);

/**
 * Is white the artwork's ink, or a hole punched through it?
 *
 * A white-inked mark (Devicon's *-wordmark, some VectorLogoZone tiles) renders
 * white-on-white and looks like a blank card unless it gets repainted. But for
 * artwork where white is a knockout, repainting it fills the hole in. So: white
 * is the ink only when nothing else is painted.
 */
export function whiteIsTheInk(paths: string): boolean {
  const paints: string[] = [];
  for (const match of paths.matchAll(/\b(?:fill|stroke)\s*=\s*"([^"]*)"/gi)) {
    paints.push(match[1]);
  }
  for (const match of paths.matchAll(/\b(?:fill|stroke)\s*:\s*([^;}"\s!]+)/gi)) {
    paints.push(match[1]);
  }

  // A shape only falls back to black when nothing upstream sets its fill, so
  // ignore anything inside a <g fill="…">, which it inherits from. Checking
  // merely whether such a group exists is not enough: Ubuntu Tile is an
  // undeclared (black) <rect> followed by a filled group, and treating the
  // group as covering the rect flattened the whole tile.
  const outsideGroups = paths.replace(/<g\b[^>]*\bfill\s*=[^>]*>[\s\S]*?<\/g>/gi, '');
  const shapes = /<(path|circle|rect|polygon|polyline|ellipse)\b([^>]*)>/gi;
  for (const match of outsideGroups.matchAll(shapes)) {
    const attrs = match[2];
    if (!/\bfill\s*=/.test(attrs) && !/\bclass\s*=/.test(attrs)) {
      return false; // Implicit black is present, so white is a knockout.
    }
  }

  let sawWhite = false;
  for (const raw of paints) {
    const value = raw.trim().toLowerCase();
    if (!value || value === 'none' || value.startsWith('url(')) continue;
    if (WHITE_PAINTS.has(value)) sawWhite = true;
    else return false; // Something else is painted, so white is a knockout.
  }
  return sawWhite;
}

/** Paints monochrome artwork in the chosen colour. */
export function recolorMonochrome(
  paths: string,
  color: string,
  { repaintWhite = false }: { repaintWhite?: boolean } = {},
): string {
  const keep = (value: string) => {
    const v = value.trim().toLowerCase();
    if (v === 'none' || v.startsWith('url(')) return true;
    return !repaintWhite && WHITE_PAINTS.has(v);
  };

  let out = paths.replace(
    new RegExp(`<(${SHAPE_TAGS})\\b([^>]*)>`, 'gi'),
    (_match, tag: string, rawAttrs: string) => {
      let attrs = rawAttrs;

      if (/\bfill\s*=/.test(attrs)) {
        attrs = attrs.replace(/\bfill\s*=\s*"([^"]*)"/gi, (m, v: string) =>
          keep(v) ? m : `fill="${color}"`,
        );
      } else if (tag.toLowerCase() !== 'g' && !/\bclass\s*=/.test(attrs)) {
        // No declared fill means it paints black by default. Elements carrying
        // a class are painted by the <style> block instead, rewritten below —
        // an attribute here would be dead weight, and CSS would outrank it.
        const selfClosing = attrs.trimEnd().endsWith('/');
        const body = selfClosing ? attrs.trimEnd().slice(0, -1) : attrs;
        attrs = `${body} fill="${color}"${selfClosing ? ' /' : ''}`;
      }

      attrs = attrs.replace(/\bstroke\s*=\s*"([^"]*)"/gi, (m, v: string) =>
        keep(v) ? m : `stroke="${color}"`,
      );

      return `<${tag}${attrs}>`;
    },
  );

  // Some marks set colour through inline CSS rather than attributes.
  out = out.replace(/\bstyle\s*=\s*"([^"]*)"/gi, (_m, decls: string) => {
    const next = decls.replace(
      /(^|;)(\s*)(fill|stroke)\s*:\s*([^;]+)/gi,
      (d, sep: string, ws: string, prop: string, v: string) =>
        keep(v) ? d : `${sep}${ws}${prop}:${color}`,
    );
    return `style="${next}"`;
  });

  // …and some through a <style> block of class rules. Those must be rewritten
  // too: a CSS rule outranks the fill attribute added above, so leaving the
  // block alone would quietly undo the repaint.
  out = out.replace(
    /(<style[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_m, open: string, css: string, close: string) => {
      const next = css.replace(
        /(fill|stroke)(\s*:\s*)([^;}\s!]+)/gi,
        (d, prop: string, sep: string, v: string) => (keep(v) ? d : `${prop}${sep}${color}`),
      );
      return `${open}${next}${close}`;
    },
  );

  return out;
}

export type LogoRenderOptions = {
  size?: number;
  viewBox?: string;
  color?: string;
  /** Only monochrome marks may be repainted; colour logos keep their branding. */
  repaint?: boolean;
};

export function renderLogoSvg(paths: string, opts: LogoRenderOptions = {}): string {
  const size = opts.size ?? 24;
  const viewBox = opts.viewBox || '0 0 24 24';

  // currentColor counts as an ink: a white-inked mark has to be rewritten to it
  // to be visible at all.
  const ink = opts.color;
  const colorAttr = ink && ink !== 'currentColor' ? ` color="${ink}"` : '';
  const body =
    ink && opts.repaint
      ? recolorMonochrome(paths, ink, { repaintWhite: whiteIsTheInk(paths) })
      : paths;

  const innerSvg = `<svg viewBox="${viewBox}" width="24" height="24" x="0" y="0" preserveAspectRatio="xMidYMid meet">${body}</svg>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" class="mi-icon"${colorAttr} aria-hidden="true">${innerSvg}</svg>`;
}

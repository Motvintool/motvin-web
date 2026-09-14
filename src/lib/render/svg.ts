import type { LibraryItem } from '@/lib/api/normalize';

/**
 * SVG rendering pipeline — port of renderSvg() / renderStyled() in
 * motvin-ui/JS/motvin-icons.js.
 *
 * The API hands back *inner* markup (paths, groups) rather than a complete
 * `<svg>`. This wraps it in a 24×24 canvas and rewrites the inner paths so one
 * global colour, stroke width and set of transforms apply consistently across
 * artwork drawn very differently by 240-odd source libraries.
 *
 * Two carve-outs, both load-bearing:
 *  - Colour styles ("3d", "color", "multi-color") keep their native palette;
 *    recolouring them would flatten the entire point of the style.
 *  - Artwork containing <mask> or <defs> is left alone, because the regex
 *    rewriting below destroys mask shapes.
 */

/**
 * Which engine's behaviour to reproduce.
 *
 * illustrations.js shipped an older copy of this renderer that never received
 * four fixes the icons engine got. Reproducing it exactly matters: rendered
 * side by side, 53 of 60 illustrations differ between the two, so quietly
 * adopting the newer behaviour would change what the page looks like.
 */
export type RenderVariant = 'icons' | 'illustrations';

/** The shorter source list the illustrations engine shipped. */
const ILLUSTRATION_FILL_BASED_SOURCES = new Set([
  'fontawesome',
  'material',
  'zondicons',
  'entypo',
  'typicons',
]);

/** Styles whose artwork is multi-colour and must not be recoloured. */
const COLOR_STYLES = new Set(['3d', 'color', 'multi-color']);

export function isColorStyle(style: string | undefined): boolean {
  return COLOR_STYLES.has(String(style ?? '').toLowerCase());
}

/**
 * Collections that draw line art as filled paths rather than strokes. Applying
 * a stroke to these outlines the trace, so every line renders doubled.
 */
const FILL_BASED_SOURCES = new Set([
  'fontawesome',
  'material-symbols',
  'zondicons',
  'entypo',
  'typicons',
  // Thin line art drawn as fills: the fill traces both edges of each line
  // rather than filling a silhouette.
  'carbon-pictograms',
  'linea',
  // Font glyphs — outlines with no stroke of their own, same situation.
  'atlas-icons',
]);

export type RenderOptions = {
  size?: number;
  stroke?: number;
  color?: string;
  viewBox?: string;
  iconStyle?: string;
  sourceId?: string;
  fillMode?: 'none' | 'solid';
  fillColor?: string;
  fillOpacity?: number;
  cap?: string;
  join?: string;
  pattern?: 'solid' | 'dashed' | 'dotted';
  rotation?: number;
  flip?: 'none' | 'h' | 'v';
  opacity?: number;
  shadow?: number;
  shape?: 'none' | 'circle' | 'rect' | 'rounded';
  iconInset?: number;
  shapeRadius?: number;
  shapeColor?: string;
  /** Defaults to the icons engine's behaviour. */
  variant?: RenderVariant;
};

const DASH_PATTERNS: Record<string, string> = {
  solid: '',
  dashed: '3 2',
  dotted: '0.2 2.2',
};

export function renderSvg(paths: string, opts: RenderOptions = {}): string {
  const legacy = opts.variant === 'illustrations';

  // The illustrations engine had no mask/defs guard, so it rewrote masked
  // artwork and destroyed it. Reproduced here rather than silently fixed.
  const hasComplexDefs = legacy
    ? false
    : paths.includes('<mask') || paths.includes('<defs');

  // It also tested only for the literal style "color", so "3d" and
  // "multi-color" artwork lost its palette.
  const keepNativeColors = legacy
    ? opts.iconStyle === 'color'
    : isColorStyle(opts.iconStyle);

  // Inner stroke-widths would otherwise win over the wrapper's. The
  // illustrations engine stripped them unconditionally.
  let cleanPaths =
    legacy || (!keepNativeColors && !hasComplexDefs)
      ? paths.replace(/stroke-width="[^"]*"/g, '')
      : paths;

  const size = opts.size ?? 24;
  const viewBox = opts.viewBox || '0 0 24 24';
  let stroke = opts.stroke ?? 1.75;

  // The artwork is scaled from its native viewBox into a 24×24 canvas, so the
  // stroke has to be scaled inversely for the rendered width to match what the
  // slider says.
  const viewBoxParts = viewBox.trim().split(/\s+/);
  const viewBoxWidth = viewBoxParts.length >= 3 ? parseFloat(viewBoxParts[2]) : 24;
  const scale = size / viewBoxWidth;
  const adjustedStroke = stroke / scale;

  // Test for a real stroke attribute, not the substring "stroke": a stray
  // stroke-width on fill-only artwork (Iconoir's *-solid icons carry one) has
  // no stroke to act on, and matching it would wrongly make those adjustable.
  // The illustrations engine used a naive substring test, which any
  // stroke="none" in the artwork defeats — giving the opposite answer to the
  // icons engine's attribute regex.
  let isFillBased = legacy
    ? !paths.includes('stroke')
    : !/stroke\s*=\s*"(?!\s*none)/i.test(paths);

  const fillBasedSources = legacy ? ILLUSTRATION_FILL_BASED_SOURCES : FILL_BASED_SOURCES;
  const skipsRecolor = legacy ? opts.iconStyle === 'color' : keepNativeColors;
  if (opts.iconStyle !== 'solid' && opts.iconStyle !== 'brands' && !skipsRecolor) {
    if (!fillBasedSources.has(opts.sourceId ?? '')) {
      isFillBased = false;
    }
  }
  if (stroke > 0 && isFillBased) stroke = 0;

  const color = opts.color ?? 'currentColor';
  const cap = opts.cap ?? 'round';
  const join = opts.join ?? 'round';
  const pattern = opts.pattern ?? 'solid';
  const rotation = opts.rotation ?? 0;
  const flip = opts.flip ?? 'none';
  const opacity = (opts.opacity ?? 100) / 100;
  const shadow = opts.shadow ?? 0;
  const shape = opts.shape ?? 'none';
  const iconInset = opts.iconInset ?? 0;
  const shapeRadius = opts.shapeRadius ?? 4;
  const shapeColor = opts.shapeColor ?? '#EEEAFB';

  // Background shape fills the canvas. Explicit stroke="none" so it doesn't
  // inherit the icon's stroke.
  let background = '';
  if (shape === 'circle') {
    background = `<circle cx="12" cy="12" r="12" fill="${shapeColor}" stroke="none"/>`;
  } else if (shape === 'rect') {
    background = `<rect x="0" y="0" width="24" height="24" fill="${shapeColor}" stroke="none"/>`;
  } else if (shape === 'rounded') {
    background = `<rect x="0" y="0" width="24" height="24" rx="${shapeRadius}" ry="${shapeRadius}" fill="${shapeColor}" stroke="none"/>`;
  }

  const transforms: string[] = [];
  if (shape !== 'none' && iconInset > 0) {
    const insetScale = (24 - 2 * iconInset) / 24;
    transforms.push(`translate(12 12) scale(${insetScale}) translate(-12 -12)`);
  }
  if (rotation) transforms.push(`rotate(${rotation} 12 12)`);
  if (flip === 'h') transforms.push('scale(-1 1) translate(-24 0)');
  if (flip === 'v') transforms.push('scale(1 -1) translate(0 -24)');

  const dashAttr = DASH_PATTERNS[pattern]
    ? ` stroke-dasharray="${DASH_PATTERNS[pattern]}"`
    : '';

  const filter =
    shadow > 0
      ? `<defs><filter id="mi-shd" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="${shadow / 6}" stdDeviation="${shadow / 8}" flood-color="#0F1116" flood-opacity="0.25"/></filter></defs>`
      : '';

  let rootFill = opts.fillMode === 'solid' ? opts.fillColor || color : 'none';
  // Fill-based artwork must have a fill to be visible at all.
  if (isFillBased && !keepNativeColors) rootFill = color;

  const fillOpacityAttr =
    opts.fillMode === 'solid' && typeof opts.fillOpacity === 'number'
      ? ` fill-opacity="${opts.fillOpacity}"`
      : '';

  const strokeInline =
    stroke === 0
      ? 'stroke="none"'
      : `stroke="${color}" stroke-width="${adjustedStroke}" stroke-linecap="${cap}" stroke-linejoin="${join}"`;

  if (!keepNativeColors && !hasComplexDefs) {
    cleanPaths = cleanPaths
      .replace(/stroke-width="[^"]*"/g, '')
      .replace(/stroke-linecap="[^"]*"/g, '')
      .replace(/stroke-linejoin="[^"]*"/g, '');

    cleanPaths = cleanPaths.replace(
      /<(path|circle|rect|polygon|polyline|line|ellipse)([^>]*)>/g,
      (_match, tag: string, attrs: string) => {
        const fillMatch = attrs.match(/fill="([^"]*)"/);
        const isSelfClosing = attrs.trim().endsWith('/');
        const pureAttrs = attrs.replace(legacy ? /\/$/ : /\/\s*$/, '');

        let pathStroke = strokeInline;
        const strokeMatch = pureAttrs.match(/stroke="([^"]*)"/);
        if (strokeMatch) {
          const value = strokeMatch[1].toLowerCase();
          if (value === 'none') {
            pathStroke = 'stroke="none"';
          } else if (value === '#fff' || value === '#ffffff' || value === 'white') {
            // White is a knockout, not ink — it stays white.
            pathStroke = strokeInline.replace(/stroke="[^"]+"/, 'stroke="#ffffff"');
          }
          // A black stroke IS ink, so strokeInline (already the chosen colour)
          // stays in place for it.
        } else if (!isFillBased) {
          pathStroke =
            fillMatch && fillMatch[1].toLowerCase() !== 'none'
              ? 'stroke="none"'
              : strokeInline;
        }

        let pathFill = rootFill;
        if (opts.fillMode === 'solid') {
          pathFill = rootFill;
        } else if (fillMatch) {
          const value = fillMatch[1].toLowerCase();
          if (value === 'none') {
            pathFill = 'none';
          } else if (value === '#fff' || value === '#ffffff' || value === 'white') {
            // A hole punched through the artwork; recolouring it would fill it in.
            pathFill = '#ffffff';
          } else {
            pathFill = color;
          }
        }

        const cleanAttrs = pureAttrs
          .replace(/stroke="[^"]*"/g, '')
          .replace(/fill="[^"]*"/g, '');
        const endTag = isSelfClosing ? ' />' : '>';
        return `<${tag} ${cleanAttrs} fill="${pathFill}"${fillOpacityAttr} ${pathStroke}${dashAttr}${endTag}`;
      },
    );
  }

  // An inner <svg> maps the artwork's native viewBox into the 24×24 canvas.
  // width/height in percent so vector editors scale it correctly on paste.
  const innerSvg = `<svg viewBox="${viewBox}" width="24" height="24" x="0" y="0" preserveAspectRatio="xMidYMid meet" fill-rule="evenodd" clip-rule="evenodd">${cleanPaths}</svg>`;

  const iconAttrs = `opacity="${opacity}"${shadow > 0 ? ' filter="url(#mi-shd)"' : ''}${transforms.length ? ` transform="${transforms.join(' ')}"` : ''}${dashAttr}`;
  const group = `<g ${iconAttrs}>${innerSvg}</g>`;
  const colorAttr = opts.color ? ` color="${color}"` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"${colorAttr}>${filter}${background}${group}</svg>`;
}

/**
 * Per-style defaults — port of styleOpts().
 *
 * Note that "solid" does NOT force stroke to 0: line-based icons (menu, minus,
 * activity) would vanish. The fill covers closed shapes for a solid look while
 * the stroke keeps open paths visible. Colour styles pass through untouched;
 * renderSvg preserves their palette.
 */
function styleOptions(style: string): Partial<RenderOptions> {
  switch (style) {
    case 'solid':
    case 'duotone':
    case 'thin':
      return { cap: 'round', join: 'round' };
    default:
      return {};
  }
}

/**
 * Renders one library item at the current global settings — the port of
 * renderStyled().
 */
export function renderItem(
  item: LibraryItem,
  globals: { size: number; stroke: number; color: string },
  extra: RenderOptions = {},
): string {
  const color = globals.color !== 'currentColor' ? globals.color : undefined;
  return renderSvg(item.svg, {
    size: globals.size,
    stroke: globals.stroke,
    iconStyle: item.style,
    sourceId: item.source,
    viewBox: item.viewBox,
    ...styleOptions(item.style),
    ...(color ? { color } : {}),
    ...extra,
  });
}

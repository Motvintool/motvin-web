/**
 * SVG flattening — port of flattenSvg() and its helpers in
 * motvin-ui/JS/bulk-export.js.
 *
 * The renderer deliberately nests: an inner `<svg>` carrying the artwork's
 * native viewBox, inside a `<g>` for transforms, inside the outer 24×24
 * canvas. That structure is right for the browser but wrong for a design tool,
 * which imports each nested `<svg>` as its own frame. Everything the editor
 * hands out — Copy SVG, the code preview, downloads, bulk export — is flattened
 * to a single `<svg>` first.
 *
 * Two collapses, applied repeatedly until neither applies:
 *  - a lone `<g>` whose only attribute is opacity="1" contributes nothing
 *  - a lone inner `<svg>` that exactly fills its parent's viewBox can be
 *    unwrapped, hoisting its viewBox onto the parent
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Attributes describing the inner viewport, which must not be copied up. */
const VIEWPORT_ATTRIBUTES = ['x', 'y', 'width', 'height', 'viewBox', 'preserveAspectRatio'];

function parseSvg(markup: string): SVGElement | null {
  if (typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return null;
  const root = doc.documentElement;
  return root && root.localName === 'svg' ? (root as unknown as SVGElement) : null;
}

function onlyElementChild(node: Element): Element | null {
  return node.children.length === 1 ? node.children[0] : null;
}

function unwrap(node: Element, child: Element) {
  while (child.firstChild) node.insertBefore(child.firstChild, child);
  child.remove();
}

function viewBoxOf(node: Element): number[] | null {
  const raw = node.getAttribute('viewBox');
  if (!raw) return null;
  const parts = raw.trim().split(/[\s,]+/).map(Number);
  return parts.length === 4 && parts.every(Number.isFinite) ? parts : null;
}

/** A lone `<g opacity="1">` adds nothing; drop it. */
function dropInertGroups(node: Element) {
  let child = onlyElementChild(node);
  while (
    child &&
    child.localName === 'g' &&
    Array.from(child.attributes).every(
      (attribute) => attribute.name === 'opacity' && parseFloat(attribute.value) === 1,
    )
  ) {
    unwrap(node, child);
    child = onlyElementChild(node);
  }
}

/** True when the child's viewport exactly covers the parent's viewBox. */
function fillsParent(parent: Element, child: Element): boolean {
  const box = viewBoxOf(parent);
  if (!box) return false;
  const [minX, minY, boxWidth, boxHeight] = box;

  const span = (name: string, fallback: number) => {
    const value = child.getAttribute(name);
    if (value === null || value === '100%') return fallback;
    return parseFloat(value);
  };

  return (
    parseFloat(child.getAttribute('x') || '0') === minX &&
    parseFloat(child.getAttribute('y') || '0') === minY &&
    span('width', boxWidth) === boxWidth &&
    span('height', boxHeight) === boxHeight
  );
}

function flattenNode(node: Element): Element {
  dropInertGroups(node);
  let child = onlyElementChild(node);

  while (child && child.localName === 'svg' && fillsParent(node, child)) {
    for (const attribute of Array.from(child.attributes)) {
      if (VIEWPORT_ATTRIBUTES.includes(attribute.name)) continue;
      // Skip the default xmlns (we already set the SVG namespace), but KEEP
      // secondary namespace declarations (xmlns:sodipodi, xmlns:inkscape,
      // xmlns:xlink, etc.) — Inkscape-authored Bioicons carry sodipodi:*
      // and inkscape:* attributes throughout the tree, and dropping the
      // namespace declaration turns the whole document into an XML parse
      // error, which makes design tools silently skip the item.
      if (attribute.name === 'xmlns') continue;
      node.setAttribute(attribute.name, attribute.value);
    }

    // The inner viewBox is the one that maps the artwork, so it wins.
    const viewBox = child.getAttribute('viewBox');
    if (viewBox) node.setAttribute('viewBox', viewBox);

    // Only overwrite preserveAspectRatio if the child sets one — otherwise
    // keep whatever the outer already had. Previously we stripped it when the
    // innermost <svg> lacked it (e.g. Bioicons whose Inkscape-authored root
    // has no preserveAspectRatio), which left the merged bulk-copy sheet
    // without any aspect handling and caused items to overflow their cells
    // in design-tool pastes.
    const ratio = child.getAttribute('preserveAspectRatio');
    if (ratio) node.setAttribute('preserveAspectRatio', ratio);

    unwrap(node, child);
    dropInertGroups(node);
    child = onlyElementChild(node);
  }

  return node;
}

/**
 * Reduce a fetched .svg file to its root element. Source files carry an XML
 * declaration, a DOCTYPE or editor comments ahead of `<svg>` — harmless in a
 * standalone file, invalid once the markup is embedded in another document.
 * Port of normalizeSvgFile() in motvin-ui/JS/bulk-export.js:159.
 */
export function normalizeSvgFile(markup: string): string {
  const text = String(markup ?? '');
  const start = text.search(/<svg[\s>]/i);
  const end = text.lastIndexOf('</svg>');
  return start === -1 || end === -1 ? '' : text.slice(start, end + 6);
}

export function flattenSvg(markup: string): string {
  const node = parseSvg(markup || '');
  // No DOMParser (server render) or unparseable markup: hand back the original
  // rather than losing it.
  if (!node) return markup;
  flattenNode(node);
  node.setAttribute('xmlns', SVG_NS);
  return new XMLSerializer().serializeToString(node);
}

// ---------------------------------------------------------------------------
// Multi-select combine — port of combineSvgs() in
// motvin-ui/JS/bulk-export.js:185.
// ---------------------------------------------------------------------------

const COMBINE_GAP = 8;

function measure(node: Element): { width: number; height: number } {
  const box = viewBoxOf(node);
  const read = (name: string, fallback: number) => {
    const value = parseFloat(node.getAttribute(name) ?? '');
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return {
    width: read('width', box ? box[2] : 24),
    height: read('height', box ? box[3] : 24),
  };
}

function safeId(name: string): string {
  return (
    String(name || 'item')
      .trim()
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'item'
  );
}

/**
 * Illustrations often ship gradients, filters, clipPaths, symbols and masks
 * with generic `id="a"` / `id="gradient1"` names. Concatenating two into one
 * document makes those ids collide — the second illustration's `url(#a)` /
 * `href="#a"` references land on the first's node, so it renders wrong or not
 * at all. Rewrite every id in the subtree with a per-item prefix and update
 * every reference that points at one of them.
 */
function namespaceIds(root: Element, prefix: string): void {
  const owned = new Set<string>();
  root.querySelectorAll('[id]').forEach((el) => {
    const id = el.getAttribute('id');
    if (!id) return;
    owned.add(id);
    el.setAttribute('id', `${prefix}${id}`);
  });
  if (owned.size === 0) return;

  const REF_ATTRS = [
    'href',
    'xlink:href',
    'fill',
    'stroke',
    'clip-path',
    'mask',
    'filter',
    'marker-start',
    'marker-mid',
    'marker-end',
  ];
  const nodes: Element[] = [root, ...Array.from(root.querySelectorAll('*'))];
  for (const node of nodes) {
    for (const attr of REF_ATTRS) {
      const value = node.getAttribute(attr);
      if (!value) continue;
      // `#id` for href/xlink:href, `url(#id)` for everything else — cover both.
      const rewritten = value.replace(
        /(?:url\(#([^)]+)\)|^#([^\s)]+))/g,
        (_match, urlId?: string, hashId?: string) => {
          const id = urlId ?? hashId;
          if (id && owned.has(id)) {
            return urlId ? `url(#${prefix}${id})` : `#${prefix}${id}`;
          }
          return _match;
        },
      );
      if (rewritten !== value) node.setAttribute(attr, rewritten);
    }
    // Inline `style="fill:url(#a)"` too.
    const style = node.getAttribute('style');
    if (style) {
      const rewritten = style.replace(/url\(#([^)]+)\)/g, (match, id: string) =>
        owned.has(id) ? `url(#${prefix}${id})` : match,
      );
      if (rewritten !== style) node.setAttribute('style', rewritten);
    }
  }
}

/**
 * Merge multiple rendered SVGs into ONE valid document laid out on a square
 * grid. Copying N `<svg>` roots joined by newlines is not an SVG document —
 * Figma / Illustrator / a saved .svg keep the first root and drop the rest.
 * This produces a single `<svg>` with each item as an `<svg id="name">` child
 * positioned into its own cell.
 */
export function combineSvgs(items: Array<{ name: string; svg: string }>): string {
  if (typeof document === 'undefined') {
    return items.map((item) => item?.svg ?? '').join('\n\n');
  }

  const nodes = items
    .map((item) => {
      const node = parseSvg(item?.svg ?? '');
      return node ? { name: item.name, node: flattenNode(node) } : null;
    })
    .filter((entry): entry is { name: string; node: Element } => !!entry);

  if (nodes.length === 0) return items.map((item) => item?.svg ?? '').join('\n\n');
  if (nodes.length === 1) {
    nodes[0].node.setAttribute('xmlns', SVG_NS);
    return new XMLSerializer().serializeToString(nodes[0].node);
  }

  const sizes = nodes.map((entry) => measure(entry.node));
  const cell = Math.max(...sizes.map((size) => Math.max(size.width, size.height)));
  const columns = Math.ceil(Math.sqrt(nodes.length));
  const rows = Math.ceil(nodes.length / columns);
  const width = columns * cell + (columns - 1) * COMBINE_GAP;
  const height = rows * cell + (rows - 1) * COMBINE_GAP;

  const sheet = document.createElementNS(SVG_NS, 'svg');
  sheet.setAttribute('xmlns', SVG_NS);
  sheet.setAttribute('width', String(width));
  sheet.setAttribute('height', String(height));
  sheet.setAttribute('viewBox', `0 0 ${width} ${height}`);

  nodes.forEach((entry, index) => {
    const size = sizes[index];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const clone = document.importNode(entry.node, true) as Element;
    // Rewrite ids and url(#…)/href="#…" references to prevent collisions
    // between illustrations that share generic ids in their <defs>.
    namespaceIds(clone, `${safeId(entry.name)}__`);
    // The id is what a design tool uses to name the pasted layer.
    clone.setAttribute('id', safeId(entry.name));
    clone.setAttribute(
      'x',
      String(column * (cell + COMBINE_GAP) + (cell - size.width) / 2),
    );
    clone.setAttribute(
      'y',
      String(row * (cell + COMBINE_GAP) + (cell - size.height) / 2),
    );
    clone.removeAttribute('xmlns');
    sheet.append(document.createTextNode('\n'), clone);
  });
  sheet.append(document.createTextNode('\n'));

  return new XMLSerializer().serializeToString(sheet);
}

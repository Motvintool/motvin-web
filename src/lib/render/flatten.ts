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
      if (attribute.name === 'xmlns' || attribute.name.startsWith('xmlns:')) continue;
      node.setAttribute(attribute.name, attribute.value);
    }

    // The inner viewBox is the one that maps the artwork, so it wins.
    const viewBox = child.getAttribute('viewBox');
    if (viewBox) node.setAttribute('viewBox', viewBox);

    const ratio = child.getAttribute('preserveAspectRatio');
    if (ratio) node.setAttribute('preserveAspectRatio', ratio);
    else node.removeAttribute('preserveAspectRatio');

    unwrap(node, child);
    dropInertGroups(node);
    child = onlyElementChild(node);
  }

  return node;
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

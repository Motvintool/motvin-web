/**
 * What the person did between two screens.
 *
 * A flow library shows the screens; a flow shows the moves between them. The
 * recording has both. Every step from one settled screen to the next is one
 * action, and most of them can be read off the frames and the text:
 *
 *   tap         a control on the first screen was pressed. The press itself
 *               shows in the frame right after the hold — a small region
 *               changes (highlight, ripple, the control redrawing) before the
 *               screen goes — and the text under that region is the label. When
 *               no press shows, the label is whichever text on the first screen
 *               names what the second screen became: the tab, the chip, the
 *               row that opened.
 *   type        the keyboard was open and the field's text changed, or the
 *               next screen is the result of a query it shows.
 *   switch-tab  a different tab of the same tab bar is now selected.
 *   scroll      the same screen, moved.
 *   back        a screen seen earlier is on screen again.
 *   dismiss     a sheet, dialog or toast went away and its base is back.
 *   wait        a loading state resolved.
 *   open        nothing above fits: a new screen appeared.
 *
 * The result is honest about its evidence: `basis` says whether the label was
 * read off a press, matched by text, or is the destination's own name.
 */

/** How close (in normalised units) a text line must sit to the press to be its label. */
const PRESS_MARGIN = 0.02;

const GENERIC_LABELS = /^(skip|back|cancel|done|close|ok|got it|allow|don'?t allow|not now|continue|next|<|›|x|\d+)$/i;

/**
 * @typedef {object} Action
 * @property {'tap'|'type'|'switch-tab'|'scroll'|'back'|'dismiss'|'wait'|'open'} kind
 * @property {string|null} label   what was tapped, typed or opened
 * @property {'press'|'match'|'destination'|'structure'} basis
 * @property {{x: number, y: number, w: number, h: number}|null} region where on the first screen, when known
 */

/**
 * @param {object} from  graph node the step left
 * @param {object} to    graph node the step arrived on
 * @param {object} edge  the segmenter's edge: { pressBox, revisit, dismissed, scrolled }
 * @returns {Action}
 */
export function describeAction(from, to, edge = {}) {
  const fromA = from?.analysis ?? {};
  const toA = to?.analysis ?? {};
  const fromLines = from?.analysis?.lines ?? [];
  const toLines = to?.analysis?.lines ?? [];

  if (edge.dismissed || (from?.capture?.overlayOf && to && from.capture.overlayOf === to.timelineId)) {
    return { kind: 'dismiss', label: fromA.name ?? null, basis: 'structure', region: null };
  }
  if (edge.scrolled || to?.capture?.scrolledFrom === from?.timelineId) {
    return { kind: 'scroll', label: null, basis: 'structure', region: null };
  }
  if (fromA.screenType === 'loading' || from?.capture?.kind === 'loading') {
    return { kind: 'wait', label: from?.capture?.holdSeconds ? `${from.capture.holdSeconds}s` : null, basis: 'structure', region: null };
  }

  const fromTabs = fromA.signals?.tabLabels ?? [];
  const toTabs = toA.signals?.tabLabels ?? [];
  const fromSection = fromTabs[0] ?? null;
  const toSection = toTabs[0] ?? null;

  // A query the destination shows is the strongest evidence of typing.
  const typed = typedQuery(toLines, fromLines);
  if (typed && (toA.screenType === 'search_results' || toA.signals?.keyboard || fromA.signals?.keyboard)) {
    return { kind: 'type', label: typed, basis: 'match', region: null };
  }

  // The press, when the frames caught it.
  const pressed = edge.pressBox ? labelNear(fromLines, edge.pressBox) : null;
  if (pressed && !GENERIC_LABELS.test(pressed.text)) {
    const kind =
      fromTabs.length >= 3 && toTabs.length >= 3 && toSection && toSection !== fromSection && fromTabs.some((t) => t.toLowerCase() === toSection.toLowerCase())
        ? 'switch-tab'
        : 'tap';
    return { kind, label: pressed.text, basis: 'press', region: pressed.region };
  }

  // A tab bar with a different first tab is a tab switch even without a press.
  if (fromTabs.length >= 3 && toTabs.length >= 3 && toSection && fromSection && toSection.toLowerCase() !== fromSection.toLowerCase()) {
    const label = fromTabs.find((t) => t.toLowerCase() === toSection.toLowerCase()) ?? toSection;
    return { kind: 'switch-tab', label, basis: 'match', region: null };
  }

  if (edge.revisit) {
    return { kind: 'back', label: toA.name ?? null, basis: 'structure', region: null };
  }

  // The text on the first screen that names what the second became: a chip,
  // a row, a card title now shown as the destination's title or headline.
  const matched = labelMatching(fromLines, toA);
  if (matched) return { kind: 'tap', label: matched.text, basis: 'match', region: matched.region };

  if (pressed) return { kind: 'tap', label: pressed.text, basis: 'press', region: pressed.region };

  return { kind: 'open', label: toA.signals?.title ?? toA.name ?? null, basis: 'destination', region: null };
}

/** The text line on the screen closest to where the press showed. */
function labelNear(lines, box) {
  let best = null;
  let bestScore = Infinity;
  for (const line of lines) {
    const text = String(line.text || '').trim();
    if (text.length < 2 || text.length > 32 || !/[a-z]/i.test(text)) continue;
    const cx = line.x + line.w / 2;
    const cy = line.y + line.h / 2;
    const inside =
      cx >= box.x - PRESS_MARGIN && cx <= box.x + box.w + PRESS_MARGIN && cy >= box.y - PRESS_MARGIN && cy <= box.y + box.h + PRESS_MARGIN;
    if (!inside) continue;
    // Nearest to the centre of the press wins; a larger label breaks ties.
    const dx = cx - (box.x + box.w / 2);
    const dy = cy - (box.y + box.h / 2);
    const score = Math.sqrt(dx * dx + dy * dy) - line.h;
    if (score < bestScore) {
      bestScore = score;
      best = { text, region: { x: line.x, y: line.y, w: line.w, h: line.h } };
    }
  }
  return best;
}

/**
 * A line on the first screen whose words became the second screen's title,
 * headline or section — the thing that was opened.
 */
function labelMatching(fromLines, toAnalysis) {
  const targets = [toAnalysis.signals?.title, toAnalysis.signals?.headline, toAnalysis.signals?.tabLabels?.[0], toAnalysis.name]
    .filter(Boolean)
    .map((t) => normalise(t));
  if (!targets.length) return null;
  for (const line of fromLines) {
    const text = String(line.text || '').trim();
    if (text.length < 3 || text.length > 32 || GENERIC_LABELS.test(text)) continue;
    // Chrome that is on every screen cannot be what was tapped.
    if (line.y < 0.045 || line.y > 0.9) continue;
    const norm = normalise(text);
    if (targets.some((target) => target === norm || (norm.length >= 4 && target.startsWith(norm)))) {
      return { text, region: { x: line.x, y: line.y, w: line.w, h: line.h } };
    }
  }
  return null;
}

/**
 * Text the destination shows as a query: quoted after "search for", or the
 * only new text sitting in a search field. Returns the query or null.
 */
function typedQuery(toLines, fromLines) {
  const fromText = new Set(fromLines.map((line) => normalise(line.text)));
  for (const line of toLines) {
    const text = String(line.text || '').trim();
    const quoted = text.match(/^(?:search(?:ing)? (?:for|results for)|results for)\s*[“"']?([^”"']{2,40})[”"']?$/i);
    if (quoted && !/^(dishes|restaurants|items|products|places|anything)$/i.test(quoted[1])) return quoted[1].trim();
  }
  // A field near the top with text that was not on the previous screen and is
  // not a placeholder.
  for (const line of toLines) {
    if (line.y > 0.3 || line.y < 0.045) continue;
    const text = String(line.text || '').trim();
    if (text.length < 2 || text.length > 40) continue;
    if (/^search\b|\bsearch for\b|^enter\b|^type\b/i.test(text)) continue;
    if (fromText.has(normalise(text))) continue;
    if (!/^[a-z0-9][a-z0-9 '&-]*$/i.test(text)) continue;
    // Only when a keyboard is up on this screen does an unfamiliar short line
    // near the top read as a query.
    if (toLines.some((l) => l.y > 0.55 && /^[a-z]$/i.test(String(l.text || '').trim()))) return text;
  }
  return null;
}

function normalise(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** A short phrase for a step's action, for logs and the gallery's connectors. */
export function actionPhrase(action) {
  if (!action) return '';
  switch (action.kind) {
    case 'tap':
      return action.label ? `Tap “${action.label}”` : 'Tap';
    case 'type':
      return action.label ? `Type “${action.label}”` : 'Type';
    case 'switch-tab':
      return action.label ? `Switch to ${action.label}` : 'Switch tab';
    case 'scroll':
      return 'Scroll';
    case 'back':
      return action.label ? `Back to ${action.label}` : 'Back';
    case 'dismiss':
      return 'Dismiss';
    case 'wait':
      return action.label ? `Wait ${action.label}` : 'Wait';
    default:
      return action.label ? `Open ${action.label}` : 'Open';
  }
}

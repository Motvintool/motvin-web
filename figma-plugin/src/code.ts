import { PART_HEIGHT, barPixels, DEFAULT_PREFS, PANEL, PLATFORM_LABEL, type CanvasSelection, type ResizeEdge, type Flow, type Placement, type Platform, type PlacedScreen, type Step, type ToMain, type ToUi } from './shared';

/**
 * The plugin's main code: runs in Figma's sandbox, where it can touch the
 * document but not the network. The panel (src/ui) searches Motvin and
 * downloads images; this side keeps the sign-in on the person's computer and
 * turns downloaded screens into frames on the canvas.
 */

/** Image parts are at most this tall, so Figma keeps them sharp (see figma-image.service.ts in motvin-backend). */
const SESSION_KEY = 'motvin.session';
const PREFS_KEY = 'motvin.prefs';
const SIZE_KEY = 'motvin.size';
const FONT = 'Inter';
const INK = { r: 0.067, g: 0.067, b: 0.067 };
const MUTED = { r: 0.42, g: 0.42, b: 0.44 };
const LINK = { r: 0, g: 0.56, b: 0.94 };
const BOARD = { r: 0.957, g: 0.957, b: 0.965 };
/** The details line under a board's title: darker than MUTED, so it reads on the light board. */
const DETAIL = { r: 0.3, g: 0.3, b: 0.32 };

figma.showUI(__html__, { width: PANEL.width, height: PANEL.height, themeColors: true, title: 'Motvin — Inspiration' });

const clamp = (value: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, value)));
let size = { width: PANEL.width, height: PANEL.height };
const resize = (width: number, height: number) => {
  size = { width: clamp(width, PANEL.minWidth, PANEL.maxWidth), height: clamp(height, PANEL.minHeight, PANEL.maxHeight) };
  figma.ui.resize(size.width, size.height);
};

// The size the person last dragged the panel to, kept on their computer.
figma.clientStorage.getAsync(SIZE_KEY).then((saved: { width: number; height: number } | undefined) => {
  if (saved) resize(saved.width, saved.height);
});

/** Where a resize drag began: the panel's size and its position on the canvas. */
let dragFrom: { width: number; height: number; x: number; y: number } | null = null;

/**
 * Resizes from any edge or corner. Dragging the right or bottom only changes the size; dragging the left or top
 * also moves the window by what it gained or lost (in canvas units, so divided by the zoom), keeping the far side put.
 */
function resizeFrom(edge: ResizeEdge, dx: number, dy: number) {
  if (!dragFrom) return;
  const width = edge.includes('e') ? dragFrom.width + dx : edge.includes('w') ? dragFrom.width - dx : dragFrom.width;
  const height = edge.includes('s') ? dragFrom.height + dy : edge.includes('n') ? dragFrom.height - dy : dragFrom.height;
  resize(width, height);
  if (edge.includes('w') || edge.includes('n')) {
    const zoom = figma.viewport.zoom || 1;
    const x = edge.includes('w') ? dragFrom.x + (dragFrom.width - size.width) / zoom : dragFrom.x;
    const y = edge.includes('n') ? dragFrom.y + (dragFrom.height - size.height) / zoom : dragFrom.y;
    figma.ui.reposition(x, y);
  }
}

const post = (message: ToUi) => figma.ui.postMessage(message);

figma.ui.onmessage = async (message: ToMain) => {
  switch (message.type) {
    case 'load-session':
      post({
        type: 'session',
        session: (await figma.clientStorage.getAsync(SESSION_KEY)) ?? null,
        prefs: { ...DEFAULT_PREFS, ...((await figma.clientStorage.getAsync(PREFS_KEY)) ?? {}) },
      });
      return;
    case 'save-prefs':
      await figma.clientStorage.setAsync(PREFS_KEY, message.prefs);
      return;
    case 'save-session':
      if (message.session) await figma.clientStorage.setAsync(SESSION_KEY, message.session);
      else await figma.clientStorage.deleteAsync(SESSION_KEY);
      return;
    case 'open-url':
      figma.openExternal(message.url);
      return;
    case 'notify':
      figma.notify(message.message, { error: message.error });
      return;
    case 'place-screens':
      await placing(() => message.screens.map((placed) => (message.captions ? screenBoard(placed) : screenFrame(placed))), message.placement, message.layout === 'free' ? 'free' : (message.screens[0]?.screen.platform ?? 'ios'));
      return;
    case 'place-flow':
      await placing(() => [flowBoard(message.flow, message.steps, message.captions)], message.placement, message.layout === 'free' ? 'free' : `${message.flow.platform}-flows`);
      return;
    case 'resize-start': {
      const { canvasSpace } = figma.ui.getPosition();
      dragFrom = { ...size, x: canvasSpace.x, y: canvasSpace.y };
      return;
    }
    case 'resize':
      resizeFrom(message.edge, message.dx, message.dy);
      if (message.save) {
        dragFrom = null;
        await figma.clientStorage.setAsync(SIZE_KEY, size);
      }
      return;
    case 'reset-size':
      resize(PANEL.width, PANEL.height);
      await figma.clientStorage.deleteAsync(SIZE_KEY);
      return;
    case 'read-selection':
      post({ type: 'selection', selection: readSelection() });
      return;
  }
};

/**
 * For "Match selection": the selected layers' names, the first bits of text inside them and their width.
 * Only read when the person asks, and only sent to the panel; nothing about the file leaves Figma.
 */
function readSelection(): CanvasSelection | null {
  const selected = figma.currentPage.selection;
  if (!selected.length) return null;
  const texts: string[] = [];
  for (const node of selected) {
    if (texts.length >= 40) break;
    const found = node.type === 'TEXT' ? [node] : 'findAllWithCriteria' in node ? node.findAllWithCriteria({ types: ['TEXT'] }) : [];
    for (const text of found.slice(0, 40 - texts.length)) texts.push(text.characters.slice(0, 80));
  }
  return { names: selected.map((node) => node.name), texts, width: Math.max(...selected.map((node) => ('width' in node ? node.width : 0))) };
}

/** Builds nodes, puts them in view and selects them; any failure is reported instead of half-placed. */
/**
 * One placement at a time. Adds clicked in quick succession used to run side by side: each read the same row, so
 * they landed on the same spot and slid apart, leaving gaps and rows of the wrong length.
 */
let queue: Promise<void> = Promise.resolve();
function placing(build: () => SceneNode[], placement: Placement, platform: Group): Promise<void> {
  queue = queue.then(() => placeNow(build, placement, platform));
  return queue;
}

async function placeNow(build: () => SceneNode[], placement: Placement, platform: Group) {
  try {
    await loadFonts();
    // Read before the new nodes take over the selection.
    const beside = placement === 'selection' ? selectionBounds() : null;
    const nodes = build();
    if (beside) await place(nodes, beside, platform);
    else {
      // A batch bigger than what is left in the row is split: it fills the row, then carries on in new rows.
      for (let index = 0; index < nodes.length; ) {
        const saved = readRow(platform);
        // A row whose last item was deleted starts over, so it counts as empty.
        const row = saved && (await figma.getNodeByIdAsync(saved.last)) ? saved : null;
        const room = row ? perRow(platform) - row.count : perRow(platform);
        const take = room > 0 ? room : perRow(platform);
        await place(nodes.slice(index, index + take), null, platform);
        index += take;
      }
    }
    figma.currentPage.selection = nodes;
    showIfHidden(nodes);
    post({ type: 'placed', count: nodes.length });
  } catch (error) {
    post({ type: 'place-failed', message: (error as Error).message || 'Could not place the screens.' });
  }
}

let fontsLoaded = false;
async function loadFonts() {
  if (fontsLoaded) return;
  await Promise.all(['Regular', 'Medium', 'Semi Bold'].map((style) => figma.loadFontAsync({ family: FONT, style })));
  fontsLoaded = true;
}

// ───────────────────────────────────────────────────────── building blocks

/** Captions grow with the screen: 14px beside a 390pt phone, three times that beside a 1440pt desktop. */
function textScale(frameWidth: number): number {
  return Math.min(3, Math.max(1, frameWidth / 390));
}

function label(characters: string, size: number, style: 'Regular' | 'Medium' | 'Semi Bold', color: RGB): TextNode {
  const node = figma.createText();
  node.fontName = { family: FONT, style };
  node.fontSize = size;
  node.characters = characters;
  node.fills = [{ type: 'SOLID', color }];
  return node;
}

/**
 * Adds a text that wraps at its auto-layout parent's width instead of running
 * past it. Stretching is only allowed once the text is inside the parent.
 */
function addWrapped(parent: FrameNode, node: TextNode): TextNode {
  parent.appendChild(node);
  node.layoutAlign = 'STRETCH';
  node.textAutoResize = 'HEIGHT';
  return node;
}

function link(characters: string, url: string, size: number, style: 'Medium' | 'Semi Bold' = 'Medium'): TextNode {
  const node = label(characters, size, style, LINK);
  node.hyperlink = { type: 'URL', value: url };
  return node;
}

/**
 * "View on Motvin ↗" as a ghost button: the blue link inside a thin outline in the same blue, rounded, no fill. The text keeps
 * the link, so it still opens Motvin from Figma's prototype and dev mode.
 */
function ghostLink(characters: string, url: string, size: number): FrameNode {
  const button = stack('HORIZONTAL', 0);
  button.name = characters;
  button.paddingTop = button.paddingBottom = Math.round(size * 0.55);
  button.paddingLeft = button.paddingRight = Math.round(size * 1.1);
  button.cornerRadius = size * 2;
  button.strokes = [{ type: 'SOLID', color: LINK }];
  button.strokeWeight = Math.max(1, size / 14);
  button.appendChild(link(characters, url, size, 'Semi Bold'));
  return button;
}

/** A bit of extra room in a vertical stack, above the button. */
function spacer(height: number): FrameNode {
  const gap = figma.createFrame();
  gap.name = 'Space';
  gap.resize(1, Math.max(1, height));
  gap.fills = [];
  return gap;
}

function stack(direction: 'VERTICAL' | 'HORIZONTAL', spacing: number): FrameNode {
  const frame = figma.createFrame();
  frame.layoutMode = direction;
  frame.itemSpacing = spacing;
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.fills = [];
  frame.clipsContent = false;
  return frame;
}

function frameName(placed: PlacedScreen): string {
  const { screen } = placed;
  return `${screen.app.name} · ${screen.screen_type} · ${PLATFORM_LABEL[screen.platform]}`;
}

/**
 * The screen itself: its image parts stacked top to bottom, at the size it has on the device. The panel printed the
 * watermark bar into the images (ui/watermark.ts): into the last part when it fit, else as one extra part.
 */
function screenFrame(placed: PlacedScreen): FrameNode {
  const { screen, parts } = placed;
  const size = screen.image.frame;
  const scale = size.width / screen.image.width;
  const bar = barPixels(screen.image.width, screen.image.height);
  const printed = parts.length >= screen.image.parts;
  const extra = parts.length > screen.image.parts;
  const lastOriginal = screen.image.height - (screen.image.parts - 1) * PART_HEIGHT;
  const totalHeight = size.height + (printed ? bar * scale : 0);

  const frame = figma.createFrame();
  frame.name = frameName(placed);
  frame.resize(size.width, totalHeight);
  frame.clipsContent = true;
  frame.fills = [];

  let top = 0;
  parts.forEach((bytes, index) => {
    const pixels = index < screen.image.parts - 1 ? PART_HEIGHT : index === screen.image.parts - 1 ? lastOriginal + (printed && !extra ? bar : 0) : bar;
    // The last part takes what is left, so rounding never leaves a gap at the bottom.
    const height = index === parts.length - 1 ? totalHeight - top : pixels * scale;
    const rect = figma.createRectangle();
    rect.name = parts.length > 1 ? `Part ${index + 1} of ${parts.length}` : 'Screenshot';
    rect.resize(size.width, Math.max(1, height));
    rect.y = top;
    rect.fills = [{ type: 'IMAGE', imageHash: figma.createImage(bytes).hash, scaleMode: 'FILL' }];
    frame.appendChild(rect);
    top += height;
  });

  // Which Motvin screen this is, for "more like this" later.
  frame.setPluginData('motvin', JSON.stringify({ id: screen.id, platform: screen.platform }));
  return frame;
}

/** A screen with its caption: app and name, what it is, and a link back to Motvin. Without captions, only the heading (a flow's step number). */
function screenCard(placed: PlacedScreen, heading?: string, captions = true): FrameNode {
  const { screen } = placed;
  const scale = textScale(screen.image.frame.width);
  const card = stack('VERTICAL', 12 * scale);
  card.name = frameName(placed);

  if (heading) card.appendChild(label(heading, 15 * scale, 'Medium', MUTED));
  card.appendChild(screenFrame(placed));
  if (!captions) return card;
  addWrapped(card, label(`${screen.app.name} — ${screen.name}`, 17 * scale, 'Semi Bold', INK));
  const about = [screen.screen_type, PLATFORM_LABEL[screen.platform], screen.image.full ? null : 'Preview size (view-only licence)'].filter(Boolean).join(' · ');
  addWrapped(card, label(about, 14 * scale, 'Regular', MUTED));
  card.appendChild(link('View on Motvin ↗', screen.page_url, 14 * scale));
  return card;
}

/**
 * One screen on its own board, laid out like a flow's: the title, what it is and a link on top, then the screen.
 * The board is light, so the text stays readable on Figma's dark canvas (a bare caption under the screen did not).
 */
function screenBoard(placed: PlacedScreen): FrameNode {
  const { screen } = placed;
  const scale = textScale(screen.image.frame.width);

  const board = stack('VERTICAL', 32 * scale);
  board.name = frameName(placed);
  board.fills = [{ type: 'SOLID', color: BOARD }];
  board.cornerRadius = 24 * scale;
  board.paddingTop = 48 * scale;
  board.paddingBottom = board.paddingLeft = board.paddingRight = 32 * scale;

  const header = stack('VERTICAL', 8 * scale);
  header.name = 'Title';
  header.appendChild(label(`${screen.app.name} — ${screen.name}`, 28 * scale, 'Semi Bold', INK));
  const about = [PLATFORM_LABEL[screen.platform], screen.screen_type, screen.image.full ? null : 'Preview size (view-only licence)'].filter(Boolean).join(' · ');
  header.appendChild(label(about, 17 * scale, 'Medium', DETAIL));
  header.appendChild(spacer(4 * scale));
  header.appendChild(ghostLink('View on Motvin ↗', screen.page_url, 15 * scale));
  board.appendChild(header);
  board.appendChild(screenFrame(placed));
  // A long title wraps at the screen's width instead of widening the board.
  header.layoutAlign = 'STRETCH';
  header.children.forEach((child) => {
    if (child.type === 'TEXT') {
      child.layoutAlign = 'STRETCH';
      child.textAutoResize = 'HEIGHT';
    }
  });
  return board;
}

/** "Tap “Continue”", from the action recorded between two steps. */
function actionText(action: Step['action']): string {
  if (!action) return '';
  const kind = action.kind.charAt(0).toUpperCase() + action.kind.slice(1).replace(/[-_]/g, ' ');
  return action.label ? `${kind} “${action.label}”` : kind;
}

/** A whole flow on one board: its title, then every step in order with the action between steps. */
function flowBoard(flow: Flow, steps: { step: Step; parts: Uint8Array[] }[], captions: boolean): FrameNode {
  const first = steps[0]?.step;
  const scale = first ? textScale(first.image.frame.width) : 1;

  const board = stack('VERTICAL', 32 * scale);
  board.name = `Flow · ${flow.app.name} — ${flow.name} · ${PLATFORM_LABEL[flow.platform]}`;
  board.fills = [{ type: 'SOLID', color: BOARD }];
  board.cornerRadius = 24 * scale;
  board.paddingTop = 48 * scale;
  board.paddingBottom = board.paddingLeft = board.paddingRight = 32 * scale;
  board.setPluginData('motvin', JSON.stringify({ flow: flow.id, platform: flow.platform }));

  const header = stack('VERTICAL', 8 * scale);
  header.name = 'Title';
  header.appendChild(label(`${flow.app.name} — ${flow.name}`, 28 * scale, 'Semi Bold', INK));
  header.appendChild(label(`${PLATFORM_LABEL[flow.platform]} · ${flow.category} · ${steps.length === 1 ? '1 step' : `${steps.length} steps`}`, 17 * scale, 'Medium', DETAIL));
  header.appendChild(spacer(4 * scale));
  header.appendChild(ghostLink('View on Motvin ↗', flow.page_url, 15 * scale));
  board.appendChild(header);

  const row = stack('HORIZONTAL', 0);
  row.name = 'Steps';
  steps.forEach(({ step, parts }, index) => {
    const card = screenCard({ screen: step, parts }, `Step ${step.position}`, captions);
    if (index > 0) {
      const between = stack('VERTICAL', 8 * scale);
      between.name = 'Next';
      between.counterAxisAlignItems = 'CENTER';
      between.primaryAxisAlignItems = 'CENTER';
      between.primaryAxisSizingMode = 'FIXED';
      between.counterAxisSizingMode = 'FIXED';
      const screenNode = card.children.find((child) => child.type === 'FRAME') as FrameNode;
      // Level with the screens, not with the captions under them.
      between.paddingTop = screenNode.y;
      between.resize(120 * scale, screenNode.y + screenNode.height);
      between.appendChild(label('→', 32 * scale, 'Regular', MUTED));
      const action = actionText(step.action);
      if (action) {
        addWrapped(between, label(action, 12 * scale, 'Medium', INK)).textAlignHorizontal = 'CENTER';
      }
      row.appendChild(between);
    }
    row.appendChild(card);
  });
  board.appendChild(row);
  return board;
}

// ──────────────────────────────────────────────────────────────── placing

/** The canvas area the current selection covers, or null when nothing is selected. */
function selectionBounds(): Rect | null {
  const boxes = figma.currentPage.selection.map((node) => node.absoluteBoundingBox).filter((box): box is Rect => Boolean(box));
  if (!boxes.length) return null;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Side by side, then selected and in view: to the right of `beside` (what was selected) when given,
 * else centred where the person is looking.
 */
/** How many screens or flows go in one row before the next Add starts a new row under it. */
const PER_ROW = 6;

/**
 * Where placed things go: each platform's screens, and each platform's flows, in a section of their own
 * ("Motvin · iOS", "Motvin · iOS flows", …). Flows are wide boards, so they stack one per row.
 */
type Group = Platform | `${Platform}-flows` | 'free';
const perRow = (group: Group) => (group.endsWith('-flows') ? 1 : PER_ROW);
/** Freeform: everything loose on the canvas, one row after another, no sections. */
const isFree = (group: Group) => group === 'free';
const groupName = (group: Group) => {
  const platform = group.replace('-flows', '') as Platform;
  return `Motvin · ${PLATFORM_LABEL[platform]}${group.endsWith('-flows') ? ' flows' : ''}`;
};
/** Where the plugin's row of placed screens is, saved on the page so it carries on after the plugin is reopened. */
const ROW_KEY = 'motvin-row';
interface Row {
  /** The last node placed: the next one goes to its right. */
  last: string;
  /** The row's left edge and top, and how far down its tallest item reaches (a new row starts under that). */
  left: number;
  top: number;
  bottom: number;
  count: number;
  /** Every item in the row, so its real left edge and bottom are measured from the canvas, not from saved numbers. */
  ids?: string[];
}

const PLATFORMS: Group[] = ['ios', 'webapp', 'site', 'ios-flows', 'webapp-flows', 'site-flows'];

/** Each platform keeps its own row on the page, so iOS, Web Apps and Webs screens never mix in one row. */
function readRow(platform: Group): Row | null {
  try {
    return JSON.parse(figma.currentPage.getPluginData(`${ROW_KEY}:${platform}`)) as Row;
  } catch {
    return null;
  }
}

/** Room inside a platform's section around its screens; more on top, where Figma draws the section's title. */
const SECTION_PAD = { top: 120, side: 80 };

/** The section this page keeps for a platform's screens ("Motvin · iOS"), or null if it was deleted or never made. */
async function findSection(platform: Group): Promise<SectionNode | null> {
  const id = figma.currentPage.getPluginData(`motvin-section:${platform}`);
  const node = id ? await figma.getNodeByIdAsync(id) : null;
  return node && node.type === 'SECTION' && !node.removed && node.parent?.id === figma.currentPage.id ? node : null;
}

/** Row positions are kept relative to the platform's section, so they still line up after the section is moved. */
function toPage(row: Row, section: SectionNode | null): Row {
  return section ? { ...row, left: row.left + section.x, top: row.top + section.y, bottom: row.bottom + section.y } : row;
}

async function place(nodes: SceneNode[], beside: Rect | null, platform: Group) {
  const gap = 80;
  const width = nodes.reduce((sum, node) => sum + node.width, 0) + gap * (nodes.length - 1);
  const height = Math.max(...nodes.map((node) => node.height));
  const center = figma.viewport.center;

  const sections = new Map<Group, SectionNode | null>();
  if (!isFree(platform)) for (const each of PLATFORMS) sections.set(each, await findSection(each));
  const section = sections.get(platform) ?? null;
  const rowOf = (each: Group) => {
    const saved = readRow(each);
    return saved ? toPage(saved, sections.get(each) ?? null) : null;
  };
  // Another platform's group, as the page shows it: its section when there is one, else its row of screens.
  const groupBottom = (each: Group) => {
    const box = sections.get(each)?.absoluteBoundingBox;
    const saved = rowOf(each);
    return box ? box.y + box.height : saved ? saved.bottom + SECTION_PAD.side : null;
  };
  const groupLeft = (each: Group) => sections.get(each)?.absoluteBoundingBox?.x ?? rowOf(each)?.left ?? null;

  // Carry on the row from last time while its last item is still on this page: to its right, tops on one line,
  // or under the row once it holds PER_ROW. Beside a selection, or with no row yet, a new row starts there.
  const row = beside ? null : rowOf(platform);
  const last = row ? await figma.getNodeByIdAsync(row.last) : null;
  const onPage = last && !last.removed && (last.parent?.id === figma.currentPage.id || (section !== null && last.parent?.id === section.id));
  const lastBox = onPage && 'absoluteBoundingBox' in last! ? (last as SceneNode).absoluteBoundingBox : null;
  // The gap between two platforms' groups: past the other's padding, then this one's title space.
  const between = SECTION_PAD.side + SECTION_PAD.top;

  let next: Row;
  let start: { x: number; y: number };
  if (row && lastBox && row.count + nodes.length <= perRow(platform)) {
    start = { x: Math.ceil(lastBox.x + lastBox.width + gap), y: Math.round(lastBox.y) };
    next = { ...row, top: start.y, count: row.count + nodes.length };
  } else if (row && lastBox) {
    // Right under this platform's row, inside its own section; any group below is pushed down after (see makeRoom).
    // Measured from the row's items as they are now (moved, resized or not), so the new row lines up with the old.
    const items = (await Promise.all((row.ids ?? []).map((id) => figma.getNodeByIdAsync(id))))
      .filter((node): node is SceneNode => Boolean(node) && !node!.removed && 'absoluteBoundingBox' in node!)
      .map((node) => node.absoluteBoundingBox)
      .filter((box): box is Rect => Boolean(box));
    const left = items.length ? Math.min(...items.map((box) => box.x)) : row.left;
    const bottom = items.length ? Math.max(...items.map((box) => box.y + box.height)) : row.bottom;
    start = { x: Math.round(left), y: Math.ceil(bottom + gap) };
    next = { last: '', left: start.x, top: start.y, bottom: start.y, count: nodes.length };
  } else {
    // A platform's first row goes under the other platforms' groups, with a clear gap, not in among them.
    const others = beside || isFree(platform) ? [] : PLATFORMS.filter((each) => each !== platform);
    const bottoms = others.map(groupBottom).filter((value): value is number => value !== null);
    const lefts = others.map(groupLeft).filter((value): value is number => value !== null);
    start = beside
      ? { x: Math.round(beside.x + beside.width + gap), y: Math.round(beside.y) }
      : bottoms.length
        ? { x: Math.round(Math.min(...lefts) + SECTION_PAD.side), y: Math.round(Math.max(...bottoms) + between) }
        : { x: Math.round(center.x - width / 2), y: Math.round(center.y - height / 2) };
    next = { last: '', left: start.x, top: start.y, bottom: start.y, count: nodes.length };
  }

  // Never on top of what is already there (its own section aside): slide right past it.
  const groups = PLATFORMS.map((each) => sections.get(each)).filter((each): each is SectionNode => Boolean(each));
  let x = freeX(start.x, start.y, width, height, gap, section, groups, nodes);
  // A new row's left edge is where its first item really landed (it may have slid right past something), so the
  // rows under it line up with it. Before, the next row started back at the spot it slid away from, and slid again.
  if (next.count === nodes.length) next.left = x;
  const spots = nodes.map((node) => {
    const spot = { x, y: start.y };
    x += node.width + gap;
    return spot;
  });
  next.last = nodes[nodes.length - 1].id;
  next.ids = [...(next.count === nodes.length ? [] : next.ids ?? []), ...nodes.map((node) => node.id)];
  next.bottom = Math.max(next.bottom, start.y + height);

  if (beside || isFree(platform)) {
    // Freeform, or beside something the person selected: loose, right there. Pulling it into the section would stretch the
    // section across the page to reach it.
    nodes.forEach((node, index) => {
      figma.currentPage.appendChild(node);
      node.x = spots[index].x;
      node.y = spots[index].y;
    });
    // Freeform keeps its row in page positions (there is no section to measure from).
    if (isFree(platform) && !beside) figma.currentPage.setPluginData(`${ROW_KEY}:${platform}`, JSON.stringify(next));
  } else {
    if (section) movedByHand(section);
    const before = section ? { y: section.y, bottom: section.y + section.height } : null;
    const home = gather(section, platform, nodes, spots);
    makeRoom(home, before, groups.filter((each) => each.id !== home.id));
    remember(home);
    // Saved relative to the section, so the row survives the section being dragged somewhere else.
    const saved = { ...next, left: next.left - home.x, top: next.top - home.y, bottom: next.bottom - home.y };
    figma.currentPage.setPluginData(`${ROW_KEY}:${platform}`, JSON.stringify(saved));
  }
}

/**
 * When a section grows, the other platforms' sections that sit below it move down by the same amount, so sections
 * never overlap (before, a new iOS row was put under the Web Apps group and the iOS section grew over it).
 * Rows are kept relative to their section, so they move with it.
 */
/** Where the plugin itself last put a section. If the section is somewhere else now, the person dragged it there. */
const POS_KEY = 'motvin-pos';
function remember(section: SectionNode) {
  section.setPluginData(POS_KEY, JSON.stringify({ x: Math.round(section.x), y: Math.round(section.y) }));
}
/** Once dragged by hand, a section stays the person's to place: the plugin never moves it again. */
function movedByHand(section: SectionNode): boolean {
  if (section.getPluginData('motvin-pinned')) return true;
  try {
    const at = JSON.parse(section.getPluginData(POS_KEY)) as { x: number; y: number };
    const moved = Math.abs(at.x - section.x) > 1 || Math.abs(at.y - section.y) > 1;
    if (moved) section.setPluginData('motvin-pinned', '1');
    return moved;
  } catch {
    return false;
  }
}

function makeRoom(grown: SectionNode, before: { y: number; bottom: number } | null, others: SectionNode[]) {
  const gap = SECTION_PAD.side + SECTION_PAD.top;
  let floor = grown.y + grown.height;
  const startTop = before ? before.y : grown.y;
  // A section the person dragged somewhere stays exactly where they put it; only sections the plugin laid out move.
  others
    .filter((other) => !movedByHand(other))
    .filter((other) => other.y >= startTop)
    .sort((a, b) => a.y - b.y)
    .forEach((other) => {
      if (other.y < floor + gap) {
        other.y = Math.round(floor + gap);
        remember(other);
      }
      floor = Math.max(floor, other.y + other.height);
    });
}

/**
 * Puts the new screens (at their page positions, `spots`) into the platform's section, making it if needed, and
 * grows the section to hold everything in it with room around: "Motvin · iOS", "Motvin · Web Apps", "Motvin · Webs".
 */
function gather(existing: SectionNode | null, platform: Group, nodes: SceneNode[], spots: { x: number; y: number }[]): SectionNode {
  const section = existing ?? figma.createSection();
  if (!existing) {
    section.name = groupName(platform);
    figma.currentPage.appendChild(section);
    figma.currentPage.setPluginData(`motvin-section:${platform}`, section.id);
  }
  // Everything already inside, by page position, before the section moves.
  const kept = existing ? section.children.map((child) => ({ child, x: section.x + child.x, y: section.y + child.y, w: child.width, h: child.height })) : [];
  const boxes = [...kept, ...nodes.map((node, index) => ({ x: spots[index].x, y: spots[index].y, w: node.width, h: node.height }))];
  const left = Math.min(...boxes.map((box) => box.x)) - SECTION_PAD.side;
  const top = Math.min(...boxes.map((box) => box.y)) - SECTION_PAD.top;
  const right = Math.max(...boxes.map((box) => box.x + box.w)) + SECTION_PAD.side;
  const bottom = Math.max(...boxes.map((box) => box.y + box.h)) + SECTION_PAD.side;
  section.x = left;
  section.y = top;
  section.resizeWithoutConstraints(right - left, bottom - top);
  for (const { child, x, y } of kept) {
    child.x = x - left;
    child.y = y - top;
  }
  nodes.forEach((node, index) => {
    section.appendChild(node);
    node.x = spots[index].x - left;
    node.y = spots[index].y - top;
  });
  return section;
}

/**
 * Brings what was just placed into view without jumping around: nothing moves when it is already on screen; when it
 * is off screen but fits at the current zoom, the view slides over to it; only when it is bigger than the view does
 * Figma zoom out to fit it.
 */
function showIfHidden(nodes: SceneNode[]) {
  const boxes = nodes.map((node) => node.absoluteBoundingBox).filter((box): box is Rect => Boolean(box));
  if (!boxes.length) return;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  const view = figma.viewport.bounds;
  const inside = left >= view.x && top >= view.y && right <= view.x + view.width && bottom <= view.y + view.height;
  if (inside) return;
  const fits = right - left <= view.width * 0.9 && bottom - top <= view.height * 0.9;
  if (fits) figma.viewport.center = { x: (left + right) / 2, y: (top + bottom) / 2 };
  else figma.viewport.scrollAndZoomIntoView(nodes);
}

/** The first x from `x` rightwards where a width × height box at `y` overlaps nothing on the page, `gap` clear. */
function freeX(x: number, y: number, width: number, height: number, gap: number, own: SectionNode | null = null, skip: SectionNode[] = [], placing: SceneNode[] = []): number {
  // Compared by id: Figma can hand back a different object for the same node, so === missed the plugin's own
  // section and treated it as something to slide past (a new row then started to the right of the whole section).
  // Also skip what is being placed: it already sits on the page where Figma created it, and was found in its own way.
  const skipIds = new Set([...skip, ...placing].map((each) => each.id));
  const nodes = figma.currentPage.children.flatMap((node) => (own && node.id === own.id ? own.children.filter((child) => !skipIds.has(child.id)) : skipIds.has(node.id) ? [] : [node]));
  const boxes = nodes.map((node) => node.absoluteBoundingBox).filter((box): box is Rect => Boolean(box));
  for (let tries = 0; tries < 200; tries++) {
    // A pixel of give: sizes like 1996.43 get rounded when placing, and a 0.4 overlap used to count as a collision
    // (a Web Apps flow then slid right of the one above it, row after row, into a staircase).
    const near = 1;
    const hit = boxes.find(
      (box) => x < box.x + box.width + gap - near && x + width + gap - near > box.x && y < box.y + box.height + gap - near && y + height + gap - near > box.y,
    );
    if (!hit) return x;
    x = Math.round(hit.x + hit.width + gap);
  }
  return x;
}

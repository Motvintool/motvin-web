import { DEFAULT_PREFS, PANEL, PLATFORM_LABEL, type CanvasSelection, type ResizeEdge, type Flow, type Placement, type PlacedScreen, type Step, type ToMain, type ToUi } from './shared';

/**
 * The plugin's main code: runs in Figma's sandbox, where it can touch the
 * document but not the network. The panel (src/ui) searches Motvin and
 * downloads images; this side keeps the sign-in on the person's computer and
 * turns downloaded screens into frames on the canvas.
 */

/** Image parts are at most this tall, so Figma keeps them sharp (see figma-image.service.ts in motvin-backend). */
const PART_HEIGHT = 4096;
const SESSION_KEY = 'motvin.session';
const PREFS_KEY = 'motvin.prefs';
const SIZE_KEY = 'motvin.size';
const FONT = 'Inter';
const INK = { r: 0.067, g: 0.067, b: 0.067 };
const MUTED = { r: 0.42, g: 0.42, b: 0.44 };
const LINK = { r: 0, g: 0.56, b: 0.94 };
const BOARD = { r: 0.957, g: 0.957, b: 0.965 };

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
      await placing(() => message.screens.map((placed) => (message.captions ? screenCard(placed) : screenFrame(placed))), message.placement);
      return;
    case 'place-flow':
      await placing(() => [flowBoard(message.flow, message.steps, message.captions)], message.placement);
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
async function placing(build: () => SceneNode[], placement: Placement) {
  try {
    await loadFonts();
    // Read before the new nodes take over the selection.
    const beside = placement === 'selection' ? selectionBounds() : null;
    const nodes = build();
    place(nodes, beside);
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

function link(characters: string, url: string, size: number): TextNode {
  const node = label(characters, size, 'Medium', LINK);
  node.hyperlink = { type: 'URL', value: url };
  return node;
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

/** The screen itself: its image parts stacked top to bottom, at the size it has on the device. */
function screenFrame(placed: PlacedScreen): FrameNode {
  const { screen, parts } = placed;
  const size = screen.image.frame;
  const scale = size.width / screen.image.width;

  const frame = figma.createFrame();
  frame.name = frameName(placed);
  frame.resize(size.width, size.height);
  frame.clipsContent = true;
  frame.fills = [];

  let top = 0;
  parts.forEach((bytes, index) => {
    const pixels = Math.min(PART_HEIGHT, screen.image.height - index * PART_HEIGHT);
    // The last part takes what is left, so rounding never leaves a gap at the bottom.
    const height = index === parts.length - 1 ? size.height - top : pixels * scale;
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

  if (heading) card.appendChild(label(heading, 13 * scale, 'Medium', MUTED));
  card.appendChild(screenFrame(placed));
  if (!captions) return card;
  addWrapped(card, label(`${screen.app.name} — ${screen.name}`, 14 * scale, 'Semi Bold', INK));
  const about = [screen.screen_type, PLATFORM_LABEL[screen.platform], screen.image.full ? null : 'Preview size (view-only licence)'].filter(Boolean).join(' · ');
  addWrapped(card, label(about, 12 * scale, 'Regular', MUTED));
  card.appendChild(link('View on Motvin ↗', screen.page_url, 12 * scale));
  return card;
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
  board.paddingTop = board.paddingBottom = board.paddingLeft = board.paddingRight = 48 * scale;
  board.setPluginData('motvin', JSON.stringify({ flow: flow.id, platform: flow.platform }));

  const header = stack('VERTICAL', 8 * scale);
  header.name = 'Title';
  header.appendChild(label(`${flow.app.name} — ${flow.name}`, 28 * scale, 'Semi Bold', INK));
  header.appendChild(label(`${PLATFORM_LABEL[flow.platform]} · ${flow.category} · ${steps.length === 1 ? '1 step' : `${steps.length} steps`}`, 16 * scale, 'Regular', MUTED));
  header.appendChild(link('View on Motvin ↗', flow.page_url, 14 * scale));
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
function place(nodes: SceneNode[], beside: Rect | null) {
  const gap = 80;
  const width = nodes.reduce((sum, node) => sum + node.width, 0) + gap * (nodes.length - 1);
  const height = Math.max(...nodes.map((node) => node.height));
  const center = figma.viewport.center;
  let x = beside ? Math.round(beside.x + beside.width + gap) : Math.round(center.x - width / 2);
  const y = beside ? Math.round(beside.y) : Math.round(center.y - height / 2);
  for (const node of nodes) {
    figma.currentPage.appendChild(node);
    node.x = x;
    node.y = y;
    x += node.width + gap;
  }
  figma.currentPage.selection = nodes;
  figma.viewport.scrollAndZoomIntoView(nodes);
}

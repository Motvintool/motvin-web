import { PATTERNS, SCREENS } from './data/build';
import { ELEMENT_LABEL, INDUSTRY_LABEL, SCREEN_TYPE_LABEL, STYLE_LABEL } from './taxonomy';
import type { ElementKind, Screen, ScreenType } from './types';
import { createRng } from './seed';

/**
 * "Analyze UI" and "Extract UI" — the AI tools that sit beside a screen.
 *
 * Today these are derived from the structured screen record so the UI, the
 * copy flow and the icon-library hand-off can be designed end to end. The
 * output shape is what a vision model behind `POST /analyze` will return, so
 * `api.ts` can switch to the network without changing any panel.
 */

export type AnalysisSection = { title: string; points: string[] };

export type UiAnalysis = {
  screenId: string;
  sections: AnalysisSection[];
  palette: { hex: string; role: string }[];
  patternSlugs: string[];
};

export type DetectedComponent = {
  kind: ElementKind;
  label: string;
  count: number;
  /** Normalised 0–1 bounding box for the primary instance. */
  box: { x: number; y: number; w: number; h: number };
  /** For `icon` components: search terms for the Motvin icon library. */
  iconQueries?: string[];
};

export type UiExtraction = {
  screenId: string;
  components: DetectedComponent[];
  typography: { role: string; spec: string }[];
  colors: { hex: string; role: string }[];
};

const LAYOUT_BY_TYPE: Record<ScreenType, string[]> = {
  landing: ['Single-column marketing layout', 'Centered hero with paired CTA', 'Feature grid below the fold'],
  login: ['Centered auth card', 'Single-column form', 'Secondary actions beneath the primary button'],
  signup: ['Centered auth card', 'Stacked inputs with inline validation', 'Consent row before the CTA'],
  dashboard: ['Sidebar + content two-column layout', 'KPI row above a primary chart', 'Table anchoring the lower half'],
  search: ['Search field pinned to the top', 'Filter chips beneath the input', 'Result list in a single column'],
  pricing: ['Three-tier card row', 'Recommended tier emphasised', 'Billing toggle above the tiers'],
  checkout: ['Two-column form + order summary', 'Stepper communicating progress', 'Sticky primary action'],
  settings: ['Section list + detail panel', 'Grouped form rows with toggles', 'Destructive actions isolated at the end'],
  profile: ['Cover + avatar header', 'Stats row beneath identity', 'Tabbed content grid'],
  onboarding: ['Full-bleed illustration', 'Short headline and supporting copy', 'Progress dots above the CTA'],
  feed: ['Vertical card stream', 'Stories rail at the top', 'Persistent bottom navigation'],
  product: ['Gallery-first layout', 'Title, price and variant chips', 'Sticky add-to-cart'],
  other: ['Centered message block', 'Single supporting illustration', 'One clear next action'],
};

const NAV_BY_PLATFORM = {
  web: ['Persistent top navigation', 'Wordmark left, actions right'],
  ios: ['Bottom tab bar with 5 destinations', 'Large title navigation bar'],
  android: ['Bottom navigation bar', 'Material-style app bar'],
} as const;

const TYPE_BY_STYLE: Record<string, string> = {
  minimal: 'Restrained scale — one display size, one body size, generous line-height',
  editorial: 'Serif display paired with a neutral sans body; strong size contrast',
  bold: 'Heavy display weights and tight tracking; compact body text',
  corporate: 'Conservative sans throughout; sentence-case labels; medium weights',
  playful: 'Rounded geometric sans; oversized numerals; friendly copy',
  experimental: 'Mono accents mixed with a grotesque display face',
  dark: 'High-contrast type on deep surfaces; muted secondary text at ~55% opacity',
  light: 'Near-black text on off-white; secondary text at ~60% opacity',
};

function componentBoxes(screen: Screen): DetectedComponent[] {
  const rng = createRng(screen.seed ^ 0x5bd1e995);
  const mobile = screen.platform !== 'web';
  const out: DetectedComponent[] = [];
  for (const kind of screen.elements) {
    const count = kind === 'icon' ? rng.int(6, 18) : kind === 'card' || kind === 'input' || kind === 'list' ? rng.int(2, 6) : 1;
    let box: DetectedComponent['box'];
    switch (kind) {
      case 'navigation': box = { x: 0, y: 0, w: mobile ? 1 : 0.16, h: mobile ? 0.08 : 1 }; break;
      case 'bottom-nav': box = { x: 0, y: 0.92, w: 1, h: 0.08 }; break;
      case 'search': box = { x: 0.06, y: mobile ? 0.1 : 0.12, w: mobile ? 0.88 : 0.5, h: 0.06 }; break;
      case 'chart': box = { x: mobile ? 0.06 : 0.2, y: 0.34, w: mobile ? 0.88 : 0.5, h: 0.28 }; break;
      case 'table': box = { x: 0.2, y: 0.66, w: 0.76, h: 0.3 }; break;
      case 'button': box = { x: mobile ? 0.06 : 0.36, y: mobile ? 0.84 : 0.56, w: mobile ? 0.88 : 0.14, h: 0.06 }; break;
      case 'input': box = { x: mobile ? 0.06 : 0.36, y: 0.4, w: mobile ? 0.88 : 0.28, h: 0.06 }; break;
      case 'card': box = { x: mobile ? 0.06 : 0.2, y: 0.2, w: mobile ? 0.88 : 0.17, h: 0.12 }; break;
      case 'avatar': box = { x: mobile ? 0.42 : 0.92, y: mobile ? 0.14 : 0.02, w: mobile ? 0.16 : 0.04, h: mobile ? 0.09 : 0.06 }; break;
      case 'tabs': box = { x: 0.06, y: mobile ? 0.3 : 0.14, w: mobile ? 0.88 : 0.4, h: 0.05 }; break;
      case 'chip': box = { x: 0.06, y: mobile ? 0.18 : 0.2, w: 0.7, h: 0.04 }; break;
      case 'image': box = { x: 0.06, y: 0.12, w: 0.88, h: 0.3 }; break;
      default: box = { x: 0.1 + rng.next() * 0.4, y: 0.2 + rng.next() * 0.5, w: 0.3, h: 0.1 };
    }
    out.push({
      kind,
      label: ELEMENT_LABEL[kind],
      count,
      box,
      iconQueries: kind === 'icon' ? iconQueriesFor(screen) : undefined,
    });
  }
  return out;
}

function iconQueriesFor(screen: Screen): string[] {
  const base: Record<ScreenType, string[]> = {
    landing: ['arrow right', 'check', 'star', 'play'],
    login: ['mail', 'lock', 'eye', 'google'],
    signup: ['user', 'mail', 'lock', 'check'],
    dashboard: ['home', 'chart', 'bell', 'settings', 'search', 'filter'],
    search: ['search', 'filter', 'close', 'chevron down'],
    pricing: ['check', 'close', 'star', 'zap'],
    checkout: ['credit card', 'lock', 'truck', 'chevron right'],
    settings: ['user', 'bell', 'shield', 'moon', 'globe'],
    profile: ['edit', 'share', 'grid', 'bookmark', 'settings'],
    onboarding: ['arrow right', 'sparkles', 'shield', 'check'],
    feed: ['heart', 'message', 'share', 'bookmark', 'plus'],
    product: ['heart', 'share', 'shopping bag', 'star', 'minus', 'plus'],
    other: ['check circle', 'alert', 'inbox', 'refresh'],
  };
  return base[screen.screenType];
}

export function analyzeScreen(screen: Screen): UiAnalysis {
  const patternSlugs = PATTERNS.filter((p) => p.screenIds.includes(screen.id)).map((p) => p.slug);
  const styleLabels = screen.style.map((s) => STYLE_LABEL[s]);
  const typography = screen.style.map((s) => TYPE_BY_STYLE[s]).filter(Boolean);

  return {
    screenId: screen.id,
    palette: [
      { hex: screen.colors.bg, role: 'Background' },
      { hex: screen.colors.dark ? '#1c1f27' : '#ffffff', role: 'Surface' },
      { hex: screen.colors.text, role: 'Text' },
      { hex: screen.colors.accent, role: 'Accent' },
    ],
    patternSlugs,
    sections: [
      { title: 'Layout', points: LAYOUT_BY_TYPE[screen.screenType] },
      { title: 'Navigation', points: [...NAV_BY_PLATFORM[screen.platform]] },
      { title: 'Typography', points: typography },
      {
        title: 'Colors',
        points: [
          `${screen.colors.dark ? 'Dark' : 'Light'} base with a single ${screen.colors.accent} accent`,
          'Accent reserved for primary actions and active states',
          'Neutral greys carry hierarchy; no secondary hue',
        ],
      },
      {
        title: 'Spacing',
        points: [
          screen.platform === 'web' ? '8px base grid, 24px section rhythm' : '4px base grid, 16px screen inset',
          screen.screenType === 'dashboard' || screen.screenType === 'feed' ? 'Dense: 12px card gaps' : 'Comfortable: 20–24px between groups',
        ],
      },
      { title: 'Components', points: screen.elements.map((e) => ELEMENT_LABEL[e]) },
      {
        title: 'Patterns',
        points: patternSlugs.length
          ? PATTERNS.filter((p) => patternSlugs.includes(p.slug)).map((p) => p.name)
          : ['No named pattern matched'],
      },
      {
        title: 'Visual style',
        points: [...styleLabels, `${INDUSTRY_LABEL[screen.industry]} · ${SCREEN_TYPE_LABEL[screen.screenType]}`],
      },
    ],
  };
}

export function extractScreen(screen: Screen): UiExtraction {
  return {
    screenId: screen.id,
    components: componentBoxes(screen),
    typography: [
      { role: 'Display', spec: screen.style.includes('editorial') ? 'Serif 600 · 40/44' : 'Sans 600 · 32/38' },
      { role: 'Heading', spec: 'Sans 600 · 20/28' },
      { role: 'Body', spec: 'Sans 400 · 14/22' },
      { role: 'Label', spec: 'Sans 500 · 12/16 · +0.02em' },
    ],
    colors: [
      { hex: screen.colors.bg, role: 'bg' },
      { hex: screen.colors.text, role: 'text' },
      { hex: screen.colors.accent, role: 'accent' },
      { hex: screen.colors.dark ? '#262a33' : '#e6e7eb', role: 'border' },
    ],
  };
}

/**
 * Similarity = shared facets weighted by importance. The vector backend will
 * replace this with cosine distance over image embeddings.
 */
export function similarScreens(screen: Screen, limit = 12): Screen[] {
  return SCREENS.filter((s) => s.id !== screen.id)
    .map((s) => {
      let score = 0;
      if (s.screenType === screen.screenType) score += 5;
      if (s.industry === screen.industry) score += 3;
      if (s.platform === screen.platform) score += 2;
      if (s.colors.dark === screen.colors.dark) score += 2;
      score += s.style.filter((st) => screen.style.includes(st)).length;
      score += s.elements.filter((e) => screen.elements.includes(e)).length * 0.25;
      if (s.appId === screen.appId) score -= 2; // prefer other apps
      return { s, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.s);
}

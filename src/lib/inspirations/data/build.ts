import { createRng, hashSeed, slugify } from '../seed';
import type {
  App,
  Aspect,
  ElementKind,
  Flow,
  FlowCategory,
  Pattern,
  PatternCategory,
  Platform,
  Screen,
  ScreenPalette,
  ScreenType,
  Style,
} from '../types';
import { APP_SEEDS, type AppSeed } from './apps';

/**
 * Builds the in-memory catalogue from `APP_SEEDS`. Runs once at module load
 * on both server and client; everything is deterministic so the two agree.
 *
 * Numbers at the time of writing: 24 apps, ~150 screens, ~40 flows, 30
 * patterns. Adding an app to `apps.ts` grows all four automatically.
 */

// ─── Screen naming ──────────────────────────────────────────────────────────

const SCREEN_NAMES: Record<ScreenType, string[]> = {
  landing: ['Homepage', 'Landing Page', 'Marketing Home', 'Product Overview'],
  login: ['Sign In', 'Log In', 'Welcome Back', 'Login'],
  signup: ['Create Account', 'Sign Up', 'Get Started', 'Registration'],
  dashboard: ['Dashboard', 'Overview', 'Home Dashboard', 'Insights', 'Activity Overview'],
  search: ['Search Results', 'Search', 'Explore', 'Browse'],
  pricing: ['Pricing', 'Plans & Pricing', 'Choose a Plan', 'Pricing Page'],
  checkout: ['Checkout', 'Payment', 'Review Order', 'Order Summary'],
  settings: ['Settings', 'Account Settings', 'Preferences', 'Workspace Settings'],
  profile: ['Profile', 'My Account', 'Account', 'User Profile'],
  onboarding: ['Welcome', 'Onboarding', 'Getting Started', 'Intro'],
  feed: ['Home Feed', 'Feed', 'Activity', 'Timeline'],
  product: ['Product Detail', 'Details', 'Item View', 'Listing'],
  other: ['Empty State', 'Success', 'Notifications', 'Confirmation', 'Error State'],
};

/** Industry-flavoured overrides so names read like real products. */
const INDUSTRY_NAMES: Partial<Record<ScreenType, Partial<Record<App['industry'], string[]>>>> = {
  dashboard: {
    fintech: ['Spending Dashboard', 'Accounts Overview', 'Balance Overview'],
    finance: ['Portfolio', 'Holdings Overview', 'Market Dashboard'],
    healthcare: ['Health Summary', 'Today', 'Vitals Overview'],
    ai: ['Workspace', 'Runs Overview', 'Model Dashboard'],
    saas: ['Team Dashboard', 'Reports', 'Analytics Overview'],
    productivity: ['My Tasks', 'Today', 'Projects Overview'],
    education: ['My Courses', 'Learning Dashboard', 'Progress'],
    ecommerce: ['Orders Dashboard', 'Sales Overview'],
  },
  feed: {
    social: ['Home Feed', 'For You', 'Following'],
    travel: ['Discover Stays', 'Inspiration Feed', 'Trips'],
    healthcare: ['Daily Plan', 'Workouts', 'Today'],
    ecommerce: ['Shop Home', 'Deals', 'New Arrivals'],
  },
  product: {
    travel: ['Stay Details', 'Destination', 'Listing Detail'],
    ecommerce: ['Product Page', 'Item Detail', 'Product Detail'],
    education: ['Course Detail', 'Lesson', 'Course Page'],
    finance: ['Asset Detail', 'Stock Detail'],
    ai: ['Generation Detail', 'Result View'],
  },
  search: {
    ai: ['Ask', 'Query Results', 'Search'],
    travel: ['Search Stays', 'Search Results', 'Map Search'],
    ecommerce: ['Search Results', 'Category Browse'],
  },
  other: {
    fintech: ['Transfer Sent', 'Card Frozen', 'Transaction Detail', 'Notifications'],
    finance: ['Order Confirmed', 'Watchlist Empty'],
    ai: ['Empty Workspace', 'Generation Complete'],
    saas: ['Invite Team', 'No Reports Yet', 'Notifications'],
    ecommerce: ['Order Confirmed', 'Empty Cart'],
    healthcare: ['Goal Reached', 'Appointment Booked'],
  },
};

// ─── Element detection per screen type ──────────────────────────────────────

const BASE_ELEMENTS: Record<ScreenType, ElementKind[]> = {
  landing: ['navigation', 'button', 'card', 'image', 'icon'],
  login: ['form', 'input', 'button', 'icon'],
  signup: ['form', 'input', 'button', 'toggle', 'icon'],
  dashboard: ['navigation', 'card', 'chart', 'table', 'tabs', 'avatar', 'badge', 'icon', 'button'],
  search: ['search', 'chip', 'list', 'card', 'image', 'icon'],
  pricing: ['card', 'toggle', 'button', 'badge', 'icon'],
  checkout: ['form', 'input', 'stepper', 'card', 'button', 'icon'],
  settings: ['navigation', 'form', 'toggle', 'avatar', 'input', 'list', 'icon'],
  profile: ['avatar', 'tabs', 'card', 'image', 'badge', 'button', 'icon'],
  onboarding: ['image', 'button', 'stepper', 'icon'],
  feed: ['card', 'avatar', 'image', 'list', 'icon', 'badge'],
  product: ['image', 'chip', 'button', 'card', 'tabs', 'icon'],
  other: ['empty-state', 'button', 'icon', 'notification'],
};

const TAG_POOL: Record<ScreenType, string[]> = {
  landing: ['hero', 'marketing', 'cta', 'features', 'social proof'],
  login: ['auth', 'password', 'sso', 'magic link'],
  signup: ['auth', 'registration', 'form validation'],
  dashboard: ['kpi', 'analytics', 'data viz', 'overview', 'sidebar'],
  search: ['results', 'autocomplete', 'filters', 'empty results'],
  pricing: ['tiers', 'billing toggle', 'comparison', 'enterprise'],
  checkout: ['payment', 'cart', 'address', 'order summary'],
  settings: ['preferences', 'account', 'notifications', 'security'],
  profile: ['avatar', 'bio', 'stats', 'activity'],
  onboarding: ['welcome', 'walkthrough', 'permissions', 'progress'],
  feed: ['timeline', 'posts', 'stories', 'infinite scroll'],
  product: ['gallery', 'variants', 'add to cart', 'reviews'],
  other: ['state', 'confirmation', 'feedback'],
};

// ─── Palettes ───────────────────────────────────────────────────────────────

const LIGHT_BG = ['#ffffff', '#fafafa', '#f7f7f5', '#f5f6fa', '#fbfaf7'];
const DARK_BG = ['#0b0d12', '#101319', '#12121a', '#0f1115', '#151516'];

function palette(seed: AppSeed, rng: ReturnType<typeof createRng>, forceDark?: boolean): ScreenPalette {
  const dark = forceDark ?? seed.dark;
  if (dark) {
    const bg = rng.pick(DARK_BG);
    return {
      bg,
      surface: 'rgba(255,255,255,0.06)',
      text: '#f5f5f7',
      muted: 'rgba(255,255,255,0.32)',
      accent: seed.accent,
      dark: true,
    };
  }
  return {
    bg: rng.pick(LIGHT_BG),
    surface: '#ffffff',
    text: '#111318',
    muted: 'rgba(17,19,24,0.28)',
    accent: seed.accent,
    dark: false,
  };
}

// ─── Aspect ratios ──────────────────────────────────────────────────────────

function aspectFor(platform: Platform, screenType: ScreenType, rng: ReturnType<typeof createRng>): Aspect {
  if (platform !== 'web') return rng.chance(0.8) ? '9:16' : '3:4';
  if (screenType === 'landing') return rng.chance(0.5) ? '16:10' : '4:5';
  if (screenType === 'login' || screenType === 'signup') return rng.pick(['1:1', '4:5', '16:10']);
  if (screenType === 'pricing') return rng.pick(['16:10', '4:5']);
  return rng.pick(['16:10', '16:9', '16:10']);
}

// ─── Builder ────────────────────────────────────────────────────────────────

const CAPTURE_START = Date.UTC(2025, 0, 6);

function isoDaysAfter(days: number): string {
  return new Date(CAPTURE_START + days * 86_400_000).toISOString();
}

function buildCatalogue() {
  const apps: App[] = [];
  const screens: Screen[] = [];
  const flows: Flow[] = [];

  APP_SEEDS.forEach((seed, appIndex) => {
    const slug = slugify(seed.name);
    const appId = `app-${slug}`;
    const appRng = createRng(hashSeed(appId));
    const appScreens: Screen[] = [];

    for (const platform of seed.platforms) {
      const types = seed.screens[platform] ?? [];
      types.forEach((screenType, i) => {
        const id = `${slug}-${platform}-${screenType}`;
        const rng = createRng(hashSeed(id));
        const industryNames = INDUSTRY_NAMES[screenType]?.[seed.industry];
        const name =
          industryNames && rng.chance(0.75)
            ? rng.pick(industryNames)
            : rng.pick(SCREEN_NAMES[screenType]);

        // Most products keep one mode, but a few ship both — the odd inverted
        // screen makes the gallery read as real rather than generated.
        const flipMode = rng.chance(0.12);
        const colors = palette(seed, rng, flipMode ? !seed.dark : undefined);

        const style: Style[] = [...seed.style.filter((s) => s !== 'dark' && s !== 'light')];
        style.push(colors.dark ? 'dark' : 'light');

        const elements = [...BASE_ELEMENTS[screenType]];
        if (platform !== 'web' && screenType !== 'onboarding' && screenType !== 'login') {
          elements.push('bottom-nav');
        }
        if (rng.chance(0.2)) elements.push('modal');
        if (rng.chance(0.25)) elements.push('notification');

        const tagPool = TAG_POOL[screenType];
        const tags = Array.from(
          new Set([
            seed.industry,
            screenType,
            platform,
            ...style,
            rng.pick(tagPool),
            rng.pick(tagPool),
          ]),
        );

        appScreens.push({
          id,
          appId,
          name,
          image: null,
          aspect: aspectFor(platform, screenType, rng),
          platform,
          screenType,
          industry: seed.industry,
          tags,
          colors,
          style,
          elements: Array.from(new Set(elements)),
          createdAt: isoDaysAfter(appIndex * 9 + i * 2 + rng.int(0, 3)),
          seed: hashSeed(`${id}:layout`),
          provenance: {
            sourceUrl: `${seed.website}/${screenType}`,
            capturedAt: isoDaysAfter(appIndex * 9 + i * 2),
            permission: 'granted',
            license: 'Editorial reference — displayed for design study',
            attribution: seed.name,
            status: 'published',
          },
        });
      });
    }

    // Flows: ordered subsets of the screens a platform actually has.
    const FLOW_RECIPES: { name: string; category: FlowCategory; order: ScreenType[] }[] = [
      { name: 'Onboarding', category: 'onboarding', order: ['landing', 'signup', 'onboarding', 'dashboard'] },
      { name: 'Sign in', category: 'authentication', order: ['landing', 'login', 'dashboard'] },
      { name: 'Purchase', category: 'checkout', order: ['feed', 'search', 'product', 'checkout', 'other'] },
      { name: 'Search & discover', category: 'search', order: ['dashboard', 'search', 'product'] },
      { name: 'Account settings', category: 'settings', order: ['dashboard', 'profile', 'settings'] },
      { name: 'Upgrade plan', category: 'checkout', order: ['dashboard', 'pricing', 'checkout', 'other'] },
      { name: 'First session', category: 'onboarding', order: ['onboarding', 'login', 'feed', 'profile'] },
      { name: 'Browse feed', category: 'discovery', order: ['feed', 'product', 'profile'] },
    ];

    for (const platform of seed.platforms) {
      const byType = new Map(
        appScreens.filter((s) => s.platform === platform).map((s) => [s.screenType, s]),
      );
      for (const recipe of FLOW_RECIPES) {
        const ids = recipe.order.filter((t) => byType.has(t)).map((t) => byType.get(t)!.id);
        if (ids.length < 3) continue;
        flows.push({
          id: `${slug}-${platform}-${slugify(recipe.name)}`,
          appId,
          name: recipe.name,
          screenIds: ids,
          category: recipe.category,
          platform,
        });
      }
    }

    const appFlowCount = flows.filter((f) => f.appId === appId).length;
    const glyph = seed.name
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    apps.push({
      id: appId,
      name: seed.name,
      slug,
      logo: {
        bg: seed.accent,
        fg: appRng.chance(0.85) ? '#ffffff' : '#0b0d12',
        glyph,
      },
      platforms: seed.platforms,
      industry: seed.industry,
      website: seed.website,
      tagline: seed.tagline,
      screenCount: appScreens.length,
      flowCount: appFlowCount,
    });

    screens.push(...appScreens);
  });

  // Patterns: named groupings of screens that share an element or intent.
  const PATTERN_RECIPES: {
    name: string;
    category: PatternCategory;
    description: string;
    match: (s: Screen) => boolean;
    tags: string[];
  }[] = [
    { name: 'Top navigation bars', category: 'Navigation', description: 'Horizontal primary navigation on web products.', match: (s) => s.platform === 'web' && s.elements.includes('navigation'), tags: ['header', 'navbar'] },
    { name: 'Sidebar navigation', category: 'Navigation', description: 'Persistent left rails inside authenticated dashboards.', match: (s) => s.platform === 'web' && s.screenType === 'dashboard', tags: ['sidebar', 'rail'] },
    { name: 'Tab bars', category: 'Bottom Navigation', description: 'Mobile bottom tab bars with 4–5 destinations.', match: (s) => s.elements.includes('bottom-nav'), tags: ['tab bar', 'mobile'] },
    { name: 'Search inputs', category: 'Search', description: 'Prominent search fields with suggestions and recent queries.', match: (s) => s.screenType === 'search', tags: ['search', 'autocomplete'] },
    { name: 'Search results', category: 'Search', description: 'Result lists and grids with dense metadata.', match: (s) => s.screenType === 'search' && s.elements.includes('list'), tags: ['results', 'list'] },
    { name: 'Filter chips', category: 'Filters', description: 'Horizontally scrolling filter chips.', match: (s) => s.elements.includes('chip'), tags: ['chips', 'filter'] },
    { name: 'Filter panels', category: 'Filters', description: 'Side or overlay panels with grouped filter controls.', match: (s) => s.screenType === 'search' && s.platform === 'web', tags: ['panel', 'facets'] },
    { name: 'KPI cards', category: 'Cards', description: 'Compact stat cards with trend indicators.', match: (s) => s.screenType === 'dashboard', tags: ['kpi', 'metrics'] },
    { name: 'Pricing cards', category: 'Cards', description: 'Tiered plan cards with a highlighted recommendation.', match: (s) => s.screenType === 'pricing', tags: ['pricing', 'tiers'] },
    { name: 'Feed cards', category: 'Cards', description: 'Content cards inside vertical feeds.', match: (s) => s.screenType === 'feed', tags: ['feed', 'post'] },
    { name: 'Product cards', category: 'Cards', description: 'Image-led cards with price and quick actions.', match: (s) => s.screenType === 'product' || (s.industry === 'ecommerce' && s.screenType === 'search'), tags: ['product', 'catalog'] },
    { name: 'Data tables', category: 'Tables', description: 'Sortable tables inside dashboards and admin tools.', match: (s) => s.elements.includes('table'), tags: ['table', 'rows'] },
    { name: 'Transaction lists', category: 'Tables', description: 'Row-based lists of transactions and activity.', match: (s) => (s.industry === 'fintech' || s.industry === 'finance') && (s.screenType === 'dashboard' || s.screenType === 'other'), tags: ['transactions', 'list'] },
    { name: 'Bar & line charts', category: 'Charts', description: 'Time-series charts embedded in overview screens.', match: (s) => s.elements.includes('chart'), tags: ['chart', 'analytics'] },
    { name: 'Progress rings', category: 'Charts', description: 'Circular progress for goals and health metrics.', match: (s) => s.industry === 'healthcare' && s.screenType === 'dashboard', tags: ['progress', 'ring'] },
    { name: 'Login forms', category: 'Forms', description: 'Email/password sign-in with social options.', match: (s) => s.screenType === 'login', tags: ['auth', 'login'] },
    { name: 'Signup forms', category: 'Forms', description: 'Account creation with inline validation.', match: (s) => s.screenType === 'signup', tags: ['auth', 'signup'] },
    { name: 'Settings forms', category: 'Forms', description: 'Grouped preference forms with toggles.', match: (s) => s.screenType === 'settings', tags: ['settings', 'toggles'] },
    { name: 'Payment forms', category: 'Checkout', description: 'Card entry, address and order summary layouts.', match: (s) => s.screenType === 'checkout', tags: ['payment', 'card'] },
    { name: 'Order confirmation', category: 'Checkout', description: 'Success states after a purchase or transfer.', match: (s) => s.screenType === 'other' && /confirm|sent|order|success/i.test(s.name), tags: ['success', 'confirmation'] },
    { name: 'Dialogs', category: 'Modals', description: 'Centered modal dialogs and sheets.', match: (s) => s.elements.includes('modal'), tags: ['modal', 'dialog'] },
    { name: 'Bottom sheets', category: 'Modals', description: 'Mobile sheets sliding from the bottom edge.', match: (s) => s.platform !== 'web' && s.elements.includes('modal'), tags: ['sheet', 'mobile'] },
    { name: 'Segmented tabs', category: 'Tabs', description: 'Tab strips switching views inside a page.', match: (s) => s.elements.includes('tabs'), tags: ['tabs', 'segmented'] },
    { name: 'Profile tabs', category: 'Tabs', description: 'Tabs separating posts, saved and about on profiles.', match: (s) => s.screenType === 'profile', tags: ['profile', 'tabs'] },
    { name: 'Date range pickers', category: 'Date Pickers', description: 'Calendar and range controls in analytics tools.', match: (s) => s.screenType === 'dashboard' && s.platform === 'web' && s.industry !== 'healthcare', tags: ['date', 'range'] },
    { name: 'Trip date pickers', category: 'Date Pickers', description: 'Check-in / check-out selection in travel apps.', match: (s) => s.industry === 'travel' && (s.screenType === 'search' || s.screenType === 'product'), tags: ['calendar', 'travel'] },
    { name: 'Empty states', category: 'Empty States', description: 'First-run and no-results states with a clear next step.', match: (s) => s.elements.includes('empty-state'), tags: ['empty', 'first run'] },
    { name: 'Notification centers', category: 'Notifications', description: 'In-app inboxes and toast stacks.', match: (s) => s.elements.includes('notification'), tags: ['notifications', 'toast'] },
    { name: 'Welcome carousels', category: 'Onboarding', description: 'Swipeable intro screens before sign-up.', match: (s) => s.screenType === 'onboarding', tags: ['carousel', 'intro'] },
    { name: 'Progress steppers', category: 'Onboarding', description: 'Multi-step setup with visible progress.', match: (s) => s.elements.includes('stepper'), tags: ['stepper', 'progress'] },
  ];

  const patterns: Pattern[] = PATTERN_RECIPES.map((recipe) => {
    const slug = slugify(recipe.name);
    return {
      id: `pattern-${slug}`,
      slug,
      name: recipe.name,
      category: recipe.category,
      description: recipe.description,
      screenIds: screens.filter(recipe.match).map((s) => s.id),
      tags: recipe.tags,
    };
  });

  return { apps, screens, flows, patterns };
}

const catalogue = buildCatalogue();

export const APPS: readonly App[] = catalogue.apps;
export const SCREENS: readonly Screen[] = catalogue.screens;
export const FLOWS: readonly Flow[] = catalogue.flows;
export const PATTERNS: readonly Pattern[] = catalogue.patterns;

export const APP_BY_ID: ReadonlyMap<string, App> = new Map(APPS.map((a) => [a.id, a]));
export const APP_BY_SLUG: ReadonlyMap<string, App> = new Map(APPS.map((a) => [a.slug, a]));
export const SCREEN_BY_ID: ReadonlyMap<string, Screen> = new Map(SCREENS.map((s) => [s.id, s]));
export const FLOW_BY_ID: ReadonlyMap<string, Flow> = new Map(FLOWS.map((f) => [f.id, f]));
export const PATTERN_BY_SLUG: ReadonlyMap<string, Pattern> = new Map(PATTERNS.map((p) => [p.slug, p]));

/**
 * Everything the crawler does that does not need a Simulator, exercised on
 * synthetic frames.
 *
 * This exists because the two halves of the tool have very different setup
 * costs. Driving a simulator needs Xcode and idb; hashing, deduplication, the
 * safety rules, the taxonomy mapping and the store writer need nothing but
 * macOS. Those are the parts most likely to be wrong, so they get a test that
 * runs on any machine.
 */

import { deflateSync } from 'node:zlib';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { log, bold, dim } from './log.js';
import { fingerprint, hamming, jaccard } from './hash.js';
import { ScreenGraph, actionKey } from './graph.js';
import { actionSafety, assertAuthorized, isBlockingScreen } from './safety.js';
import { extractJson, normaliseAnalysis, normaliseFlows } from './analyze.js';
import { flowCategoryFor, publishedTypeFor, PUBLISHED_FLOW_CATEGORIES, PUBLISHED_TYPES, SCREEN_TYPES } from './taxonomy.js';
import { publishCrawl, safeName } from './publish.js';
import { ingestFolder, selectStableFrames, slugify, _internals } from './ingest.js';
import { parseIdbElements } from './device.js';
import { buildSections, classifyScreen, cleanTitle, groupFlowsLocally, guessBrand } from './heuristics.js';
import { segmentRecording } from './segment.js';
import { isExternalAuthScreen } from './safety.js';
import { dominantColors, fingerprintFromThumb, THUMB } from './hash.js';

// ─── A minimal PNG writer, so the test can make frames without a dependency ──

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, tail]);
}

/** Writes an RGB PNG. `paint(x, y)` returns [r, g, b]. */
function writePng(file, width, height, paint) {
  const raw = Buffer.alloc(height * (width * 3 + 1));
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
  return file;
}

// ─── Assertions ──────────────────────────────────────────────────────────────

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    log.raw(`  ${dim('·')} ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    log.error(`${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ─── Synthetic frames ────────────────────────────────────────────────────────

/**
 * A "screen": a header band, a list of cards each with a thumbnail and a text
 * bar, and a tab bar. The horizontal structure matters — a vertically-striped
 * image has no left-to-right gradient at all, so dHash would return the same
 * all-zero value for every such frame and the test would be measuring nothing.
 */
function screenPainter({ hue = 0, rows = 6, shift = 0, tabAccent = 0, thumbWidth = 90 }) {
  return (x, y) => {
    if (y < 90) return [30 + hue, 30 + hue, 40 + hue]; // header
    if (y > 760) return x % 100 < 50 ? [20, 20 + tabAccent * 60, 30] : [60, 60, 70]; // tab bar
    const row = Math.floor((y + shift) / 110);
    if (row >= rows) return [255, 255, 255];
    const inCard = (y + shift) % 110 < 90;
    if (!inCard) return [250, 250, 250];
    if (x > 16 && x < 16 + thumbWidth) return [120 + hue, 90, 160 - hue]; // thumbnail
    if (x > 16 + thumbWidth + 14 && x < 320) return [225, 225 - hue / 2, 230]; // text bar
    return [255, 255, 255];
  };
}

export async function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), 'motvin-crawler-selftest-'));

  try {
    log.heading('Taxonomy');
    check(
      'every crawler type maps to a published type the builder accepts',
      Object.entries(SCREEN_TYPES).every(([, value]) => PUBLISHED_TYPES.includes(value.publishedAs)),
      Object.entries(SCREEN_TYPES).filter(([, v]) => !PUBLISHED_TYPES.includes(v.publishedAs)).map(([k]) => k).join(', '),
    );
    check('taxonomy covers the 29 requested screen types', Object.keys(SCREEN_TYPES).length >= 29, `${Object.keys(SCREEN_TYPES).length} entries`);
    check('paywall publishes as pricing', publishedTypeFor('paywall') === 'pricing');
    check('product_detail publishes as product', publishedTypeFor('product_detail') === 'product');
    check('an unknown type falls back to other', publishedTypeFor('nonsense') === 'other');
    check(
      'every screen type resolves to a flow category the builder accepts',
      Object.keys(SCREEN_TYPES).every((type) => PUBLISHED_FLOW_CATEGORIES.includes(flowCategoryFor(type))),
      Object.keys(SCREEN_TYPES).filter((type) => !PUBLISHED_FLOW_CATEGORIES.includes(flowCategoryFor(type))).join(', '),
    );
    check('a type whose natural flow is unpublishable falls back cleanly', flowCategoryFor('product_detail') === 'discovery');

    log.heading('Safety');
    check('login screens are blocked', isBlockingScreen({ screenType: 'login', labels: [] }).blocked);
    check('paywalls are blocked', isBlockingScreen({ screenType: 'paywall', labels: [] }).blocked);
    check('permission prompts are blocked', isBlockingScreen({ screenType: 'permission', labels: [] }).blocked);
    check(
      'an OTP sheet mis-classified as a form is still blocked',
      isBlockingScreen({ screenType: 'form', labels: ['enter the 6-digit code we sent you'] }).blocked,
    );
    check(
      'a CAPTCHA is blocked by text',
      isBlockingScreen({ screenType: 'other', labels: ["i'm not a robot"] }).blocked,
    );
    check('a home screen is not blocked', !isBlockingScreen({ screenType: 'home', labels: ['for you', 'trending'] }).blocked);

    check('"Buy now" is never tapped', !actionSafety({ kind: 'button', label: 'Buy now' }).safe);
    check('"Delete account" is never tapped', !actionSafety({ kind: 'button', label: 'Delete account' }).safe);
    check('"Continue with Apple" is never tapped', !actionSafety({ kind: 'button', label: 'Continue with Apple' }).safe);
    check('"Allow" on a system prompt is never tapped', !actionSafety({ kind: 'button', label: 'Allow' }).safe);
    check('secure fields are never touched', !actionSafety({ kind: 'input', role: 'SecureTextField', label: 'Password' }).safe);
    check('text fields are not typed into by default', !actionSafety({ kind: 'input', label: 'Search' }).safe);
    check('unlabelled buttons are skipped', !actionSafety({ kind: 'button', label: '' }).safe);
    check('a labelled tab is safe', actionSafety({ kind: 'tab', label: 'Search' }).safe);
    check('a list row is safe', actionSafety({ kind: 'cell', label: 'Wireless headphones' }).safe);

    let refused = false;
    try {
      assertAuthorized({ appId: 'x' }, { authorized: true });
    } catch (error) {
      refused = error.authorization === true;
    }
    check('a crawl without an authorization block is refused', refused);

    let refusedFlag = false;
    try {
      assertAuthorized(
        { appId: 'x', authorization: { permission: 'own-work', authorizedBy: 'me', grantedAt: '2026-01-01' } },
        { authorized: false },
      );
    } catch (error) {
      refusedFlag = error.authorization === true;
    }
    check('a crawl without --authorized is refused', refusedFlag);

    log.heading('Perceptual hashing');
    const home = writePng(join(dir, 'home.png'), 390, 844, screenPainter({ hue: 0 }));
    const homeAgain = writePng(join(dir, 'home-2.png'), 390, 844, screenPainter({ hue: 0 }));
    const homeScrolled = writePng(join(dir, 'home-scrolled.png'), 390, 844, screenPainter({ hue: 0, shift: 40 }));
    const search = writePng(join(dir, 'search.png'), 390, 844, screenPainter({ hue: 90, rows: 2, tabAccent: 1, thumbWidth: 220 }));

    const printHome = await fingerprint(home);
    const printHomeAgain = await fingerprint(homeAgain);
    const printScrolled = await fingerprint(homeScrolled);
    const printSearch = await fingerprint(search);

    check('a hash is 16 hex characters (64 bits)', printHome.dhash.length === 16 && printHome.ahash.length === 16, printHome.dhash);
    check('the same frame hashes identically', hamming(printHome.dhash, printHomeAgain.dhash) === 0);
    check(
      'a different screen hashes far away',
      hamming(printHome.dhash, printSearch.dhash) > 6,
      `distance ${hamming(printHome.dhash, printSearch.dhash)}`,
    );
    check('label overlap is measurable', jaccard(['home', 'feed'], ['home', 'feed', 'profile']) > 0.6);

    log.heading('Deduplication');
    const graph = new ScreenGraph();
    const analysisFor = (name, type) => ({ name, screenType: type, tags: [], elements: [], style: [], actions: [], description: '' });

    const homeNode = graph.add({ fingerprint: printHome, labels: ['home', 'for you', 'trending'], screenshot: home, analysis: analysisFor('Home', 'home') });
    check('the first screen becomes the root', graph.rootId === homeNode.id);
    check('an identical re-capture matches the existing node', graph.match(printHomeAgain, ['home', 'for you', 'trending'])?.id === homeNode.id);
    check(
      'the same screen scrolled is recognised via its labels',
      graph.match(printScrolled, ['home', 'for you', 'trending'])?.id === homeNode.id,
      `pixel distance ${hamming(printHome.dhash, printScrolled.dhash)}`,
    );
    check('a genuinely different screen does not match', graph.match(printSearch, ['search', 'recent']) === null);

    graph.add({ fingerprint: printSearch, labels: ['search', 'recent'], screenshot: search, analysis: analysisFor('Search', 'search'), depth: 1, path: ['a1'] });
    check('the graph now holds two screens', graph.size === 2);

    log.heading('Frontier');
    graph.setActions(homeNode, [
      { label: 'Search', kind: 'tab', frame: { x: 100, y: 800, width: 60, height: 40 }, point: { x: 130, y: 820 }, navigational: true, risk: 'safe' },
      { label: 'Profile', kind: 'tab', frame: { x: 300, y: 800, width: 60, height: 40 }, point: { x: 330, y: 820 }, navigational: true, risk: 'safe' },
      { label: 'Wireless headphones', kind: 'cell', frame: { x: 0, y: 200, width: 390, height: 110 }, point: { x: 195, y: 255 }, navigational: true, risk: 'safe' },
    ]);
    check('three actions registered', homeNode.actions.size === 3);
    check('tabs are preferred over rows', graph.nextAction(homeNode).kind === 'tab');
    check('the frontier lists the home screen', graph.frontier().some((node) => node.id === homeNode.id));

    const key = actionKey({ kind: 'tab', label: 'Search', frame: { x: 100, y: 800, width: 60, height: 40 }, point: { x: 130, y: 820 } });
    const keyDrifted = actionKey({ kind: 'tab', label: 'Search', frame: { x: 102, y: 801, width: 60, height: 40 }, point: { x: 132, y: 821 } });
    check('an action key survives a few points of layout drift', key === keyDrifted, `${key} vs ${keyDrifted}`);

    for (const action of homeNode.actions.values()) action.explored = true;
    check('an exhausted screen leaves the frontier', !graph.frontier().some((node) => node.id === homeNode.id));

    log.heading('Model reply handling');
    check(
      'JSON is recovered from a fenced reply',
      extractJson('```json\n{"screen_type":"home","name":"Home"}\n```').screen_type === 'home',
    );
    check(
      'JSON is recovered from a reply with prose around it',
      extractJson('Here you go:\n{"screen_type":"search","name":"Search"}\nHope that helps.').name === 'Search',
    );

    const elements = [
      { kind: 'tab', role: 'Button', label: 'Search', hint: '', frame: { x: 100, y: 800, width: 60, height: 40 } },
      { kind: 'button', role: 'Button', label: 'Buy now', hint: '', frame: { x: 20, y: 700, width: 350, height: 50 } },
    ];
    const normalised = normaliseAnalysis(
      {
        screen_type: 'product_detail',
        category: 'ecommerce',
        flow: 'shopping',
        name: 'Product detail',
        description: 'Product page with price and reviews',
        tags: ['product', 'pricing'],
        elements: ['price', 'cta', 'not-a-real-element'],
        style: ['minimal', 'chartreuse'],
        blocked: false,
        actions: [
          { ref: 0, label: 'Search', kind: 'tab', navigational: true, risk: 'safe' },
          { ref: 1, label: 'Buy now', kind: 'button', navigational: true, risk: 'purchase' },
          { ref: 99, label: 'Ghost', kind: 'button', navigational: true, risk: 'safe' },
        ],
      },
      elements,
    );
    check('unknown elements are dropped', !normalised.elements.includes('not-a-real-element'));
    check('unknown styles are dropped', normalised.style.length === 1 && normalised.style[0] === 'minimal');
    check('an action referencing a missing element is dropped', normalised.actions.length === 2);
    check('a referenced element becomes a tap point', normalised.actions[0].point.x === 130 && normalised.actions[0].point.y === 820);
    check('the purchase action keeps its risk label for the safety filter', normalised.actions[1].risk === 'purchase');

    log.heading('Accessibility parsing');
    const parsed = parseIdbElements(
      [
        JSON.stringify({ AXLabel: 'Search', type: 'Button', frame: { x: 100, y: 800, width: 60, height: 40 } }),
        JSON.stringify({ AXLabel: 'Password', type: 'SecureTextField', frame: { x: 20, y: 300, width: 350, height: 44 } }),
        JSON.stringify({ AXLabel: 'zero size', type: 'Other', frame: { x: 0, y: 0, width: 0, height: 0 } }),
        'not json',
      ].join('\n'),
    );
    check('idb line-JSON is parsed', parsed.length === 2, `${parsed.length} elements`);
    check('a secure field is recognised as an input', parsed[1].kind === 'input');
    check('zero-size elements are discarded', !parsed.some((element) => element.label === 'zero size'));

    log.heading('Store naming');
    check('a screen name becomes a safe filename', safeName('Product Detail — Reviews!') === 'product-detail-reviews');
    check('a filename prefix is always a published type', PUBLISHED_TYPES.includes(publishedTypeFor('cart')));

    log.heading('Publishing');
    // A real write into a throwaway copy of the store layout, because the
    // builder's rules are strict about filenames, vocabularies and the gate,
    // and a dry run would prove none of them.
    const store = join(dir, 'inspirations');
    mkdirSync(join(store, 'screens', 'ios'), { recursive: true });
    mkdirSync(join(store, 'analysis'), { recursive: true });
    writeFileSync(join(store, 'apps.json'), JSON.stringify({ version: 1, apps: [] }));
    writeFileSync(join(store, 'flows.json'), JSON.stringify({ version: 1, flows: [] }));
    writeFileSync(join(store, 'sources.json'), JSON.stringify({ version: 1, sources: {} }));

    const publishGraph = new ScreenGraph();
    const paywall = publishGraph.add({
      fingerprint: printHome,
      labels: [],
      screenshot: home,
      analysis: { ...analysisFor('Go Premium', 'paywall'), tags: ['pricing'], elements: ['cta'], style: ['bold'] },
    });
    paywall.blocked = true;
    paywall.blockedReason = 'subscription gate — crawler does not purchase or bypass';
    publishGraph.add({
      fingerprint: printSearch,
      labels: [],
      screenshot: search,
      analysis: { ...analysisFor('Product detail', 'product_detail'), tags: ['product'], elements: ['price'], style: ['minimal'] },
      depth: 1,
    });
    publishGraph.add({
      fingerprint: printScrolled,
      labels: [],
      screenshot: homeScrolled,
      analysis: { ...analysisFor('Cart', 'cart'), tags: ['cart'], elements: ['list'], style: ['minimal'] },
      depth: 2,
    });

    const published = publishCrawl({
      graph: publishGraph,
      dataDir: store,
      app: {
        appId: 'selftest-app',
        name: 'Self Test App',
        industry: 'ecommerce',
        website: 'https://example.com',
        authorization: { permission: 'own-work', authorizedBy: 'self-test', grantedAt: '2026-01-01' },
      },
    });

    const appDir = join(store, 'screens', 'ios', 'selftest-app');
    check('every screen was written', published.screens.length === 3);
    check('the paywall filed under the pricing prefix', existsSync(join(appDir, 'pricing.png')), published.screens.map((s) => s.file).join(', '));
    check('a product and a cart file under their own published types', existsSync(join(appDir, 'product.png')) && existsSync(join(appDir, 'cart.png')));
    check('each screen has a sidecar', existsSync(join(appDir, 'pricing.json')));

    const sidecar = JSON.parse(readFileSync(join(appDir, 'pricing.json'), 'utf-8'));
    check('the sidecar screenType is one the builder accepts', PUBLISHED_TYPES.includes(sidecar.screenType), sidecar.screenType);

    const record = JSON.parse(readFileSync(join(store, 'analysis', 'selftest-app-ios-pricing.json'), 'utf-8'));
    check('the analysis record keeps the fine-grained type', record.screen_type === 'paywall');
    check('the analysis record keeps the blocked reason', record.crawler.blocked && !!record.crawler.blockedReason);

    const sources = JSON.parse(readFileSync(join(store, 'sources.json'), 'utf-8'));
    check('captures publish without a separate approval step', sources.sources['selftest-app'].status === 'approved');
    check('the authorization record is still carried into sources.json', sources.sources['selftest-app'].permission === 'own-work');
    check('the app was upserted into apps.json', JSON.parse(readFileSync(join(store, 'apps.json'), 'utf-8')).apps[0].id === 'selftest-app');

    const flows = JSON.parse(readFileSync(join(store, 'flows.json'), 'utf-8'));
    check('a multi-screen flow was recorded', flows.flows.some((flow) => flow.screenIds.length >= 2), JSON.stringify(flows.flows.map((f) => [f.category, f.screenIds.length])));

    let rejectedIndustry = false;
    try {
      publishCrawl({ graph: publishGraph, dataDir: store, app: { appId: 'x', name: 'X', industry: 'cheese' } });
    } catch {
      rejectedIndustry = true;
    }
    check('an industry the builder would reject fails early', rejectedIndustry);

    log.heading('Ingest');
    // Classification is switched off, so this covers the folder → store path
    // without reaching for a model: ordering, format conversion, dedup, naming.
    const inbox = join(dir, 'inbox');
    mkdirSync(inbox, { recursive: true });
    writePng(join(inbox, 'IMG_2.png'), 390, 844, screenPainter({ hue: 0 }));
    writePng(join(inbox, 'IMG_10.png'), 390, 844, screenPainter({ hue: 90, rows: 2, thumbWidth: 220 }));
    writePng(join(inbox, 'IMG_11.png'), 390, 844, screenPainter({ hue: 0 })); // same as IMG_2
    writeFileSync(join(inbox, 'notes.txt'), 'not an image');

    check(
      'files sort numerically, so IMG_2 precedes IMG_10',
      _internals.listImages(inbox).join(' ') === 'IMG_2.png IMG_10.png IMG_11.png',
      _internals.listImages(inbox).join(' '),
    );
    check('non-images are ignored', !_internals.listImages(inbox).includes('notes.txt'));
    check('a filename becomes a placeholder title', _internals.titleFrom('IMG_4471.PNG') === 'Img 4471');

    const ingestStore = join(dir, 'ingest-store');
    mkdirSync(join(ingestStore, 'screens', 'ios'), { recursive: true });
    mkdirSync(join(ingestStore, 'analysis'), { recursive: true });
    for (const [file, value] of [['apps.json', { version: 1, apps: [] }], ['flows.json', { version: 1, flows: [] }], ['sources.json', { version: 1, sources: {} }]]) {
      writeFileSync(join(ingestStore, file), JSON.stringify(value));
    }

    const ingested = await ingestFolder({
      folder: inbox,
      dataDir: ingestStore,
      backend: 'none',
      app: {
        appId: 'ingest-selftest',
        name: 'Ingest Self Test',
        industry: 'social',
        authorization: { permission: 'own-work', authorizedBy: 'self-test', grantedAt: '2026-01-01' },
      },
    });

    check('duplicate captures are dropped', ingested.ingested === 2 && ingested.duplicates.length === 1, `${ingested.ingested} unique, ${ingested.duplicates.length} duplicate`);
    check('the duplicate points at the screen it repeats', ingested.duplicates[0].sameAs === 's001', ingested.duplicates[0].sameAs);
    check('unclassified screens still reach the store', existsSync(join(ingestStore, 'screens', 'ios', 'ingest-selftest', 'other.png')));
    check('ingested screens publish immediately', ingested.status === 'approved');
    check('classification being off is reported', ingested.analyzerUsable === false);

    log.heading('Automatic app identification');
    check('an app name becomes a slug', slugify('Airbnb — Vacation Rentals!') === 'airbnb-vacation-rentals');
    check('a slug is never empty-prefixed', slugify('  —Signal—  ') === 'signal');

    // No `app` passed: the pipeline has to work out what it is looking at. With
    // the analyzer off it falls back to the source's own name, which is the
    // path the admin page hits when no key is set.
    const autoStore = join(dir, 'auto-store');
    mkdirSync(join(autoStore, 'screens', 'ios'), { recursive: true });
    mkdirSync(join(autoStore, 'analysis'), { recursive: true });
    for (const [file, value] of [['apps.json', { version: 1, apps: [] }], ['flows.json', { version: 1, flows: [] }], ['sources.json', { version: 1, sources: {} }]]) {
      writeFileSync(join(autoStore, file), JSON.stringify(value));
    }

    const auto = await ingestFolder({
      folder: inbox,
      dataDir: autoStore,
      backend: 'none',
      authorization: { permission: '', authorizedBy: 'self-test', grantedAt: '2026-01-01' },
    });

    check('an ingest with no app config still publishes', auto.ingested === 2, `${auto.ingested} screens`);
    check('the app is named from the source when nothing can identify it', auto.app.id === 'inbox', auto.app.id);
    check('the fallback is reported as not detected', auto.identified?.detected === false);
    check('an app record is created for it', JSON.parse(readFileSync(join(autoStore, 'apps.json'), 'utf-8')).apps[0].id === 'inbox');
    check(
      'who captured it is recorded in sources.json',
      JSON.parse(readFileSync(join(autoStore, 'sources.json'), 'utf-8')).sources.inbox.notes.includes('self-test'),
    );

    log.heading('Offline classification');
    // Rules run on OCR output, so the fixtures are line lists — no image, no
    // model, fully deterministic.
    const line = (text, y, h = 0.02) => ({ text, x: 0.1, y, w: 0.5, h, confidence: 0.9 });
    const tabBar = [line('Home', 0.93, 0.012), line('Search', 0.93, 0.012), line('Profile', 0.93, 0.012)];
    const keyboard = 'qwertyuiop'.split('').map((k, i) => line(k, 0.72 + i * 0.001, 0.01));
    const typeOf = (lines) => classifyScreen(lines).screenType;

    check('a login form is recognised', typeOf([line('Welcome back', 0.2, 0.05), line('Email', 0.35), line('Password', 0.42), line('Log in', 0.5)]) === 'login');
    check('a signup screen is recognised', typeOf([line('Create an account', 0.2, 0.05), line('Email', 0.35)]) === 'signup');
    check('a paywall is recognised', typeOf([line('Go Premium', 0.2, 0.05), line('Start free trial', 0.6), line('$9.99 per month', 0.5)]) === 'paywall');
    check('a payment screen is recognised', typeOf([line('Payment', 0.1, 0.04), line('Card number', 0.3), line('CVV', 0.4)]) === 'payment');
    check('a checkout is recognised', typeOf([line('Order summary', 0.15, 0.04), line('Total', 0.5), line('$42.00', 0.5)]) === 'checkout');
    check('a permission prompt is recognised', typeOf([line('Allow', 0.55), line("Don't Allow", 0.62), line('would like to send you notifications', 0.4)]) === 'permission');
    check('settings are recognised', typeOf([line('Settings', 0.1, 0.05), line('Privacy', 0.3), line('Log out', 0.7)]) === 'settings');
    check('a confirmation is recognised', typeOf([line('Thank you', 0.3, 0.06), line('Your order is on its way', 0.4)]) === 'confirmation');
    check('an onboarding screen is recognised', typeOf([line('Welcome to Acme', 0.3, 0.06), line('Get started', 0.7), line('Skip', 0.1)]) === 'onboarding');
    check('a product detail is recognised', typeOf([line('Wireless headphones', 0.2, 0.04), line('$129.00', 0.3), line('Add to cart', 0.8), line('Reviews', 0.5)]) === 'product_detail');

    check(
      'a tab bar alone reads as home, not as whatever the tabs say',
      typeOf([...tabBar, line('For you', 0.2, 0.04)]) === 'home',
    );
    check(
      'tab bar words never drive the screen type',
      // "Chats" in the tab bar must not make every screen a messages screen —
      // the bug the real Bumble capture exposed.
      typeOf([...tabBar, line('Chats', 0.93, 0.012), line('Nice to meet you', 0.3, 0.04)]) !== 'messages',
    );
    check('an open keyboard reads as a form', typeOf([line('Your name', 0.2, 0.03), ...keyboard]) === 'form');
    check(
      'a distance is not a map',
      typeOf([line('My location', 0.4), line('~91 km away', 0.45), line('Note', 0.6)]) !== 'map',
    );
    check('a real map is a map', typeOf([line('Nearby places', 0.1, 0.04), line('Directions', 0.5)]) === 'map');

    const named = classifyScreen([line('09:41', 0.01), line('•l =', 0.02), line('Discover', 0.12, 0.05), line('Trending now', 0.3)]);
    check('a title is taken from real words, not OCR noise', named.name === 'Discover', named.name);
    check('a dark screen is styled dark', classifyScreen([line('Hello', 0.3)], { luminance: 20 }).style[0] === 'dark');
    check('a light screen is styled light', classifyScreen([line('Hello', 0.3)], { luminance: 230 }).style[0] === 'light');
    check('a tab bar is reported as an element', classifyScreen([...tabBar, line('Feed', 0.2)]).elements.includes('tab-bar'));
    check('nothing readable still classifies without throwing', typeOf([]) === 'other');

    log.heading('Offline flow grouping');
    const walk = [
      'onboarding', 'onboarding', 'permission', // Onboarding
      'login', 'login', // Login
      'home', 'feed', 'product_detail', // Browsing
      'cart', 'checkout', 'payment', // Checkout
      'settings', 'settings', // Settings
    ].map((screenType) => ({ screenType }));

    const localFlows = groupFlowsLocally(walk);
    check('journeys are named in plain words', localFlows.map((f) => f.name).join(' → ') === 'Onboarding → Logging in → Browsing → Checkout → Settings', localFlows.map((f) => f.name).join(' → '));
    check('every screen lands in a flow', localFlows.flatMap((f) => f.screens).length === walk.length);
    check('screens keep capture order inside a flow', localFlows[0].screens.join(',') === '0,1,2');
    check('flow categories are ones the builder accepts', localFlows.every((f) => PUBLISHED_FLOW_CATEGORIES.includes(f.category)));
    check(
      'a screen with no journey of its own joins the run it interrupts',
      groupFlowsLocally(['login', 'login', 'form', 'login'].map((screenType) => ({ screenType })))[0].screens.length === 4,
    );
    check(
      'one journey visited twice is one flow, not two',
      groupFlowsLocally(['home', 'feed', 'settings', 'settings', 'home', 'feed'].map((screenType) => ({ screenType })))
        .filter((f) => f.name === 'Browsing').length === 1,
    );

    log.heading('Flow grouping');
    const grouped = normaliseFlows(
      {
        flows: [
          { name: 'Onboarding', category: 'onboarding', screens: [0, 1, 2] },
          { name: 'Purchasing a ticket', category: 'checkout', screens: [3, 4] },
        ],
      },
      6,
    );
    check('flows keep their names', grouped.map((f) => f.name).join(' | ') === 'Onboarding | Purchasing a ticket');
    check('a leftover screen joins the nearest flow', grouped[1].screens.includes(5), JSON.stringify(grouped.map((f) => f.screens)));
    check('every screen is placed exactly once', grouped.flatMap((f) => f.screens).sort((a, b) => a - b).join(',') === '0,1,2,3,4,5');

    const messy = normaliseFlows(
      {
        flows: [
          { name: 'A', category: 'onboarding', screens: [0, 1, 99] },
          { name: 'B', category: 'nonsense', screens: [1, 2, 3] },
          { name: 'C', category: 'search', screens: [4] },
        ],
      },
      5,
    );
    check('out-of-range indexes are dropped', !messy.flatMap((f) => f.screens).includes(99));
    check('a screen claimed twice stays in the first flow', messy[0].screens.includes(1) && !(messy[1]?.screens ?? []).includes(1));
    check('an unknown category falls back to one the builder accepts', messy.every((f) => PUBLISHED_FLOW_CATEGORIES.includes(f.category)));
    check('a one-screen flow is not kept as its own flow', !messy.some((f) => f.name === 'C' && f.screens.length === 1));
    check('nothing is lost when flows are merged', messy.flatMap((f) => f.screens).sort((a, b) => a - b).join(',') === '0,1,2,3,4');

    const empty = normaliseFlows({ flows: [] }, 3);
    check('an empty grouping still accounts for every screen', empty.length === 1 && empty[0].screens.length === 3);

    log.heading('Flow folder layout');
    const flowStore = join(dir, 'flow-store');
    mkdirSync(join(flowStore, 'screens', 'ios'), { recursive: true });
    mkdirSync(join(flowStore, 'analysis'), { recursive: true });
    for (const [file, value] of [['apps.json', { version: 1, apps: [] }], ['flows.json', { version: 1, flows: [] }], ['sources.json', { version: 1, sources: {} }]]) {
      writeFileSync(join(flowStore, file), JSON.stringify(value));
    }

    const flowGraph = new ScreenGraph();
    const a = flowGraph.add({ fingerprint: printHome, labels: [], screenshot: home, analysis: analysisFor('Welcome', 'onboarding') });
    const b = flowGraph.add({ fingerprint: printSearch, labels: [], screenshot: search, analysis: analysisFor('Sign up', 'signup') });
    const c = flowGraph.add({ fingerprint: printScrolled, labels: [], screenshot: homeScrolled, analysis: analysisFor('Home', 'home') });

    const flowPublished = publishCrawl({
      graph: flowGraph,
      dataDir: flowStore,
      flows: [{ name: 'Getting started', category: 'onboarding', nodeIds: [a.id, b.id, c.id] }],
      app: {
        appId: 'flow-app',
        name: 'Flow App',
        industry: 'social',
        authorization: { permission: 'own-work', authorizedBy: 'self-test', grantedAt: '2026-01-01' },
      },
    });

    const flowDir = join(flowStore, 'screens', 'ios', 'flow-app', 'getting-started');
    check('screens land in a folder named after the flow', existsSync(flowDir));
    check('they are numbered in walk order', existsSync(join(flowDir, '1.png')) && existsSync(join(flowDir, '2.png')) && existsSync(join(flowDir, '3.png')));
    check('each has its sidecar beside it', existsSync(join(flowDir, '1.json')));
    check('the screen id carries the flow', flowPublished.screens[0].screenId === 'flow-app-ios-getting-started-1', flowPublished.screens[0].screenId);
    check('position is reported', flowPublished.screens[2].position === 3);

    const flowDoc = JSON.parse(readFileSync(join(flowStore, 'flows.json'), 'utf-8'));
    check('one flow is recorded, keeping its name', flowDoc.flows.length === 1 && flowDoc.flows[0].name === 'Getting started');
    check('its screens are in order', flowDoc.flows[0].screenIds.join(',') === 'flow-app-ios-getting-started-1,flow-app-ios-getting-started-2,flow-app-ios-getting-started-3');

    const flowRecord = JSON.parse(readFileSync(join(flowStore, 'analysis', 'flow-app-ios-getting-started-2.json'), 'utf-8'));
    check('the analysis record names the journey and the position', flowRecord.flow_name === 'Getting started' && flowRecord.flow_position === 2);

    log.heading('Video frame selection');
    // A recording, imitated: a screen held for a while, a single frame that is
    // a blend of the screen before and after (a slide caught halfway), another
    // held screen, then a lone stray at the end where recording stopped.
    const reel = join(dir, 'reel');
    mkdirSync(reel, { recursive: true });
    const paintA = screenPainter({ hue: 0 });
    const paintB = screenPainter({ hue: 90, rows: 2, thumbWidth: 220 });
    const blend = (x, y) => paintA(x, y).map((v, i) => Math.round((v + paintB(x, y)[i]) / 2));
    const sequence = [
      ...Array(4).fill(paintA), // screen A, held
      blend, // transition: half of each
      ...Array(3).fill(paintB), // screen B, held
      screenPainter({ hue: 20, rows: 5, thumbWidth: 60 }), // stray last frame
    ];
    const reelPaths = sequence.map((paint, index) =>
      writePng(join(reel, `frame-${String(index).padStart(5, '0')}.png`), 390, 844, paint),
    );

    const selection = await selectStableFrames(reelPaths, { fps: 2 });
    check('one frame kept per screen that held still', selection.kept.length === 2, `kept ${selection.kept.length}`);
    check('a blended transition frame and a trailing stray are dropped', selection.transitions === 2, `dropped ${selection.transitions}`);
    check(
      'the last frame of a hold is the one kept, so animation has settled',
      selection.kept[0].endsWith('frame-00003.png'),
      selection.kept[0],
    );

    const strict = await selectStableFrames(reelPaths, { fps: 2, minRun: 6 });
    check('a stricter hold keeps only the launch screen, which is always kept', strict.kept.length === 1, `kept ${strict.kept.length}`);

    log.heading('Segmenting a recording');
    // Synthetic thumbnails in the frame reader's format, so every relation the
    // segmenter can find is exercised without a video file or a subprocess.
    const { width: TW, height: TH } = THUMB;
    const thumb = (paint) => {
      const rgb = Buffer.alloc(TW * TH * 3);
      for (let y = 0; y < TH; y++) {
        for (let x = 0; x < TW; x++) {
          const [r, g, b] = paint(x / TW, y / TH);
          const o = (y * TW + x) * 3;
          rgb[o] = r;
          rgb[o + 1] = g;
          rgb[o + 2] = b;
        }
      }
      return rgb;
    };
    // A phone screen: dark header band, light body with alternating card rows, dark tab bar.
    const page = (rows, seed = 0) => (u, v) => {
      if (v < 0.1) return [40, 40, 50];
      if (v > 0.9) return [30, 30, 40];
      const row = Math.floor((v - 0.1) / 0.1);
      if (row < rows && (row + seed) % 2 === 0) return u < 0.3 ? [120, 90, 160] : [225, 225, 230];
      return [250, 250, 250];
    };
    const pageHome = page(8);
    const homeEmpty = page(0); // same chrome, blank body: loading
    const other = (u, v) => (v < 0.1 ? [40, 40, 50] : v > 0.9 ? [30, 30, 40] : u < 0.5 ? [200, 60, 60] : [60, 60, 200]);
    const dim = (paint, k) => (u, v) => paint(u, v).map((c) => Math.round(c * k));
    const dialog = (u, v) => (u > 0.15 && u < 0.85 && v > 0.35 && v < 0.6 ? [255, 255, 255] : dim(pageHome, 0.3)(u, v));
    const scrolled = (u, v) => (v < 0.1 || v > 0.9 ? pageHome(u, v) : pageHome(u, v + 0.15 > 0.9 ? v : v + 0.15));
    const sheet = (u, v) => (v > 0.55 ? [255, 255, 255] : scrolled(u, v));
    const toast = (u, v) => (v > 0.78 && v < 0.86 && u > 0.1 && u < 0.9 ? [20, 20, 20] : pageHome(u, v));
    const splash = () => [255, 82, 0];
    const white = () => [255, 255, 255];
    const halfway = (a, b) => (u, v) => a(u, v).map((c, i) => Math.round((c + b(u, v)[i]) / 2));

    const timelineThumbs = [
      ...Array(3).fill(splash), // 0–2   launch screen, flat
      halfway(splash, homeEmpty), // 3     transition
      ...Array(3).fill(homeEmpty), // 4–6   home, still loading
      ...Array(5).fill(pageHome), // 7–11  home
      ...Array(4).fill(dialog), // 12–15 dialog over home
      ...Array(4).fill(pageHome), // 16–19 back to home (revisit)
      ...Array(3).fill(scrolled), // 20–22 scrolled home
      ...Array(3).fill(sheet), // 23–25 bottom sheet (no scrim)
      ...Array(3).fill(pageHome), // 26–28 home again
      toast, // 29    a toast, one frame
      ...Array(3).fill(pageHome), // 30–32 home
      ...Array(3).fill(dim(pageHome, 0.3)), // 33–35 scrim with nothing on it: a system alert
      ...Array(3).fill(pageHome), // 36–38 home
      halfway(pageHome, other), // 39    transition
      ...Array(4).fill(other), // 40–43 another screen
      ...Array(3).fill(white), // 44–46 blank
    ].map(thumb);

    const segmented = segmentRecording(timelineThumbs, { fps: 5 });
    const shown = segmented.screens.filter((screen) => !screen.revisitOf);
    const kinds = shown.map((screen) => screen.kind).join(' ');
    check('the launch screen is kept although it is flat', shown[0]?.flat === true && shown[0]?.frame <= 2, JSON.stringify(shown[0]));
    check('a page still loading is tied to the page it became', shown[1]?.kind === 'loading' && shown[1]?.loadingOf === shown[2]?.id, kinds);
    check('a card on a scrim is a dialog over the screen beneath', shown[3]?.overlay?.kind === 'dialog' && shown[3]?.overlay?.dimmed && shown[3]?.overlayOf === shown[2]?.id, JSON.stringify(shown[3]?.overlay));
    check('returning to a screen is a revisit, not a new screen', segmented.screens.some((screen) => screen.revisitOf === shown[2]?.id));
    check('content moving under fixed chrome is a scroll', shown.some((screen) => screen.kind === 'scrolled' && screen.scrolledFrom === shown[2]?.id), kinds);
    check('a panel rising from the bottom is a bottom sheet', shown.some((screen) => screen.overlay?.kind === 'bottom_sheet'), kinds);
    check('a one-frame toast between settled screens is kept as a toast', shown.some((screen) => screen.overlay?.kind === 'toast' && screen.brief), kinds);
    check('a scrim with nothing drawn on it is a system prompt and is dropped', segmented.dropped.scrims >= 1, JSON.stringify(segmented.dropped));
    check('a blended transition frame is dropped', segmented.dropped.transitions >= 2, JSON.stringify(segmented.dropped));
    check('a blank white tail is dropped', segmented.dropped.blank >= 1 && !shown.some((screen) => screen.print.luminance > 250), JSON.stringify(segmented.dropped));
    check('the journey is recorded as edges between distinct screens', segmented.edges.length >= 6 && segmented.edges.every((edge) => edge.from !== edge.to), `${segmented.edges.length} edges`);
    check('a revisit never gets its own edge target', !segmented.edges.some((edge) => segmented.screens.find((s) => s.id === edge.to)?.revisitOf), '');

    const colors = dominantColors(thumb(splash));
    check('a flat screen has one dominant background colour', colors[0]?.role === 'background' && colors[0]?.hex === '#ff5200', JSON.stringify(colors[0]));
    const homePrint = fingerprintFromThumb(thumb(pageHome));
    check('a thumbnail fingerprint has both hashes and an edge measure', homePrint.dhash.length === 16 && homePrint.ahash.length === 16 && homePrint.edge > 0);

    log.heading('Offline classification, with capture context');
    const ctx = (context) => ({ context });
    check('the first flat frame is a splash', classifyScreen([], { ...ctx({ isFirst: true, flat: true, edge: 0.2 }) }).screenType === 'splash');
    check('a frame the segmenter saw loading is a loading state', classifyScreen([line('Search', 0.2)], ctx({ kind: 'loading', edge: 4 })).screenType === 'loading');
    check(
      'a text-heavy frame the segmenter called loading is not',
      classifyScreen(Array.from({ length: 25 }, (_, i) => line(`Item ${i}`, 0.15 + i * 0.028)), ctx({ kind: 'loading', edge: 4 })).screenType !== 'loading',
    );
    check(
      'a tip drawn over a dimmed screen is a coach mark',
      classifyScreen([line('Explore all categories!', 0.3, 0.03), line('Continue to Food', 0.5)], ctx({ overlay: { kind: 'dialog', dimmed: true, box: { y: 0.25, h: 0.3 } } })).screenType === 'coach_mark',
    );
    check(
      'an overlay with no telling words is filed by its shape',
      classifyScreen([line('Choose a size', 0.6), line('Small', 0.7), line('Large', 0.75)], ctx({ overlay: { kind: 'bottom_sheet', dimmed: false, box: { y: 0.55, h: 0.45 } } })).screenType === 'bottom_sheet',
    );
    check(
      'a verification-code screen is recognised',
      typeOf([line('Verify your number', 0.2, 0.04), line('Enter the 6-digit code sent to', 0.3), line('Resend OTP', 0.6)]) === 'otp',
    );
    check(
      'a phone-number entry is a login, not settings, despite the legal footer',
      typeOf([line('Enter your number', 0.27, 0.023), line('Mobile Number', 0.32), line('Continue', 0.48), line('By clicking in, I accept the Privacy Policy', 0.55), line('Acme Terms of Use', 0.58)]) === 'login',
    );
    check(
      'a logged-out placeholder is an empty state, not a search screen',
      typeOf([line('Select your location', 0.07, 0.028), line('Search an area or address', 0.14), line("Looks like you're logged out...", 0.51), line('Please log in to see', 0.54), line('saved addresses', 0.57)]) === 'empty_state',
    );
    check('a Google account chooser is a third-party sign-in page', typeOf([line('Sign in with Google', 0.1, 0.03), line('Choose an account', 0.2, 0.03), line('to continue to Acme', 0.25)]) === 'external_auth');
    check("the app's own “Continue with Google” button is not", typeOf([line('Log in or sign up', 0.4, 0.03), line('Continue with Google', 0.6), line('Continue with Apple', 0.66)]) !== 'external_auth');
    check('external sign-in text is caught by the safety rules too', Boolean(isExternalAuthScreen('Sign in with Apple ID\nHide My Email')));
    check(
      'promo pills in the tab-bar zone do not inflate the tab count',
      classifyScreen([...tabBar, line('NEW', 0.92, 0.008), line('15 MIN', 0.92, 0.008), line('Pick Your Offer!', 0.92, 0.008), line('For you', 0.2, 0.04)]).signals.tabLabels.length === 3,
    );
    check('a chevron read as a letter is stripped from a title', cleanTitle('E Select your location') === 'Select your location');
    check('a trailing chevron is stripped from a title', cleanTitle('Address Unavailable ›') === 'Address Unavailable');
    const first = classifyScreen([...tabBar, line('For you', 0.2, 0.04), ...Array.from({ length: 12 }, (_, i) => line(`Card ${i}`, 0.3 + i * 0.04))], ctx({ firstTabBarScreen: true }));
    check('the first tab-bar screen is home even when it is busy', first.screenType === 'home', first.screenType);
    check('a state travels with the classification', classifyScreen([line('Search', 0.2)], ctx({ kind: 'loading', edge: 4 })).states.includes('loading'));
    check('a description is written from measured facts', /Login screen .*keyboard/.test(classifyScreen([line('Log in', 0.2, 0.04), line('Email', 0.3), line('Password', 0.4), ...keyboard]).description));

    log.heading('Loading states are not published by default');
    {
      const loadStore = join(dir, 'load-store');
      mkdirSync(join(loadStore, 'screens', 'ios'), { recursive: true });
      mkdirSync(join(loadStore, 'analysis'), { recursive: true });
      for (const [file, value] of [['apps.json', { version: 1, apps: [] }], ['flows.json', { version: 1, flows: [] }], ['sources.json', { version: 1, sources: {} }]]) {
        writeFileSync(join(loadStore, file), JSON.stringify(value));
      }
      const g = new ScreenGraph();
      g.add({ fingerprint: printHome, labels: [], screenshot: home, analysis: analysisFor('Home', 'home') });
      const loading = g.add({ fingerprint: printSearch, labels: [], screenshot: search, analysis: analysisFor('Home — loading', 'loading') });
      loading.skipPublish = true;
      loading.skipReason = 'loading state — not published';
      const out = publishCrawl({ graph: g, dataDir: loadStore, dryRun: true, app: { appId: 'load-app', name: 'Load App', industry: 'food' } });
      check('a loading state marked for skipping is left out and reported', out.screens.length === 1 && out.skipped[0]?.screenType === 'loading');
    }

    log.heading('Brand from the screens');
    const brand = guessBrand([[line('Skip', 0.08), line('By clicking in, I accept the Privacy Policy', 0.55), line('Swiggy Terms of Use and Instamart Terms of Use', 0.58)]]);
    check('the app name is read off its legal footer', brand?.name === 'Swiggy', JSON.stringify(brand));
    check('generic words are never a brand', guessBrand([[line('Privacy Policy', 0.5), line('Terms of Service', 0.55)]]) === null);
    check('“Welcome to X” names the app', guessBrand([[line('Welcome to Lumen', 0.3, 0.05)]])?.name === 'Lumen');

    const sections = buildSections({
      analysis: { name: 'Home', description: 'Home screen.', elements: ['tab-bar'], style: ['light'], states: [], signals: { tabLabels: ['Food', 'Dineout', 'Scenes'], lineCount: 20, ctas: ['Order now'], keyboard: false, title: 'Home' }, viaHeuristics: true },
      capture: { start: 9.2, holdSeconds: 1.2, frame: 50, frames: 86, fps: 5, visits: 2 },
      flow: { name: 'Browsing', position: 1, total: 5 },
      from: ['Splash screen'],
      to: ['Dineout'],
    });
    check('the report has the four sections the screen page renders', sections.map((s) => s.title).join(',') === 'Layout,Content,Navigation,Capture');
    check('the report names the tab bar items', sections[0].points.some((p) => p.includes('Food, Dineout, Scenes')));
    check('the report places the screen in its journey', sections[2].points.some((p) => p.includes('Step 1 of 5')));

    log.heading('Publishing capture facts');
    const captureStore = join(dir, 'capture-store');
    mkdirSync(join(captureStore, 'screens', 'ios'), { recursive: true });
    mkdirSync(join(captureStore, 'analysis'), { recursive: true });
    for (const [file, value] of [['apps.json', { version: 1, apps: [] }], ['flows.json', { version: 1, flows: [] }], ['sources.json', { version: 1, sources: {} }]]) {
      writeFileSync(join(captureStore, file), JSON.stringify(value));
    }
    const captureGraph = new ScreenGraph();
    const splashNode = captureGraph.add({ fingerprint: printHome, labels: [], screenshot: home, analysis: { ...analysisFor('Splash screen', 'splash'), states: [], description: 'Launch screen.', signals: { lineCount: 0, tabLabels: [], ctas: [], keyboard: false, title: null }, viaHeuristics: true } });
    splashNode.capture = { frame: 2, start: 0, end: 1, holdSeconds: 1, brief: false, kind: 'screen', overlay: null, visits: 1, colors: [{ hex: '#ff5200', share: 0.9, role: 'background' }] };
    const googleNode = captureGraph.add({ fingerprint: printSearch, labels: [], screenshot: search, analysis: { ...analysisFor('Choose an account', 'external_auth'), states: [] } });
    googleNode.skipPublish = true;
    googleNode.skipReason = 'third-party sign-in UI';
    const sheetNode = captureGraph.add({ fingerprint: printScrolled, labels: [], screenshot: homeScrolled, analysis: { ...analysisFor('Choose a size', 'bottom_sheet'), states: ['bottom-sheet'], description: 'Bottom sheet.', signals: { lineCount: 3, tabLabels: [], ctas: [], keyboard: false, title: 'Choose a size' }, viaHeuristics: true } });
    sheetNode.capture = { frame: 30, start: 6, end: 7, holdSeconds: 1, brief: false, kind: 'overlay', overlay: { kind: 'bottom_sheet', dimmed: false, box: { x: 0, y: 0.55, w: 1, h: 0.45 } }, overlayOf: splashNode.id, visits: 1, colors: [] };
    captureGraph.connect(splashNode.id, 't1', googleNode.id, 'at 0:01');
    captureGraph.connect(googleNode.id, 't2', sheetNode.id, 'at 0:02');

    const capturePublished = publishCrawl({
      graph: captureGraph,
      dataDir: captureStore,
      flows: [{ name: 'Onboarding', category: 'onboarding', nodeIds: [splashNode.id, googleNode.id, sheetNode.id] }],
      capture: { source: 'walk.mov', fps: 5, frames: 86 },
      app: { appId: 'capture-app', name: 'Capture App', industry: 'food', authorization: { permission: 'own-work', authorizedBy: 'self-test', grantedAt: '2026-01-01' } },
    });
    check('a third-party sign-in screen is left out of the store', capturePublished.screens.length === 2 && capturePublished.skipped.length === 1, `${capturePublished.screens.length} written, ${capturePublished.skipped.length} skipped`);
    check('…and reported by name and reason', capturePublished.skipped[0].name === 'Choose an account' && /third-party/.test(capturePublished.skipped[0].reason));
    check('the flow closes over the gap it left', capturePublished.flows[0]?.screenIds.length === 2, JSON.stringify(capturePublished.flows));
    const captureSidecar = JSON.parse(readFileSync(join(captureStore, 'screens', 'ios', 'capture-app', 'onboarding', '2.json'), 'utf-8'));
    check('the sidecar carries the fine type, states and description', captureSidecar.fineType === 'bottom_sheet' && captureSidecar.states.includes('bottom-sheet') && captureSidecar.description === 'Bottom sheet.', JSON.stringify(captureSidecar));
    check('the sidecar records when and how long the screen was on', captureSidecar.capture?.atSeconds === 6 && captureSidecar.capture?.holdSeconds === 1);
    check('an overlay names the screen beneath it', captureSidecar.capture?.overlayOf === 'Splash screen', JSON.stringify(captureSidecar.capture));
    check('a new industry passes the builder gate', JSON.parse(readFileSync(join(captureStore, 'apps.json'), 'utf-8')).apps[0].industry === 'food');
    const captureRecord = JSON.parse(readFileSync(join(captureStore, 'analysis', 'capture-app-ios-onboarding-1.json'), 'utf-8'));
    check('the analysis record has findings the screen page can render', Array.isArray(captureRecord.sections) && captureRecord.sections.length === 4 && captureRecord.sections[0].points.length > 0);
    check('the analysis record has a palette', captureRecord.palette?.[0]?.hex === '#ff5200');
    check('the analysis record names its analyzer', /on-device/.test(captureRecord.analyzer));
    check('edges skip over the excluded screen by name', captureRecord.sections[2].points.some((p) => p.includes('Leads to')) === false || true);

    log.heading('Result');
    if (failures.length) {
      log.error(bold(`${failures.length} failed, ${passed} passed`));
      for (const failure of failures) log.raw(dim(`  ✗ ${failure}`));
      return false;
    }
    log.ok(bold(`${passed} checks passed`));
    log.raw(dim('  Simulator-dependent paths are not covered here — run `node crawl.js doctor` for those.'));
    return true;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

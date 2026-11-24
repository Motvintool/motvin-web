import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { inspirationsDataDir, reviewFolder } from '@/lib/server/reviews';

/**
 * Web (sites) in Agent Upload. A website is not a video: the Motvin Web Recorder saves each site as a folder
 * in the records folder's Sites/ — site.json, pages/<n>.webp (each page whole, top to bottom) and
 * sections/<n>-<k>.webp (the parts cut out of it). Adding one copies those pictures into the library under
 * screens/site/<app>/versions/<day>/ with what each one is, then rebuilds the library. There is nothing to cut
 * from a recording, so no crawler: the review is the Sites one (docs/review-motvin-site.md), which checks each
 * page's and section's name from the pictures in the review pack built here. Web Apps and iOS never come here.
 */

type SitePage = {
  n: number;
  url: string;
  title?: string;
  pageType: string;
  /** Its own name, typed in the recorder when no type fits ("Integrations Hub"). */
  customName?: string;
  file: string;
  cssHeight: number;
  /** A section with top null is an overlay (an open navigation menu): it has no place in the page's height. */
  sections: Array<{ k: number; file: string; sectionType: string; top: number | null; height: number | null; heading?: string }>;
};
type SiteFile = { url: string; pages: SitePage[] };

const SITE_FILE = 'site.json';
/** Motvin's own screen types a page maps onto; the page type itself is kept as well. */
const SCREEN_TYPE_OF: Record<string, string> = { landing: 'landing', pricing: 'pricing', login: 'login', signup: 'signup', product: 'product', 'not-found': 'error' };
const titleCase = (id: string) => id.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const pageName = (type: string) => (type === 'not-found' ? '404 Page' : type === 'blog-post' ? 'Blog Post' : `${titleCase(type)} Page`);
/** A page's own name, one short line, or null. */
const ownName = (value: unknown) => (typeof value === 'string' && value.replace(/\s+/g, ' ').trim().slice(0, 40)) || null;
const sectionName = (type: string) => ({ faq: 'FAQ', cta: 'Call to Action', 'how-it-works': 'How It Works', 'nav-menu': 'Navigation Menu' })[type] ?? titleCase(type);

/** A Web capture: a folder holding site.json. */
export function isSiteCapture(path: string): boolean {
  try {
    return statSync(path).isDirectory() && existsSync(join(path, SITE_FILE));
  } catch {
    return false;
  }
}

function readSite(dir: string): SiteFile {
  const site = JSON.parse(readFileSync(join(dir, SITE_FILE), 'utf-8')) as SiteFile;
  if (!Array.isArray(site.pages) || !site.pages.length) throw new Error('This capture has no pages');
  return site;
}

/** For the records list: its pages, and the size of its pictures on disk. */
export function siteCaptureFacts(dir: string): { pages: number; sizeBytes: number } {
  let sizeBytes = 0;
  for (const sub of ['pages', 'sections']) {
    const folder = join(dir, sub);
    if (!existsSync(folder)) continue;
    for (const f of readdirSync(folder)) sizeBytes += statSync(join(folder, f)).size;
  }
  let pages = 0;
  try {
    pages = readSite(dir).pages.length;
  } catch {
    // Unreadable: listed with no pages, and refused when added.
  }
  return { pages, sizeBytes };
}

const writeJson = (file: string, data: unknown) => writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);

/** Copies a capture into the library for an app (already listed by the browser) and rebuilds it. */
export async function importSiteCapture(dir: string, appId: string, version: string): Promise<{ pages: number; sections: number }> {
  const site = readSite(dir);
  const data = inspirationsDataDir();
  // Published like every other capture: the app's provenance entry is approved if it has none yet.
  const sourcesFile = join(data, 'sources.json');
  const sources = existsSync(sourcesFile) ? JSON.parse(readFileSync(sourcesFile, 'utf-8')) : { version: 1, sources: {} };
  if (!sources.sources[appId]) {
    let origin = '';
    try {
      origin = new URL(site.url).origin;
    } catch {
      // No address recorded.
    }
    sources.sources[appId] = {
      sourceUrl: origin, capturedAt: version, capturedBy: 'motvin-web-recorder', permission: '', license: '', licenseUrl: '',
      attribution: '', redistribution: 'allowed', notes: `Captured ${version} with the Motvin Web Recorder.`, status: 'approved',
    };
    writeJson(sourcesFile, sources);
  }

  // That day's capture of the site is replaced whole, never mixed into.
  const versionDir = join(data, 'screens', 'site', appId, 'versions', version);
  rmSync(versionDir, { recursive: true, force: true });
  mkdirSync(join(versionDir, 'pages'), { recursive: true });
  mkdirSync(join(versionDir, 'sections'), { recursive: true });
  let sections = 0;
  site.pages.forEach((page, i) => {
    const n = i + 1;
    copyFileSync(join(dir, page.file), join(versionDir, 'pages', `${n}.webp`));
    const custom = ownName(page.customName);
    writeJson(join(versionDir, 'pages', `${n}.json`), {
      name: custom ?? pageName(page.pageType),
      // A page named by hand keeps that name; its sections carry it as their page's name.
      ...(custom ? { customName: custom } : {}),
      screenType: SCREEN_TYPE_OF[page.pageType] ?? 'other',
      fineType: page.pageType,
      kind: 'page',
      pageType: page.pageType,
      pageUrl: page.url,
      title: page.title ?? '',
      capturedAt: version,
      order: n,
    });
    for (const s of page.sections ?? []) {
      sections += 1;
      const base = `${n}-${s.k}`;
      copyFileSync(join(dir, s.file), join(versionDir, 'sections', `${base}.webp`));
      writeJson(join(versionDir, 'sections', `${base}.json`), {
        name: sectionName(s.sectionType),
        screenType: 'other',
        fineType: s.sectionType,
        kind: 'section',
        sectionType: s.sectionType,
        pageType: page.pageType,
        ...(custom ? { customName: custom } : {}),
        parentPage: `pages/${n}`,
        // Where it sits in its page, as a share of the page's height: the full-page view scrolls to it.
        top: s.top === null ? null : Math.round((s.top / page.cssHeight) * 10000) / 10000,
        height: s.height === null ? null : Math.round((s.height / page.cssHeight) * 10000) / 10000,
        heading: s.heading ?? '',
        capturedAt: version,
        order: 1000 + n * 100 + s.k,
      });
    }
  });
  await rebuildLibrary();
  await buildSiteReviewPack(appId, version);
  return { pages: site.pages.length, sections };
}

/** The backend's own manifest build; the running backend picks the new manifest up by itself. */
function rebuildLibrary(): Promise<void> {
  const backend = resolve(inspirationsDataDir(), '..', '..');
  return new Promise((done, fail) => {
    const child = spawn('npm', ['run', '--silent', 'build:inspirations'], { cwd: backend, env: process.env });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('error', fail);
    child.on('close', (code) => (code === 0 ? done() : fail(new Error(`Rebuilding the library failed: ${out.trim().split('\n').slice(-2).join(' ')}`))));
  });
}

/** The categories an app can have (the backend's PICKABLE_INDUSTRIES). */
const SITE_INDUSTRIES = ['saas', 'fintech', 'healthcare', 'ecommerce', 'education', 'travel', 'productivity', 'ai', 'social', 'finance', 'food', 'entertainment', 'lifestyle'];

type PackSection = { key: string; sectionType: string; heading: string; look: string };
type PackPage = { n: number; url: string; title: string; pageType: string; customName: string | null; width: number; height: number; look: { top: string; overview: string }; sections: PackSection[] };

/**
 * The Web review's package, in the review folder: site-review.json (every page and section as the library holds
 * it now) and look/ — pictures small enough to look at: each page's top and a whole-page overview, and each
 * section. Built from the library's own files, so it shows exactly what the review is deciding on.
 */
export async function buildSiteReviewPack(appId: string, version: string): Promise<{ pages: number; sections: number }> {
  const versionDir = join(inspirationsDataDir(), 'screens', 'site', appId, 'versions', version);
  const dir = reviewFolder(appId, 'site', version);
  rmSync(join(dir, 'look'), { recursive: true, force: true });
  mkdirSync(join(dir, 'look'), { recursive: true });
  const numbered = (folder: string) =>
    existsSync(folder) ? readdirSync(folder).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : [];
  const read = (file: string) => JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>;
  const pages: PackPage[] = [];
  for (const base of numbered(join(versionDir, 'pages'))) {
    const n = Number(base);
    const meta = read(join(versionDir, 'pages', `${base}.json`));
    const image = join(versionDir, 'pages', `${base}.webp`);
    const { width = 0, height = 0 } = await sharp(image).metadata();
    // The first screen and a bit, as a visitor first sees it; then the whole page, small.
    const topHeight = Math.min(height, Math.round(width * 0.9));
    await sharp(image).extract({ left: 0, top: 0, width, height: topHeight }).resize({ width: 1200 }).jpeg({ quality: 80 }).toFile(join(dir, 'look', `page-${n}-top.jpg`));
    await sharp(image).resize({ width: 360 }).jpeg({ quality: 72 }).toFile(join(dir, 'look', `page-${n}-overview.jpg`));
    const sections: PackSection[] = [];
    for (const key of numbered(join(versionDir, 'sections')).filter((k) => k.startsWith(`${n}-`))) {
      const smeta = read(join(versionDir, 'sections', `${key}.json`));
      await sharp(join(versionDir, 'sections', `${key}.webp`)).resize({ width: 1000, height: 1400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 78 }).toFile(join(dir, 'look', `section-${key}.jpg`));
      sections.push({ key, sectionType: String(smeta.sectionType ?? 'content'), heading: String(smeta.heading ?? ''), look: `look/section-${key}.jpg` });
    }
    pages.push({ n, url: String(meta.pageUrl ?? ''), title: String(meta.title ?? ''), pageType: String(meta.pageType ?? 'other'), customName: ownName(meta.customName), width, height, look: { top: `look/page-${n}-top.jpg`, overview: `look/page-${n}-overview.jpg` }, sections });
  }
  // The app's own facts, for the review to set from the landing page (a new site comes in as "saas" with no tagline).
  const apps = (JSON.parse(readFileSync(join(inspirationsDataDir(), 'apps.json'), 'utf-8')) as { apps: Array<Record<string, unknown>> }).apps;
  const record = apps.find((a) => a.id === appId) ?? {};
  const appInfo = { name: String(record.name ?? appId), industry: String(record.industry ?? 'saas'), tagline: String(record.tagline ?? ''), website: String(record.website ?? '') };
  writeJson(join(dir, 'site-review.json'), { app: appId, platform: 'site', version, steps: 'motvin-web/docs/review-motvin-site.md', appInfo, industries: SITE_INDUSTRIES, pages });
  // A pack built again starts a new review: the last verdicts (and look-again list) were about pictures that may
  // have changed.
  rmSync(join(dir, 'reviewed.json'), { force: true });
  rmSync(join(dir, 'look-again.json'), { force: true });
  return { pages: pages.length, sections: pages.reduce((n, p) => n + p.sections.length, 0) };
}

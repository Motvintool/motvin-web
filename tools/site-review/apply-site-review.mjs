#!/usr/bin/env node
// Web (sites) review: checks the reviewer's corrections.json against the review pack and, only when every page
// and section has a verdict and a known type, applies it to the library and marks the review done.
//
//   node motvin-web/tools/site-review/apply-site-review.mjs <app> <version>
//
// Rules live here, not only in docs/review-motvin-site.md: a review cannot pass by skipping a section.
// Prints "review check: no problems left" when done; otherwise lists what is still open and exits 1.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const plugin = resolve(here, '..', '..', '..');
const data = process.env.INSPIRATIONS_DATA_DIR ? resolve(process.env.INSPIRATIONS_DATA_DIR) : join(plugin, 'motvin-backend', 'data', 'inspirations');
const types = JSON.parse(readFileSync(join(here, 'site-types.json'), 'utf-8'));
const PAGE = new Map(types.pages.map((t) => [t.id, t.label]));
const SECTION = new Map(types.sections.map((t) => [t.id, t.label]));

const [app, version] = process.argv.slice(2);
if (!app || !/^\d{4}-\d{2}-\d{2}$/.test(version ?? '')) {
  console.error('Usage: node motvin-web/tools/site-review/apply-site-review.mjs <app> <version>');
  process.exit(2);
}
const reviewDir = join(data, '..', 'reviews', `${app}-site-${version}`);
const versionDir = join(data, 'screens', 'site', app, 'versions', version);
const readJson = (file) => JSON.parse(readFileSync(file, 'utf-8'));
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

if (!existsSync(join(reviewDir, 'site-review.json'))) {
  console.error(`No review pack at ${reviewDir}/site-review.json — this is not a Web (site) upload, or it was cleared.`);
  process.exit(2);
}
const pack = readJson(join(reviewDir, 'site-review.json'));
const correctionsFile = join(reviewDir, 'corrections.json');
if (!existsSync(correctionsFile)) {
  console.log(`review check: corrections.json is missing — write ${correctionsFile} (see motvin-web/docs/review-motvin-site.md)`);
  process.exit(1);
}
let corrections;
try {
  corrections = readJson(correctionsFile);
} catch (error) {
  console.log(`review check: corrections.json is not valid JSON — ${error.message}`);
  process.exit(1);
}
const pagesIn = corrections.pages ?? {};
const sectionsIn = corrections.sections ?? {};

// A verdict says what the picture shows, in a few words of its own — not just its type's name.
const verdictOk = (v, label) => typeof v === 'string' && v.trim().split(/\s+/).length >= 4 && v.trim().toLowerCase() !== String(label).toLowerCase();
const problems = [];
const removedPages = new Set();
for (const page of pack.pages) {
  const c = pagesIn[page.n];
  if (!c) { problems.push(`page ${page.n}: no entry — look at ${page.look.top} and ${page.look.overview}`); continue; }
  if (c.remove === true) { removedPages.add(page.n); if (!verdictOk(c.verdict, '')) problems.push(`page ${page.n}: say why it is removed ("verdict")`); continue; }
  if (!PAGE.has(c.pageType)) problems.push(`page ${page.n}: pageType "${c.pageType}" is not one of ${[...PAGE.keys()].join(', ')}`);
  if (!verdictOk(c.verdict, PAGE.get(c.pageType))) problems.push(`page ${page.n}: needs a verdict saying what the page shows (4 words or more)`);
}
for (const page of pack.pages) {
  if (removedPages.has(page.n)) continue;
  for (const s of page.sections) {
    const c = sectionsIn[s.key];
    if (!c) { problems.push(`section ${s.key}: no entry — look at ${s.look}`); continue; }
    if (c.remove === true) { if (!verdictOk(c.verdict, '')) problems.push(`section ${s.key}: say why it is removed ("verdict")`); continue; }
    if (!SECTION.has(c.sectionType)) problems.push(`section ${s.key}: sectionType "${c.sectionType}" is not one of ${[...SECTION.keys()].join(', ')}`);
    if (!verdictOk(c.verdict, SECTION.get(c.sectionType))) problems.push(`section ${s.key}: needs a verdict saying what it shows (4 words or more)`);
  }
}
// The site's header, its menus and its footer are captured again on every page: kept once (on the first page that
// has them), each repeat on a later page is removed — unless the reviewer says how it differs ("differs").
const SHARED = new Set(['navigation', 'nav-menu', 'footer']);
const firstOf = new Map();
for (const page of pack.pages) {
  if (removedPages.has(page.n)) continue;
  for (const s of page.sections) {
    const c = sectionsIn[s.key];
    if (!c || c.remove === true || !SHARED.has(c.sectionType)) continue;
    const same = `${c.sectionType}|${(s.heading ?? '').trim().toLowerCase()}`;
    const first = firstOf.get(same);
    if (!first) firstOf.set(same, { key: s.key, page: page.n });
    else if (first.page !== page.n && !(typeof c.differs === 'string' && c.differs.trim().split(/\s+/).length >= 4)) {
      problems.push(`section ${s.key}: repeats ${first.key} (the same ${SECTION.get(c.sectionType)}${s.heading ? ` "${s.heading}"` : ''} on page ${first.page}) — remove it, or say how it differs ("differs", 4 words or more)`);
    }
  }
}
// Each kept section is described from its own picture: one sentence pasted onto many is not a review.
const verdictUses = new Map();
for (const [key, c] of Object.entries(sectionsIn)) {
  if (!c || c.remove === true || typeof c.verdict !== 'string') continue;
  const v = c.verdict.trim().toLowerCase();
  verdictUses.set(v, [...(verdictUses.get(v) ?? []), key]);
}
for (const [v, keys] of verdictUses) if (keys.length > 2) problems.push(`sections ${keys.join(', ')}: the same verdict "${v}" — describe what each one shows`);
const known = new Set(pack.pages.flatMap((p) => p.sections.map((s) => s.key)));
for (const key of Object.keys(sectionsIn)) if (!known.has(key)) problems.push(`section ${key}: not in this upload`);
for (const key of Object.keys(pagesIn)) if (!pack.pages.some((p) => String(p.n) === String(key))) problems.push(`page ${key}: not in this upload`);
if (!pack.pages.some((p) => !removedPages.has(p.n))) problems.push('every page is removed — a site needs at least one page');
// The app itself: its category and tagline, decided from the landing page, as the Web App review does.
const info = corrections.app;
const industries = pack.industries ?? [];
if (!info) problems.push('app: no entry — set "industry" and "tagline" from the landing page');
else {
  if (!industries.includes(info.industry)) problems.push(`app: industry "${info.industry}" is not one of ${industries.join(', ')}`);
  const words = typeof info.tagline === 'string' ? info.tagline.trim().split(/\s+/).length : 0;
  // 45 characters is what the library's taglines run to: it fits two lines under the app's name on its page.
  if (words < 3 || info.tagline.trim().length > 45) problems.push(`app: tagline must be 3 words or more and at most 45 characters (now ${info.tagline.trim().length}) — like "Online design and publishing with templates"`);
  else if (/[.!]$/.test(info.tagline.trim())) problems.push('app: tagline is a phrase, not a sentence — drop the final full stop');
}

// Look again: once the first pass is complete, the spots where a review tends to slip are listed in
// look-again.json, and a fresh look decides each one from its picture — kept with a reason, or fixed — as the iOS
// and Web App review does (docs/review-motvin.md 7b). The list is made once, so a fix cannot make an item vanish.
const lookFile = join(reviewDir, 'look-again.json');
// Headings that point at a type, to catch a section named something else ("Frequently asked questions" as content).
const HEADING_HINTS = [
  ['faq', /\b(?:faqs?|frequently asked|questions)\b/i],
  ['pricing', /\b(?:pricing|plans?|prices?|per month)\b/i],
  ['testimonials', /\b(?:testimonials?|what (?:our )?customers|reviews?|loved by|customer stories)\b/i],
  ['logos', /\b(?:trusted by|used by|customers include)\b/i],
  ['how-it-works', /\bhow it works\b/i],
  ['contact', /\b(?:contact|get in touch|talk to (?:us|sales))\b/i],
  ['blog', /\b(?:blog|articles?|latest news)\b/i],
  ['team', /\b(?:our team|leadership|meet the)\b/i],
];
if (!problems.length && !existsSync(lookFile)) {
  const items = [];
  for (const page of pack.pages) {
    const c = pagesIn[page.n];
    if (c.remove === true) items.push({ key: `page ${page.n}`, kind: 'removed', look: page.look.top, ask: `page ${page.n} (${page.url}) was removed — a real page of the site (keep it) or truly not one?`, was: 'removed' });
    else if (c.pageType !== page.pageType) items.push({ key: `page ${page.n}`, kind: 'changed', look: page.look.top, ask: `page ${page.n} was ${page.pageType}, now ${c.pageType} — which is it?`, was: c.pageType });
  }
  for (const page of pack.pages) {
    if (removedPages.has(page.n)) continue;
    for (const s of page.sections) {
      const c = sectionsIn[s.key];
      const repeat = c.remove === true && SHARED.has(s.sectionType);
      if (c.remove === true && !repeat) items.push({ key: s.key, kind: 'removed', look: s.look, ask: `section ${s.key} was removed ("${c.verdict}") — no use as an example, or a real section to keep?`, was: 'removed' });
      if (c.remove === true) continue;
      if (c.sectionType !== s.sectionType) items.push({ key: s.key, kind: 'changed', look: s.look, ask: `section ${s.key} was ${s.sectionType}, now ${c.sectionType}${s.heading ? ` (heading "${s.heading}")` : ''} — which is it?`, was: c.sectionType });
      else {
        const hint = SHARED.has(c.sectionType) ? null : HEADING_HINTS.find(([type, re]) => type !== c.sectionType && re.test(s.heading ?? ''));
        if (hint) items.push({ key: s.key, kind: 'heading', look: s.look, ask: `section ${s.key} is ${c.sectionType}, but its heading "${s.heading}" reads like ${hint[0]} — which is it?`, was: c.sectionType });
      }
    }
  }
  if (items.length) writeJson(lookFile, items);
}
const lookItems = existsSync(lookFile) ? readJson(lookFile) : [];
if (!problems.length && lookItems.length) {
  const decided = new Map((Array.isArray(corrections.lookAgain) ? corrections.lookAgain : []).map((e) => [String(e?.key), e]));
  const now = (item) => {
    if (item.key.startsWith('page ')) { const c = pagesIn[item.key.slice(5)]; return c?.remove === true ? 'removed' : c?.pageType; }
    const c = sectionsIn[item.key];
    return c?.remove === true ? 'removed' : c?.sectionType;
  };
  for (const item of lookItems) {
    const d = decided.get(item.key);
    if (!d) problems.push(`look again (${item.kind}): ${item.ask} — open ${item.look} and decide it ("lookAgain": [{ "key": "${item.key}", "decision": "keep" or "fixed", "why" }])`);
    else if (!['keep', 'fixed'].includes(d.decision) || typeof d.why !== 'string' || d.why.trim().split(/\s+/).length < 4) problems.push(`look again ${item.key}: needs "decision" keep or fixed, and a "why" of 4 words or more`);
    else if (d.decision === 'fixed' && now(item) === item.was) problems.push(`look again ${item.key}: said fixed, but it is unchanged in corrections.json — change it there, or decide "keep"`);
  }
  for (const key of decided.keys()) if (!lookItems.some((item) => item.key === key)) problems.push(`lookAgain: nothing on the look-again list is ${key}`);
}

if (problems.length) {
  console.log(`review check: ${problems.length} problem(s) left`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}

// Apply: types onto the sidecars, removals off the disk. A removed page takes its sections with it.
let fixes = 0;
const drop = (rel) => {
  for (const ext of ['.webp', '.json']) rmSync(join(versionDir, `${rel}${ext}`), { force: true });
  fixes += 1;
};
for (const page of pack.pages) {
  const side = join(versionDir, 'pages', `${page.n}.json`);
  if (!existsSync(side)) continue;
  const c = pagesIn[page.n];
  if (c.remove === true) {
    drop(`pages/${page.n}`);
    for (const s of page.sections) if (existsSync(join(versionDir, 'sections', `${s.key}.json`))) drop(`sections/${s.key}`);
    continue;
  }
  const meta = readJson(side);
  if (meta.pageType !== c.pageType) fixes += 1;
  // A page named by hand in the recorder keeps its name; its type is still the closest one in the list.
  writeJson(side, { ...meta, pageType: c.pageType, fineType: c.pageType, name: meta.customName || PAGE.get(c.pageType), screenType: { landing: 'landing', pricing: 'pricing', login: 'login', signup: 'signup', product: 'product', 'not-found': 'error' }[c.pageType] ?? 'other', reviewNote: c.verdict.trim() });
  for (const s of page.sections) {
    const sside = join(versionDir, 'sections', `${s.key}.json`);
    if (!existsSync(sside)) continue;
    const sc = sectionsIn[s.key];
    if (sc.remove === true) { drop(`sections/${s.key}`); continue; }
    const smeta = readJson(sside);
    if (smeta.sectionType !== sc.sectionType) fixes += 1;
    writeJson(sside, { ...smeta, sectionType: sc.sectionType, fineType: sc.sectionType, name: SECTION.get(sc.sectionType), pageType: c.pageType, reviewNote: sc.verdict.trim() });
  }
}

// The app's category and tagline go on its record in apps.json.
const appsFile = join(data, 'apps.json');
const appsData = readJson(appsFile);
const record = appsData.apps.find((a) => a.id === app);
if (record) {
  if (record.industry !== info.industry || (record.tagline ?? '') !== info.tagline.trim()) fixes += 1;
  record.industry = info.industry;
  record.industrySource = 'review';
  record.tagline = info.tagline.trim();
  // Its address, from the kept landing page (or the first kept page) when the record has none yet.
  const home = pack.pages.find((p) => !removedPages.has(p.n) && pagesIn[p.n]?.pageType === 'landing') ?? pack.pages.find((p) => !removedPages.has(p.n));
  if (!record.website && home?.url) {
    try {
      record.website = new URL(home.url).origin;
      fixes += 1;
    } catch {
      // Not a full address: left for the admin.
    }
  }
  writeJson(appsFile, appsData);
}

const build = spawnSync('npm', ['run', '--silent', 'build:inspirations'], { cwd: join(data, '..', '..'), encoding: 'utf-8' });
if (build.status !== 0) {
  console.log(`review check: 1 problem(s) left\n  - rebuilding the library failed: ${(build.stdout + build.stderr).trim().split('\n').slice(-3).join(' ')}`);
  process.exit(1);
}
rmSync(join(reviewDir, 'reviewing.json'), { force: true });
const reviewedAt = new Date().toISOString();
writeJson(join(reviewDir, 'reviewed.json'), { reviewedAt, fixes, problems: [], kind: 'site', lookedAgain: lookItems.length });
// The mark also goes in the library's own list, as an app review's does: the "Not reviewed" label reads it, and it
// stays when the review's folder is deleted.
const marksFile = join(data, 'reviewed.json');
const marks = existsSync(marksFile) ? readJson(marksFile) : {};
marks[`${app}-site-${version}`] = { reviewedAt, by: 'Claude', fixes };
writeJson(marksFile, marks);
console.log(`Applied: ${fixes} change(s).`);
console.log('review check: no problems left');

/**
 * Works out an app's category (its `industry`) without trusting a small model.
 *
 * Order of trust, most reliable first:
 *   1. The App Store's own genre, when a store listing clearly matches the name.
 *   2. The model's answer — but only when the model said it was confident and
 *      the value is one the library accepts.
 *   3. Nothing: `unsorted`, shown in the admin as "Needs category". An honest gap
 *      beats the old silent default of "productivity", which looked like an answer.
 *
 * Every result says where it came from (`store`, `ai`, `none`), so a wrong
 * category can be traced to its cause instead of being a mystery.
 */

import { PICKABLE_INDUSTRIES } from './taxonomy.js';

/** App Store genre → the library's category. Genres with no honest match are left out. */
export const GENRE_TO_INDUSTRY = {
  Music: 'entertainment',
  Entertainment: 'entertainment',
  Games: 'entertainment',
  'Photo & Video': 'entertainment',
  Sports: 'entertainment',
  Travel: 'travel',
  Navigation: 'travel',
  'Food & Drink': 'food',
  Shopping: 'ecommerce',
  Finance: 'finance',
  'Health & Fitness': 'healthcare',
  Medical: 'healthcare',
  Education: 'education',
  Reference: 'education',
  Books: 'education',
  'Social Networking': 'social',
  Lifestyle: 'lifestyle',
  News: 'lifestyle',
  Weather: 'lifestyle',
  Business: 'saas',
  Productivity: 'productivity',
  Utilities: 'productivity',
};

/** Storefronts tried in order: the US first, then India (where several library apps live). */
const STOREFRONTS = ['us', 'in'];

const norm = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * True when a store title clearly names this app: the title (or the part before a
 * "Name: tagline" / "Name - tagline" separator) equals the app's name, or starts
 * with it as a whole word. "Spotify: Music and Podcasts" matches "Spotify";
 * "Spotify Karaoke Clone" does not match "Spot".
 */
export function titleMatches(title, name) {
  const want = norm(name);
  if (!want) return false;
  const head = norm(String(title).split(/\s[:\-–—|]\s|:\s/)[0]);
  const whole = norm(title);
  return head === want || whole === want || whole.startsWith(`${want} `) || head.startsWith(`${want} `);
}

async function searchStore(name, country, fetchImpl, timeoutMs) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=software&country=${country}&limit=5`;
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) return [];
  const body = await response.json();
  return Array.isArray(body.results) ? body.results : [];
}

/**
 * Looks the app up in the App Store and maps its genre to a category.
 *
 * @returns {Promise<{industry: string, genre: string, country: string, title: string} | null>}
 *   null when nothing clearly matches, the genre has no mapping, or the store is unreachable.
 */
export async function industryFromStore(name, { fetchImpl = fetch, timeoutMs = 6000 } = {}) {
  for (const country of STOREFRONTS) {
    let results = [];
    try {
      results = await searchStore(name, country, fetchImpl, timeoutMs);
    } catch {
      continue; // offline or slow: try the next storefront, then give up quietly
    }
    const hit = results.find((entry) => titleMatches(entry.trackName, name));
    if (!hit) continue;
    const industry = GENRE_TO_INDUSTRY[hit.primaryGenreName];
    if (industry) return { industry, genre: hit.primaryGenreName, country: country.toUpperCase(), title: hit.trackName };
    // A clear listing in a genre we do not map (e.g. "Developer Tools") is not
    // a reason to keep searching other storefronts for the same app.
    return null;
  }
  return null;
}

/**
 * Decides the category. `ai` is what the identify step returned.
 *
 * @param {{name: string, ai?: {industry: string | null, confident: boolean}}} input
 * @returns {Promise<{industry: string, source: 'store' | 'ai' | 'none', detail: string}>}
 */
export async function resolveIndustry({ name, ai }, options = {}) {
  const store = name ? await industryFromStore(name, options) : null;
  if (store) {
    return { industry: store.industry, source: 'store', detail: `App Store genre “${store.genre}” (${store.country}: ${store.title})` };
  }
  if (ai?.confident && PICKABLE_INDUSTRIES.includes(ai.industry)) {
    return { industry: ai.industry, source: 'ai', detail: 'chosen by the model, which was confident' };
  }
  const why = ai?.industry
    ? 'no clear store listing, and the model was not confident'
    : 'no clear store listing, and the model gave no usable category';
  return { industry: 'unsorted', source: 'none', detail: why };
}

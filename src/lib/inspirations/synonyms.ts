import type { Industry, Platform } from './types';

/**
 * Everyday wording the guide folds into the words the library uses, so that
 * "sign in", "register" or "buy" find the screens a designer calls login,
 * signup and checkout.
 */
const SYNONYMS: [RegExp, string][] = [
  [/\bapplications?\b/g, 'app'],
  [/\b(?:sign[\s-]?in|log[\s-]?in|logging in)\b/g, 'login'],
  [/\b(?:sign[\s-]?up|registrations?|register|create (?:an )?account)\b/g, 'signup'],
  [/\b(?:check[\s-]?out|payments?|purchases?|buy(?:ing)?)\b/g, 'checkout'],
  [/\b(?:baskets?|shopping carts?)\b/g, 'cart'],
  [/\b(?:welcome screens?|intro(?:duction)?|walk[\s-]?through|tutorials?)\b/g, 'onboarding'],
  [/\blanding pages?\b/g, 'landing'],
  [/\b(?:preferences|setting)\b/g, 'settings'],
  [/\bnotifs?\b/g, 'notifications'],
];

export function applySynonyms(text: string): string {
  return SYNONYMS.reduce((current, [pattern, word]) => current.replace(pattern, word), text);
}

/** Words people use for each kind of app. Matched on the visitor's own wording, before the synonyms above. */
const INDUSTRY_WORDS: Record<Industry, RegExp> = {
  food: /\b(?:food(?: delivery| & drink| and drink)?|restaurants?|grocer(?:y|ies)|delivery)\b/,
  fintech: /\b(?:fintech|bank(?:ing|s)?|wallets?|invest(?:ing|ment|ments)?|payments? apps?)\b/,
  finance: /\bfinance\b/,
  ecommerce: /\b(?:e-?commerce|shopping|retail|marketplace)\b/,
  healthcare: /\b(?:health(?:care)?|medical)\b/,
  education: /\b(?:education|learning|edtech|courses?)\b/,
  travel: /\b(?:travel|trips?|flights?|hotels?|booking)\b/,
  productivity: /\bproductivity\b/,
  ai: /\b(?:ai|artificial intelligence)\b/,
  social: /\b(?:social|messaging|community|chat apps?)\b/,
  entertainment: /\b(?:entertainment|streaming|music|video apps?|games?|movies?)\b/,
  lifestyle: /\b(?:lifestyle|fitness|wellness|dating)\b/,
  saas: /\bsaas\b/,
};

/**
 * The kind of app a visitor is asking about — "food apps", "fintech" — or null.
 * A bare word like "games" only counts when they also say apps, industry or
 * category, or say nothing else, so ordinary sentences are not hijacked.
 */
export function findIndustry(text: string): Industry | null {
  const lower = text.toLowerCase();
  const talksAboutApps = /\b(?:apps?|industr(?:y|ies)|categor(?:y|ies))\b/.test(lower);
  const bare = lower.replace(/[^\p{L}\p{N}\s&-]/gu, ' ').replace(/\s+/g, ' ').trim();
  for (const [key, pattern] of Object.entries(INDUSTRY_WORDS) as [Industry, RegExp][]) {
    const match = pattern.exec(lower);
    if (!match) continue;
    if (talksAboutApps || match[0] === bare) return key;
  }
  return null;
}

/** Words for where an app runs. Matched on the visitor's own wording, before the synonyms above. */
const PLATFORM_WORDS: Record<Platform, RegExp> = {
  web: /\b(?:web(?: ?(?:apps?|applications?|sites?|platform))?|websites?|desktop)\b/,
  ios: /\b(?:ios|iphone|ipad|apple)(?: ?(?:apps?|applications?))?\b/,
  android: /\b(?:android|google play)(?: ?(?:apps?|applications?))?\b/,
};

export const PLATFORM_LABEL: Record<Platform, string> = { web: 'web', ios: 'iOS', android: 'Android' };

/**
 * Where the apps they mean run — "web apps", "iOS", "android applications" — or
 * null. As with kinds of app, a bare word only counts when they also say apps,
 * or say nothing else.
 */
export function findPlatforms(text: string): Platform[] {
  const lower = text.toLowerCase();
  // "ios apps", or a platform as a place: "on iOS", "on the web", "for Android".
  const talksAboutApps = /\b(?:apps?|applications?|platforms?)\b/.test(lower) || /\b(?:on|for|to|via|in)\s+(?:the\s+)?(?:web|ios|android|iphone|ipad|desktop|websites?)\b/.test(lower);
  const bare = lower.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const found: Platform[] = [];
  for (const [key, pattern] of Object.entries(PLATFORM_WORDS) as [Platform, RegExp][]) {
    const match = pattern.exec(lower);
    if (!match) continue;
    if (talksAboutApps || match[0] === bare) found.push(key);
  }
  return found;
}

export function findPlatform(text: string): Platform | null {
  return findPlatforms(text)[0] ?? null;
}

/** "sorry, i mean web apps" → "web apps". The lead-ins people add when they correct themselves. */
export function stripChatter(text: string): string {
  const stripped = text.replace(/^(?:(?:sorry|oops|my bad|nope|no|actually|well|um+|uh+|hmm+|okay|ok|wait|i mean|i meant|what i mean(?:t)? is|i was saying)\b[\s,.:;!-]*)+/i, '').trim();
  return stripped || text;
}

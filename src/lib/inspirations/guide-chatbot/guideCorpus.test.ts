import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api', () => {
  const apps = [
    { id: 'a1', name: 'Swiggy', slug: 'swiggy', screenCount: 262, flowCount: 39, logo: null, industry: 'food', rating: 5, ratingCount: 1, platforms: ['ios', 'android'] },
    { id: 'a2', name: 'Zomato', slug: 'zomato', screenCount: 140, flowCount: 85, logo: null, industry: 'food', rating: 4.5, ratingCount: 12, platforms: ['ios', 'web'] },
    { id: 'a3', name: 'LinkedIn', slug: 'linkedin', screenCount: 28, flowCount: 4, logo: null, industry: 'social', rating: null, ratingCount: null, platforms: ['web'] },
    { id: 'a4', name: 'Groww', slug: 'groww', screenCount: 90, flowCount: 20, logo: null, industry: 'fintech', rating: 4.2, ratingCount: 3, platforms: ['ios', 'android'] },
  ];
  return {
    inspirationsApi: {
      listApps: vi.fn(async () => apps),
      listFlows: vi.fn(async () => [
        { id: 'f1', appId: 'a1', name: 'Checkout', category: 'checkout', screenIds: ['x'] },
        { id: 'f2', appId: 'a2', name: 'Onboarding', category: 'onboarding', screenIds: ['y'] },
      ]),
      listScreens: vi.fn(async () => ({ items: [], total: 5, limit: 24, offset: 0, nextOffset: null })),
      getMeta: vi.fn(async () => ({ taxonomy: { screenTypes: ['login'], industries: [], flowCategories: ['checkout', 'onboarding'] } })),
      listPatterns: vi.fn(async () => [{ id: 'p1', name: 'Filter chips', slug: 'filter-chips', category: 'Filters', screenIds: ['swiggy-a'] }]),
      listElements: vi.fn(async () => [{ kind: 'bottom-sheet', count: 20 }, { kind: 'toast', count: 18 }, { kind: 'tab-bar', count: 81 }, { kind: 'button', count: 115 }, { kind: 'search-bar', count: 175 }]),
      mediaUrl: vi.fn(() => null),
    },
  };
});

import { resetIndex } from './guideIndex';
import { resolveNavigation } from './navAssistant';

beforeEach(() => resetIndex());

/**
 * Real ways people ask. Every line must be understood — answered, opened, or a
 * sensible clarifying question — never the "I can't answer that" fallback. The
 * score is the guide's resolve rate; the bar only ever moves up.
 */
const CORPUS = [
  'open swiggy', 'swiggy', 'take me to zomato', 'navigate to swigy', 'i want to see linkedin', 'show flows', 'patterns', 'ui elements', 'collections',
  'how many screens does swiggy have', 'how much screens have in zomato', 'swiggy flows', 'zomato ui elements', 'show swiggy checkout flow', 'onboarding flows',
  'is swiggy on ios', 'is zomato on the web?', 'what platform is linkedin on', 'is swiggy a food app', 'what kind of app is zomato', 'is swiggy rated',
  'tell me about zomato', 'what is swiggy', 'describe linkedin',
  'which app has the most screens', 'which app has the fewest flows', 'top 2 apps by flows', 'top rated apps', 'newest app',
  'food apps', 'web apps', 'ios apps', 'how many web apps are there', 'social apps',
  'compare swiggy and zomato', 'apps like swiggy', 'apps except swiggy', 'web apps other than zomato', 'apps with more than 100 screens',
  'empty states', 'dark mode screens', 'bottom sheets', 'toasts', 'which apps have toasts', 'loading login screens', 'login screens', 'sign in screens',
  'filter chips', 'which apps use filter chips', 'does swiggy use filter chips', 'modal patterns',
  'save swiggy', 'copy link to zomato', 'surprise me', 'which apps do you have', 'i want app', 'i want apps',
  'hi', 'thanks', 'who are you', 'help', 'sorry web', 'i mean web application', 'open zomato and show its flows',
  'does swiggy have a login screen?', 'does zomato have flows?', 'how many login screens are there', 'which apps have login screens',
  // Round three: messy, unseen phrasing that used to fail.
  'yo show me zomato', 'swiggy pls', 'zomato screens', 'where is the checkout flow for swiggy', 'does swiggy have dark mode', 'what can i find here',
  'show me how food apps handle login', 'inspire me for a payment screen', 'i need onboarding ideas', 'which one has better onboarding', 'is groww good',
  'whats the biggest app', 'how many apps do you have', 'how many flows in total', 'show me everything about groww', 'swiggy vs groww', 'compare all apps',
  'which apps are on android', 'any fintech apps?', 'show me apps for banking', 'are there any travel apps', 'give me the checkout screens of zomato',
  'zomato login', 'linkedin on mobile?', 'delete swiggy', 'upload a video', 'how do i add an app', 'what is a bottom sheet', 'explain filter chips',
  'screens with search bar', 'show cart screens', 'profile screens from groww', 'swiggy home page', 'take me home', 'go back', 'open the last app again',
  'swiggy and zomato flows', 'flows of both', 'what about android', 'and web?', 'only ios ones', 'newest screens', 'recently added', 'trending',
  'most popular app', 'free apps', 'swigy flwos', 'zomto checkut', 'linkdin', 'show me splash screens in dark mode', 'empty states from food apps',
  'how many toasts does zomato have', 'zomato paywall', 'show me pricing pages', 'my collections', 'what did i save', 'clear my history',
  'thank you so much!', 'ok bye', 'swiggy restaurants', 'ios login screens', 'add to cart screens',
  // Round four.
  'hey can u take me to groww', 'show linkedin', 'i wanna see swiggys flows', 'zomato app', 'whats in swiggy', 'how big is zomato', 'does groww support android',
  'is linkedin only on web', 'which food app is biggest', 'smallest app', 'least flows', 'apps with fewer than 50 screens', 'what apps are on ios', 'list web apps',
  'show me tab bars', 'swiggy tab bar', 'where can i see toasts', 'dark mode login', 'light mode onboarding screens', 'minimal apps',
  'show me forgot password screens', 'otp screens', 'search results screens', 'settings page of groww', 'notifications screen', 'show me payment flows',
  'cart flow in swiggy', 'any onboarding in linkedin', 'tell me about the app groww', 'groww details', 'info on linkedin', 'is zomato better than swiggy',
  'which has more flows swiggy or zomato', 'how many apps are there on web', 'how many food apps', 'screens count', 'total screens', 'show everything',
  'i am lost', 'what should i look at first', 'recommend something', 'give me ideas for a checkout page', 'inspiration for sign up',
  'who built motvin', 'is this free', 'can i download screenshots', 'dark', 'ios', 'flows', 'ui', 'btn', 'groww?',
];

describe('corpus score', () => {
  it('resolves at least 95% of real phrasings, never with the fallback', async () => {
    const misses: string[] = [];
    for (const text of CORPUS) {
      const reply = await resolveNavigation(text);
      if (reply.kind === 'fallback' || reply.kind === 'error') misses.push(`${text} → ${reply.text}`);
    }
    const rate = 1 - misses.length / CORPUS.length;
    if (misses.length) console.log(`Unresolved (${misses.length}/${CORPUS.length}):\n  ${misses.join('\n  ')}`);
    expect(rate).toBeGreaterThanOrEqual(0.95);
  });

  it('never answers a question by navigating', async () => {
    const questions = ['is swiggy on ios', 'what kind of app is zomato', 'does zomato have flows?', 'which app has the most screens', 'how many screens does swiggy have'];
    for (const text of questions) expect((await resolveNavigation(text)).go, text).toBeUndefined();
  });
});

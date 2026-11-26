/**
 * Seed keys that aren't a useAsync key (see SeedProvider): shared by the server, which fetches them, and the
 * component that reads them. Kept apart from lib/inspirations/seeds.ts so a client component importing a key
 * doesn't pull the server's fetching code into the browser.
 */

/** The screen feed's first page (FilteredGallery, on Screens and UI Elements). */
export const FEED_SEED = 'screens-feed';

/** The first app cards' screens (AppsGrid, on Apps, New this week and Explore): `{ platforms, cards: { appId: Screen[] } }`. */
export const APP_CARDS_SEED = 'app-cards';

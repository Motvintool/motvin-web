/**
 * Theme system — port of motvin-ui/JS/theme-manager.js.
 *
 * Three preferences (dark | light | system) resolve to two effective themes
 * (dark | light), written to <html> as:
 *   data-theme="dark|light"          — what theme.css keys off
 *   data-theme-preference="dark|light|system"  — what the toggle UI reflects
 *
 * Dark is the default when nothing is stored.
 */

export const THEME_STORAGE_KEY = 'siteTheme';

export const THEME_PREFERENCES = ['dark', 'light', 'system'] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type EffectiveTheme = 'dark' | 'light';

export const DEFAULT_THEME: ThemePreference = 'dark';

export function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference);
}

export function resolveSystemTheme(): EffectiveTheme {
  try {
    return window.matchMedia?.('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
  } catch {
    return 'dark';
  }
}

export function getEffectiveTheme(preference: ThemePreference): EffectiveTheme {
  if (preference === 'system') return resolveSystemTheme();
  return preference === 'light' ? 'light' : 'dark';
}

export function getStoredTheme(): ThemePreference {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(saved) ? saved : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(preference: ThemePreference): EffectiveTheme {
  const effective = getEffectiveTheme(preference);
  document.documentElement.setAttribute('data-theme', effective);
  document.documentElement.setAttribute('data-theme-preference', preference);
  return effective;
}

export function storeTheme(preference: ThemePreference) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage can be unavailable (private mode, blocked site data) — the theme
    // still applies for this page view.
  }
}

/**
 * Runs before first paint via a blocking inline <script> in the root layout, so
 * the correct theme is on <html> before any CSS resolves. Kept small on purpose.
 * Mirrors applyTheme/getStoredTheme above — change both together.
 */
export const THEME_INIT_SCRIPT = `
(function(){
  try {
    var k = ${JSON.stringify(THEME_STORAGE_KEY)};
    var valid = ${JSON.stringify(THEME_PREFERENCES)};
    var saved = null;
    try { saved = localStorage.getItem(k); } catch (e) {}
    var pref = valid.indexOf(saved) !== -1 ? saved : ${JSON.stringify(DEFAULT_THEME)};
    var effective = pref;
    if (pref === 'system') {
      effective = 'dark';
      try {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) effective = 'light';
      } catch (e) {}
    }
    var el = document.documentElement;
    el.setAttribute('data-theme', effective);
    el.setAttribute('data-theme-preference', pref);
    // Every /updates route forces the light theme regardless of the visitor's
    // saved preference, matching motvin-ui/updates/*'s hard-coded light look.
    // Doing it here — in the pre-paint blocking script — is what prevents the
    // dark flash on a hard refresh; the UpdatesChrome effect only re-installs
    // for SPA nav.
    var p = location.pathname;
    if (p === '/updates' || p.indexOf('/updates/') === 0) {
      el.setAttribute('data-updates-prev-theme', effective);
      el.setAttribute('data-theme', 'light');
      if (document.body) {
        document.body.classList.add('updates-page');
      } else {
        document.addEventListener('DOMContentLoaded', function(){
          document.body.classList.add('updates-page');
        }, { once: true });
      }
    }
  } catch (e) {}
})();
`.trim();

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useStoredValue, writeStoredValue } from '@/hooks/useStoredValue';
import { CONSENT_EVENT, COOKIE_PREF_KEY, initializeGoogleAnalytics } from '@/lib/analytics';

/**
 * The cookie banner, on every page: a visitor who first lands on Inspirations
 * or Icons (from a shared link) is asked too, not only one who comes in through
 * the home page. It shows until a preference is stored (Accept All, Submit, or
 * closing it, which means essential-only), and loads Google Analytics on every
 * page once the preference allows it. The footer's "Cookie settings" link
 * reopens it.
 */

/** Stored consent, flattened to a primitive so it can back a store snapshot. */
export type Consent = 'unset' | 'essential' | 'all';

export function parseConsent(raw: string | null): Consent {
  if (!raw) return 'unset';
  try {
    return (JSON.parse(raw) as { analytics?: boolean })?.analytics ? 'all' : 'essential';
  } catch {
    return 'unset';
  }
}

export function CookieBanner() {
  const [consent, refreshConsent] = useStoredValue<Consent>(COOKIE_PREF_KEY, 'unset', parseConsent);
  const [showSettings, setShowSettings] = useState(false);
  const [analyticsChecked, setAnalyticsChecked] = useState(false);
  // Set only by the footer's "Cookie settings" link, to reopen a banner the
  // visitor has already dismissed.
  const [forceOpen, setForceOpen] = useState(false);

  // The server render shows no banner; it appears once the stored preference is read.
  const showCookies = forceOpen || consent === 'unset';

  useEffect(() => {
    if (consent === 'all') initializeGoogleAnalytics();
  }, [consent]);

  // The footer's "Cookie settings" link reopens this banner straight into its
  // settings state. It lives in another component, so it asks via an event.
  useEffect(() => {
    const onOpenSettings = () => {
      setForceOpen(true);
      setShowSettings(true);
    };
    document.addEventListener('motvin:open-cookie-settings', onOpenSettings);
    return () => document.removeEventListener('motvin:open-cookie-settings', onOpenSettings);
  }, []);

  const completeCookieFlow = useCallback(
    (analytics: boolean) => {
      writeStoredValue(COOKIE_PREF_KEY, JSON.stringify({ essential: true, analytics }));
      refreshConsent();
      setForceOpen(false);
      setShowSettings(false);
      // The landing page's promo waits for this choice.
      document.dispatchEvent(new CustomEvent(CONSENT_EVENT));
    },
    [refreshConsent],
  );

  return (
    <div
      className="cookies-banner"
      id="cookiesBanner"
      style={{ display: showCookies ? 'block' : 'none' }}
    >
      <div className="cookies-banner-content">
        <div className="cookies-banner-header">
          <div className="cookies-banner-title-wrap">
            <img src="/ASSET/Icons/cookies.svg" alt="Cookies" className="cookies-icon" />
            <p className="cookies-title">Cookie preferences</p>
          </div>
          <button
            className="cookies-close-btn"
            aria-label="Close"
            id="cookieCloseBtn"
            // Closing without choosing means essential-only.
            onClick={() => completeCookieFlow(false)}
          >
            <img src="/ASSET/Icons/cookie-close.svg" alt="Close" />
          </button>
        </div>

        {/* Accept All State */}
        <div
          className="cookies-state-accept"
          id="cookiesStateAccept"
          style={{ display: showSettings ? 'none' : 'block' }}
        >
          <p className="cookies-desc">
            Essential cookies keep Motvin secure and working. Optional analytics help us improve
            your experience.{' '}
            <a href="/privacy" target="_blank" rel="noopener" className="cookies-link">
              Learn more about cookies
            </a>
          </p>
          <div className="cookies-actions">
            <button
              className="btn-cookies-primary"
              id="btnAcceptAll"
              onClick={() => completeCookieFlow(true)}
            >
              Accept All
            </button>
            <button
              className="btn-cookies-secondary"
              id="btnSettings"
              onClick={() => setShowSettings(true)}
            >
              Settings
            </button>
          </div>
        </div>

        {/* Settings State */}
        <div
          className="cookies-state-settings"
          id="cookiesStateSettings"
          style={{ display: showSettings ? 'block' : 'none' }}
        >
          <div className="cookies-settings-list">
            <div className="cookie-setting-item">
              <div className="cookie-setting-header">
                <div className="cookie-setting-name">
                  <img src="/ASSET/Icons/bullet.svg" alt="Bullet" className="cookie-bullet" />
                  <p>Essential cookies</p>
                </div>
                <div className="cookie-switch disabled">
                  <div className="cookie-switch-track">
                    <div className="cookie-switch-thumb"></div>
                  </div>
                </div>
              </div>
              <p className="cookie-setting-desc">
                These cookies are essential for Motvin to function properly.
              </p>
            </div>
            <div className="cookie-divider"></div>
            <div className="cookie-setting-item">
              <div className="cookie-setting-header">
                <div className="cookie-setting-name">
                  <img src="/ASSET/Icons/bullet.svg" alt="Bullet" className="cookie-bullet" />
                  <p>Analytics cookies</p>
                </div>
                <label className="cookie-switch">
                  <input
                    type="checkbox"
                    id="analyticsCookieToggle"
                    checked={analyticsChecked}
                    onChange={(e) => setAnalyticsChecked(e.target.checked)}
                  />
                  <div className="cookie-switch-track">
                    <div className="cookie-switch-thumb"></div>
                  </div>
                </label>
              </div>
              <p className="cookie-setting-desc">
                Helps us understand how visitors use Motvin to improve features and performance.
              </p>
            </div>
          </div>
          <div className="cookies-actions">
            <button
              className="btn-cookies-primary"
              id="btnSavePreferences"
              onClick={() => completeCookieFlow(analyticsChecked)}
            >
              Submit
            </button>
            <button
              className="btn-cookies-secondary"
              id="btnCancelSettings"
              onClick={() => setShowSettings(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

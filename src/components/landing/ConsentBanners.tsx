'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useStoredValue, writeStoredValue } from '@/hooks/useStoredValue';

/**
 * Cookie consent banner and the promo banner it gates — port of the banner
 * logic in JS/index.js.
 *
 * Flow: a first-time visitor sees the cookie banner and no promo. Once a
 * preference is stored (Accept All, Submit, or closing the banner — which
 * defaults to essential-only) the cookie banner goes away and the promo banner
 * appears. The promo has its own dismissal, hidden for four hours.
 *
 * Analytics only loads when the stored preference allows it, on this visit and
 * on every later one.
 */

const COOKIE_PREF_KEY = 'motvin_cookie_preference';
const PROMO_HIDDEN_KEY = 'motvin_main_promo_hidden_until';
const PROMO_HIDE_MS = 4 * 60 * 60 * 1000;
const GA_MEASUREMENT_ID = 'G-4DTKXD35BH';

/** Stored consent, flattened to a primitive so it can back a store snapshot. */
type Consent = 'unset' | 'essential' | 'all';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function initializeGoogleAnalytics() {
  if (window.gtag) return; // Already injected this session.

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  const gtag = (...args: unknown[]) => {
    window.dataLayer!.push(args);
  };
  window.gtag = gtag;

  gtag('js', new Date());
  gtag('config', GA_MEASUREMENT_ID);
}

function parseConsent(raw: string | null): Consent {
  if (!raw) return 'unset';
  try {
    return (JSON.parse(raw) as { analytics?: boolean })?.analytics ? 'all' : 'essential';
  } catch {
    return 'unset';
  }
}

function parsePromoDismissed(raw: string | null): boolean {
  if (!raw) return false;
  return Date.now() < parseInt(raw, 10);
}

export function ConsentBanners() {
  const [consent, refreshConsent] = useStoredValue<Consent>(
    COOKIE_PREF_KEY,
    'unset',
    parseConsent,
  );
  const [promoDismissed, refreshPromoDismissed] = useStoredValue(
    PROMO_HIDDEN_KEY,
    false,
    parsePromoDismissed,
  );

  const [showSettings, setShowSettings] = useState(false);
  const [analyticsChecked, setAnalyticsChecked] = useState(false);
  // Set only by the footer's "Cookie settings" link, to reopen a banner the
  // visitor has already dismissed.
  const [forceOpen, setForceOpen] = useState(false);

  // Server render shows neither banner, matching the static page's markup
  // (both had display:none and were revealed from script).
  const showCookies = forceOpen || consent === 'unset';
  const showPromo = consent !== 'unset' && !promoDismissed;

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
    },
    [refreshConsent],
  );

  const dismissPromo = useCallback(() => {
    writeStoredValue(PROMO_HIDDEN_KEY, String(Date.now() + PROMO_HIDE_MS));
    refreshPromoDismissed();
  }, [refreshPromoDismissed]);

  return (
    <>
      {/* Promo: a small floating pill at the bottom, in the page's own style,
          rising in with a soft spring once cookie consent is settled. */}
      <div
        className="lpi-promo"
        id="promoBanner"
        role="region"
        aria-label="Motvin Icons"
        style={{ display: showPromo ? 'flex' : 'none' }}
      >
        <span className="lpi-promo-icon" aria-hidden="true">
          <img src="/ASSET/Icons/Motvin/bouquet.svg" alt="" width={24} height={24} />
        </span>
        <p className="lpi-promo-text">
          <b>Motvin Icons</b>
          <span>350k+ editable icons for your next design</span>
        </p>
        <Link href="/icons" className="lpi-promo-btn">
          Explore icons
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14" />
            <path d="m13 6 6 6-6 6" />
          </svg>
        </Link>
        <button
          type="button"
          className="lpi-promo-close"
          aria-label="Close"
          id="promoBannerCloseBtn"
          onClick={dismissPromo}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12" />
            <path d="M18 6 6 18" />
          </svg>
        </button>
      </div>

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
              your experience.
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
    </>
  );
}

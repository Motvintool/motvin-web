'use client';

import Link from 'next/link';
import { useCallback, useEffect } from 'react';
import { parseConsent, type Consent } from '@/components/shared/CookieBanner';
import { useStoredValue, writeStoredValue } from '@/hooks/useStoredValue';
import { CONSENT_EVENT, COOKIE_PREF_KEY } from '@/lib/analytics';

/**
 * The landing pages' promo banner (Motvin Icons), gated on the cookie choice —
 * port of the banner logic in JS/index.js. The cookie banner itself is
 * CookieBanner, on every page.
 *
 * Flow: a first-time visitor sees the cookie banner and no promo. Once a
 * preference is stored the promo appears. The promo has its own dismissal,
 * hidden for four hours.
 */

const PROMO_HIDDEN_KEY = 'motvin_main_promo_hidden_until';
const PROMO_HIDE_MS = 4 * 60 * 60 * 1000;

function parsePromoDismissed(raw: string | null): boolean {
  if (!raw) return false;
  return Date.now() < parseInt(raw, 10);
}

export function ConsentBanners() {
  const [consent, refreshConsent] = useStoredValue<Consent>(COOKIE_PREF_KEY, 'unset', parseConsent);
  const [promoDismissed, refreshPromoDismissed] = useStoredValue(
    PROMO_HIDDEN_KEY,
    false,
    parsePromoDismissed,
  );

  // Server render shows no promo, matching the static page's markup (it had
  // display:none and was revealed from script).
  const showPromo = consent !== 'unset' && !promoDismissed;

  // The choice is made in CookieBanner; re-read it the moment it's stored.
  useEffect(() => {
    document.addEventListener(CONSENT_EVENT, refreshConsent);
    return () => document.removeEventListener(CONSENT_EVENT, refreshConsent);
  }, [refreshConsent]);

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
          <span>350k+ <span className="lpi-promo-more">editable </span>icons<span className="lpi-promo-more"> for your next design</span></span>
        </p>
        <Link href="/icons" className="lpi-promo-btn">
          Explore<span className="lpi-promo-more"> icons</span>
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

    </>
  );
}

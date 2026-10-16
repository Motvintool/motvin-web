'use client';

import { useEffect, useRef, useState } from 'react';
import { GUEST_DOWNLOAD_EVENT, type GatedDetail } from './useDownloadGate';
import { useGoToLogin } from './useGoToLogin';

/** How long the notice stays up. */
const SHOW_MS = 3200;

/**
 * The pill that tells a guest downloads need an account, in the same look as
 * the "Saved to collection" pill (FloatCollectionBar), with a lock in the
 * black circle and a Sign in button. Shown whenever useDownloadGate (or
 * GuestImageGuard) turns a guest's download or PNG copy away, worded for
 * what they tried ("Sign in to copy logos"). Sign in goes to the login page,
 * as the header's Login does, and back here after. Renders nothing otherwise.
 */
export function GuestDownloadNotice() {
  const goToLogin = useGoToLogin();
  const [visible, setVisible] = useState(false);
  const [blocked, setBlocked] = useState<GatedDetail>({ action: 'download', subject: 'screens' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onBlocked = (event: Event) => {
      const detail = (event as CustomEvent<Partial<GatedDetail>>).detail;
      setBlocked({ action: detail?.action === 'copy' ? 'copy' : 'download', subject: detail?.subject === 'logos' ? 'logos' : 'screens' });
      setVisible(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setVisible(false), SHOW_MS);
    };
    window.addEventListener(GUEST_DOWNLOAD_EVENT, onBlocked);
    return () => {
      window.removeEventListener(GUEST_DOWNLOAD_EVENT, onBlocked);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="ins-float-collection ins-toast-host ins-guest-download-host" role="status" aria-live="polite">
      <div className="ins-float-collection-success ins-guest-download">
        <span className="ins-float-collection-success-check ins-guest-download-lock" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="3" y="7" width="10" height="7.5" rx="2" fill="#fff" />
            <path d="M5.25 7V5.25a2.75 2.75 0 0 1 5.5 0V7" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        {`Sign in to ${blocked.action} ${blocked.subject}`}
        <button
          type="button"
          className="ins-guest-download-signin"
          onClick={() => {
            setVisible(false);
            // Turned away in an app's logo view: come back to it open.
            const inLogoView = blocked.subject === 'logos' && document.querySelector('.ins-logo-view-dialog');
            goToLogin(inLogoView ? { logo: '1' } : undefined);
          }}
        >
          Sign in
        </button>
      </div>
    </div>
  );
}

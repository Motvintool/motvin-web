'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuthModal } from '@/components/shared/AuthModal';
import { GUEST_DOWNLOAD_EVENT, type GatedAction } from './useDownloadGate';

/** How long the notice stays up. */
const SHOW_MS = 3200;

/**
 * The pill that tells a guest downloads need an account, in the same look as
 * the "Saved to collection" pill (FloatCollectionBar), with a lock in the
 * black circle and a Sign in button. Shown whenever useDownloadGate turns a
 * guest's download or PNG copy away; renders nothing otherwise.
 */
export function GuestDownloadNotice() {
  const { open } = useAuthModal();
  const [visible, setVisible] = useState(false);
  const [action, setAction] = useState<GatedAction>('download');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onBlocked = (event: Event) => {
      setAction((event as CustomEvent<GatedAction>).detail === 'copy' ? 'copy' : 'download');
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
        {action === 'copy' ? 'Sign in to copy screens' : 'Sign in to download screens'}
        <button
          type="button"
          className="ins-guest-download-signin"
          onClick={() => {
            setVisible(false);
            open('login');
          }}
        >
          Sign in
        </button>
      </div>
    </div>
  );
}

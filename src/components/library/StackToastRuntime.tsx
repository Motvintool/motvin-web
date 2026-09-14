'use client';

import Script from 'next/script';

/**
 * Loads motvin-ui's stack-toast controller — port of the Stack Toast component
 * (motvin-ui/COMPONENT/Stack Toast.js). Copies its script verbatim into
 * public/vendor/motvin-stack-toast.js and exposes `window.StackToast.show()`.
 *
 * Reference (motvin-icons.js:601-611) routes any "copied"-flavoured message
 * through StackToast so the toasts stack (up to 3 deep) instead of replacing
 * each other, while everything else keeps using the plain `#toast`.
 */
export function StackToastRuntime() {
  return <Script src="/vendor/motvin-stack-toast.js" strategy="afterInteractive" />;
}

'use client';

import { useEffect } from 'react';

/**
 * Adds `login-page` on <body> while the auth flow is mounted so login.css's
 * `body { overflow: hidden }` rule (scoped to that class) only applies here.
 * Without the class, a client-side nav from /login to another route would
 * leave the whole app scroll-locked because Next keeps the stylesheet loaded.
 */
export function LoginChrome() {
  useEffect(() => {
    document.body.classList.add('login-page');
    return () => {
      document.body.classList.remove('login-page');
    };
  }, []);
  return null;
}

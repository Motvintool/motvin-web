'use client';

import { Suspense } from 'react';
import { SignupPage } from '@/components/signup/SignupPage';
import '@/styles/login.css';

/**
 * /signup — renders the same auth flow as /login but with the register form
 * selected by default. Suspense is required because AuthFlow reads
 * `useSearchParams` (Next 16 static generation).
 */
export default function Signup() {
  return (
    <Suspense fallback={null}>
      <SignupPage />
    </Suspense>
  );
}

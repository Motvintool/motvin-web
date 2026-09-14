'use client';

import { Suspense } from 'react';
import { AuthFlow } from '@/components/login/AuthFlow';
import '@/styles/login.css';

/**
 * Standalone sign-in page — port of motvin-ui/login.html.
 *
 * Composition-only shell. All auth logic + views live in
 * `src/components/login/`. Suspense is required around AuthFlow because it
 * calls `useSearchParams` (Next 16 static generation).
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthFlow defaultMode="login" />
    </Suspense>
  );
}

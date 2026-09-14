'use client';

import { AuthFlow } from '@/components/login/AuthFlow';

/**
 * Signup shell — same auth flow as /login but pre-selects the register form.
 * A visitor can still toggle back to sign-in from inside the form; the URL
 * bar just stays at /signup.
 */
export function SignupPage() {
  return <AuthFlow defaultMode="register" />;
}

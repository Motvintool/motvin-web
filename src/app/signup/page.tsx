'use client';

import { InspirationsAuthPage } from '@/components/inspirations/InspirationsAuthPage';
import '@/styles/inspirations.css';

/** /signup — the same page as /login, opened on the create-account form. */
export default function Signup() {
  return <InspirationsAuthPage defaultMode="signup" />;
}

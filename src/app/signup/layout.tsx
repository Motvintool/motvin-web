import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Sign up | Motvin Inspirations',
  // A sign-in form has nothing to find in search results.
  robots: { index: false, follow: true },
};

export default function SignupLayout({ children }: { children: ReactNode }) {
  return children;
}

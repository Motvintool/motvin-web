import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Login | Motvin Inspirations',
  // Listed: it's one of the links search engines show under "Motvin", and returning users use it. One address
  // for it, whatever a link adds after it (where to go back to after signing in).
  alternates: { canonical: '/login' },
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}

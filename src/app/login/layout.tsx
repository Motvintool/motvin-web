import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'Login | Motvin Inspirations' };

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}

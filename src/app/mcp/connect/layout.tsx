import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Connect an AI tool | Motvin',
  robots: { index: false, follow: false },
};

export default function McpConnectLayout({ children }: { children: ReactNode }) {
  return children;
}

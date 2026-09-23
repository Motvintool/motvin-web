import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { InspirationsShell } from '@/components/inspirations/InspirationsShell';
import '@/styles/theme.css';
import '@/styles/inspirations.css';
import '@/styles/profile-menu.css';

/**
 * /inspirations — Motvin's visual design discovery platform.
 *
 * Route map (all under this folder):
 *   /inspirations                 Explore (gallery + filters)
 *   /inspirations/apps            Apps directory
 *   /inspirations/screens         Full screen gallery
 *   /inspirations/ui-elements     Screens grouped by detected component
 *   /inspirations/flows           Multi-screen flows
 *   /inspirations/patterns        Pattern library
 *   /inspirations/search?q=       Natural-language search
 *   /inspirations/app/[slug]      App detail
 *   /inspirations/screen/[id]     Screen detail + Analyze / Extract tools
 *   /inspirations/flow/[id]       Flow viewer
 *   /inspirations/pattern/[slug]  Pattern examples
 *   /inspirations/collections     Saved items — everything bookmarked
 *                                 (?type=all) and organized boards
 *                                 (?type=boards, the default), one board's
 *                                 contents via ?collection=<id>. Formerly
 *                                 split across this route and /saved, which
 *                                 now redirects here (next.config.ts).
 *
 * Styles follow the repo convention (one feature stylesheet, theme tokens
 * from theme.css) and the shell provides header + toasts to every route.
 */

export const metadata: Metadata = {
  title: 'Motvin Inspirations — Search UI screens, flows and patterns',
  description: 'A visual search engine for product design. Find screens, study flows, analyze UI and extract components.',
};

export default function InspirationsLayout({ children }: { children: ReactNode }) {
  return <InspirationsShell>{children}</InspirationsShell>;
}

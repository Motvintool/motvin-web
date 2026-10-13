import type { Metadata } from 'next';
import { metadata as aboutMetadata } from '../about/page';

/**
 * /about-us shows the About page too. The page briefly lived here with a
 * permanent redirect from /about, which browsers remember; this keeps those
 * visitors from landing on a missing page. /about stays the real address.
 */
export const metadata: Metadata = {
  ...aboutMetadata,
  alternates: { canonical: '/about' },
};

export { default } from '../about/page';

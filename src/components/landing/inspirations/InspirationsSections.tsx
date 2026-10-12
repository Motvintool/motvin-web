'use client';

import { AppLogoStrip } from './AppLogoStrip';
import { BuddySection } from './BuddySection';
import { FeatureGrid } from './FeatureGrid';
import { FeatureStack } from './FeatureStack';
import { ScrollStatement } from './ScrollStatement';
import { SearchStory } from './SearchStory';
import { useLandingLibrary } from './useLandingLibrary';

/** The Motvin Inspirations sections under the landing hero, sharing one load of the library. */
export function InspirationsSections() {
  const { apps, counts } = useLandingLibrary();

  return (
    <div className="lpi">
      <AppLogoStrip apps={apps} />
      <SearchStory apps={apps} />
      <ScrollStatement />
      <FeatureStack apps={apps} counts={counts} />
      <FeatureGrid apps={apps} />
      <BuddySection apps={apps} />
    </div>
  );
}
